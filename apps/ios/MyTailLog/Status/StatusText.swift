import Foundation

// What Status says about the server's snapshot (06 M-STATUS-*, 02 §5.8, 12 §4–5). Pure, so it is unit-tested.
// The server writes the Verdict; this is per-row wording in the same English. Port of Android's StatusText.kt:
// keep the two in step so both phones say the same thing.

/// Calendar dates as the engine sends them ("2026-11-18"), worked in UTC so a date never shifts by a zone.
enum Day {
    static let calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }()
    static let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    static let fullMonths = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
                             "October", "November", "December"]

    static func parts(_ d: String) -> (y: Int, m: Int, d: Int) {
        let p = d.split(separator: "-").compactMap { Int($0) }
        return p.count == 3 ? (p[0], p[1], p[2]) : (1970, 1, 1)
    }

    static func date(_ d: String) -> Date {
        let p = parts(d)
        return calendar.date(from: DateComponents(year: p.y, month: p.m, day: p.d))!
    }

    static func string(_ date: Date) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }

    static func between(_ from: String, _ to: String) -> Int {
        calendar.dateComponents([.day], from: date(from), to: date(to)).day!
    }

    static func adding(_ days: Int, to d: String) -> String {
        string(calendar.date(byAdding: .day, value: days, to: date(d))!)
    }

    /// "Dec 31, 2026" (12 §4).
    static func format(_ d: String) -> String {
        let p = parts(d)
        return "\(months[p.m - 1]) \(p.d), \(p.y)"
    }

    /// "Dec 12" within 120 days, "Dec 2027" within 540, else the year (the engine's fmtAbout).
    static func about(_ d: String, today: String) -> String {
        let p = parts(d), n = between(today, d)
        return n <= 120 ? "\(months[p.m - 1]) \(p.d)" : n <= 540 ? "\(months[p.m - 1]) \(p.y)" : "\(p.y)"
    }

    /// The server's computedAt ("2026-11-18T22:54:40.168Z").
    static func instant(_ s: String?) -> Date? {
        guard let s else { return nil }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)
    }
}

/// Phone home groups (06 M-STATUS-01) in order; "Next 60 days" is the deterministic near horizon (W-STATUS-01).
enum DueGroup: Int, Comparable, CaseIterable {
    case overdue, near, later, noRecord

    static func < (a: DueGroup, b: DueGroup) -> Bool { a.rawValue < b.rawValue }

    var title: String {
        switch self {
        case .overdue: "Overdue"
        case .near: "Next 60 days"
        case .later: "Later"
        case .noRecord: "No record"
        }
    }
}

enum MarkKind { case current, dueSoon, overdue, noRecord }
enum TrustLevel { case aiRead, confirmed, signed }
enum LimitKind { case calendar, hours, document }

/// One limit on the meta line; `first` only when the item has both and this one bites first (02 §5.6).
struct LimitText: Equatable {
    let kind: LimitKind
    let text: String
    let about: String?
    let first: Bool
}

private func plural(_ n: Int, _ one: String, _ many: String) -> String { "\(n) \(n == 1 ? one : many)" }

/// 12 §5: one decimal, thousands separator.
func hours1(_ x: Double) -> String {
    x.formatted(.number.precision(.fractionLength(1)).grouping(.automatic).locale(Locale(identifier: "en_US")))
}

/// "4,222.1 tach".
func meterValue(_ x: Double, _ meter: String) -> String { "\(hours1(x)) \(meter)" }

/// 12 §4 status words.
func statusWord(_ status: String) -> String {
    switch status {
    case "overdue": "Overdue"
    case "due_soon": "Due soon"
    case "no_record": "No record"
    default: "Current"
    }
}

func markKind(_ status: String) -> MarkKind {
    switch status {
    case "overdue": .overdue
    case "due_soon": .dueSoon
    case "no_record": .noRecord
    default: .current
    }
}

func bookName(_ line: String?) -> String? {
    guard let line else { return nil }
    return line == "prop" ? "Propeller" : line.prefix(1).uppercased() + line.dropFirst()
}

func trustLevel(_ trust: String?, signer: String?) -> TrustLevel {
    trust == "ai_read" ? .aiRead : signer != nil ? .signed : .confirmed
}

/// 12 §7 trust words.
func trustWords(_ level: TrustLevel, signer: String?) -> String {
    switch level {
    case .aiRead: "Read by AI, not yet confirmed"
    case .confirmed: "Confirmed by you"
    case .signed: signer.map { "Signed by \($0)" } ?? "Signed by a mechanic"
    }
}

extension DueItem {
    func group(today: String) -> DueGroup {
        switch status {
        case "overdue": return .overdue
        case "no_record": return .noRecord
        case "due_soon": return .near // due soon is always listed near, whatever its distance
        default:
            let in60 = Day.adding(60, to: today)
            let near = (calendar.map { $0.daysLeft <= 60 } ?? false)
                || (hours.map { $0.remaining <= 25 || ($0.projectedDate.map { $0 <= in60 } ?? false) } ?? false)
            return near ? .near : .later
        }
    }

    /// The overdue slip: "lapsed 7 days ago", or "2.3 h over" when only the hours limit has passed. Nil when not overdue.
    var overdueText: String? {
        guard status == "overdue" else { return nil }
        if let c = calendar, c.daysLeft < 0 { return "lapsed \(plural(-c.daysLeft, "day", "days")) ago" }
        if let h = hours, h.remaining <= 0 { return "\(hours1(-h.remaining)) h over" }
        return "Overdue"
    }

    /// The right column of a DueRow: "43 days" or "9.7 h" for the limit that bites first. Nil for overdue and no record.
    var rowValue: String? {
        if status == "overdue" || status == "no_record" { return nil }
        if first == "hours", let h = hours { return "\(hours1(h.remaining)) h" }
        return calendar.map { plural($0.daysLeft, "day", "days") }
    }

    func limits(today: String) -> [LimitText] {
        let both = calendar != nil && hours != nil
        var out: [LimitText] = []
        if let c = calendar {
            out.append(LimitText(kind: source == "document" ? .document : .calendar, text: Day.format(c.dueDate),
                                 about: nil, first: both && first == "calendar"))
        }
        if let h = hours {
            out.append(LimitText(kind: .hours, text: meterValue(h.dueAt, h.meter),
                                 about: h.projectedDate.map { "about \(Day.about($0, today: today))" }, first: both && first == "hours"))
        }
        return out
    }

    /// Scope words for the meta line.
    var qualifiers: [String] { (ifrOnly ? ["IFR only"] : []) + (advisory ? ["advisory"] : []) }

    /// One phrase VoiceOver reads for a row (11 §6): "Annual, overdue, lapsed 110 days ago, due Jul 31, 2026, Airframe".
    func spoken(today: String) -> String {
        let left = overdueText ?? rowValue.map { first == "hours" ? "\($0) left" : "in \($0)" }
        let due = limits(today: today)
            .map { "due \($0.text)\($0.about.map { ", \($0)" } ?? "")\($0.first ? ", comes first" : "")" }
            .joined(separator: " or ")
        return [label, statusWord(status).lowercased(), left, due.isEmpty ? nil : due,
                qualifiers.isEmpty ? nil : qualifiers.joined(separator: ", "), bookName(line)]
            .compactMap { $0 }.joined(separator: ", ")
    }

    /// Item detail's Due row for the calendar limit (12 §4): "Dec 31, 2026 · 43 days" / "end of December 2026 (Dec 31) · …".
    var calendarDue: String? {
        guard let c = calendar else { return nil }
        let p = Day.parts(c.dueDate)
        let monthEnd = Day.calendar.range(of: .day, in: .month, for: Day.date(c.dueDate))!.count == p.d
        let date = c.calendarMonthRule && monthEnd
            ? "end of \(Day.fullMonths[p.m - 1]) \(p.y) (\(Day.months[p.m - 1]) \(p.d))" : Day.format(c.dueDate)
        let left = c.daysLeft < 0 ? "lapsed \(plural(-c.daysLeft, "day", "days")) ago"
            : c.daysLeft == 0 ? "today" : plural(c.daysLeft, "day", "days")
        return "\(date) · \(left)"
    }

    /// Item detail's Due row for the hours limit: "4,222.1 tach · 9.7 h left".
    var hoursDue: String? {
        guard let h = hours else { return nil }
        let left = h.remaining <= 0 ? "\(hours1(-h.remaining)) h over" : "\(hours1(h.remaining)) h left"
        return "\(meterValue(h.dueAt, h.meter)) · \(left)"
    }

    /// 12 §4 projection: "about Dec 12 at your recent 1.4 h a week", the basis named when not the tach's last 90 days.
    func projection(rate: StatusSnapshot.Rate, today: String) -> String? {
        guard let h = hours, h.remaining > 0 else { return nil }
        guard let date = h.projectedDate else { return "\(hours1(h.remaining)) h left, no recent flying to date it" }
        let has = { (word: String) in h.projectionBasis.contains(word) || rate.basis.contains(word) }
        let basis = has("estimate") ? " (from your estimate)" : has("hobbs") ? " (from hobbs)" : has("year") ? " (from the past year)" : ""
        return "about \(Day.about(date, today: today)) at your recent \(hours1(rate.hoursPerWeek)) h a week\(basis)"
    }

    /// "Jul 20, 2025 at 4,168.3 tach".
    var lastDoneText: String? {
        guard let done = lastDone, let date = done.date else { return nil }
        return Day.format(date) + (done.hours.map { " at \(meterValue($0, hours?.meter ?? "tach"))" } ?? "")
    }
}

extension StatusSnapshot {
    /// Non-empty groups in order, items in the server's order (worst first).
    var grouped: [(group: DueGroup, items: [DueItem])] {
        let byGroup = Dictionary(grouping: items) { $0.group(today: today) }
        return DueGroup.allCases.compactMap { g in byGroup[g].map { (g, $0) } }
    }

    /// Nothing tracked yet (and not mid-setup): the empty Verdict of 06 M-STATUS-01.
    var nothingTracked: Bool { items.isEmpty && situation != "setup" }

    /// How many rows the phone home lists: all but Later, of which only the first (06 M-STATUS-01).
    var shownOnHome: Int {
        situation == "all_clear" ? min(3, items.count)
            : grouped.reduce(0) { $0 + ($1.group == .later ? min(1, $1.items.count) : $1.items.count) }
    }

    /// M-STATUS-02 all clear: "Tach 4,212.4, read Jul 10, 2026. Flying about 1.4 hours a week."
    var meterLine: String? {
        guard let m = meters[rate.meter], let value = m.stitched, let asOf = m.asOf else { return nil }
        // 06 M-STATUS-02 words it meter first ("Tach 4231.6"); Android's "4,212.4 tach" upper-cases a digit.
        let line = "\(rate.meter.prefix(1).uppercased() + rate.meter.dropFirst()) \(hours1(value)), read \(Day.format(asOf))."
        return rate.hoursPerWeek > 0 ? "\(line) Flying about \(hours1(rate.hoursPerWeek)) hours a week." : line
    }

    /// The freshness line (06 M-STATUS-01), only when the snapshot is more than 6 hours old.
    func freshness(now: Date = .now, zone: TimeZone = .current) -> String? {
        guard let at = Day.instant(computedAt), now.timeIntervalSince(at) > 6 * 3600 else { return nil }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US")
        f.timeZone = zone
        f.dateFormat = "MMM d, h:mm a"
        return "From records synced \(f.string(from: at))."
    }

    /// 12 §7 line.undated: "Not on the line: Oil change, needs a date".
    var undatedLines: [String] {
        let byKey = Dictionary(items.map { ($0.key, $0) }, uniquingKeysWith: { a, _ in a })
        return lineAhead.undated.compactMap { byKey[$0]?.label }.map { "Not on the line: \($0), needs a date" }
    }

    /// The LineAhead as one VoiceOver element (06 M-STATUS-01 Accessibility).
    var lineSummary: String {
        let months = Day.calendar.dateComponents([.month], from: Day.date(lineAhead.from), to: Day.date(lineAhead.to)).month!
        let window = months >= 2 ? "next \(months) months" : "next \(Day.between(lineAhead.from, lineAhead.to)) days"
        let byKey = Dictionary(items.map { ($0.key, $0) }, uniquingKeysWith: { a, _ in a })
        let rings = lineAhead.rings.compactMap { r in
            byKey[r.itemKey].map { "\($0.label), \(statusWord(r.status).lowercased())\(r.status == "overdue" ? "" : ", \(Day.format(r.date))")" }
        }
        return "Line ahead, \(window). " + (rings.isEmpty ? "Nothing on the line." : rings.joined(separator: ". ") + ".")
    }
}

/// Where a date sits across the LineAhead, 0...1: a short solid past stub, then today, then the window (02 §4.5).
enum LineGeometry {
    static let past = 0.04

    static func x(_ date: String, _ ahead: StatusSnapshot.LineAhead) -> Double {
        let span = max(1, Day.between(ahead.from, ahead.to))
        let d = min(max(Day.between(ahead.from, date), 0), span)
        return past + (1 - past) * Double(d) / Double(span)
    }

    /// Axis labels: "Today", one mid month, the end month with its year ("Nov 2027").
    static func ticks(_ ahead: StatusSnapshot.LineAhead) -> [(x: Double, text: String)] {
        let mid = Day.parts(Day.adding(Day.between(ahead.from, ahead.to) / 2, to: ahead.from))
        let midDay = String(format: "%04d-%02d-01", mid.y, mid.m)
        let to = Day.parts(ahead.to)
        return [(past, "Today"), (x(midDay, ahead), Day.months[mid.m - 1]), (1, "\(Day.months[to.m - 1]) \(to.y)")]
    }

    /// The four lines drawn, top to bottom; the Other logbook is never drawn (06 M-STATUS-01).
    static let lines = ["airframe", "engine", "propeller", "avionics"]

    static func row(_ line: String) -> Int? { lines.firstIndex(of: line == "prop" ? "propeller" : line) }
}

import Foundation
@preconcurrency import MyTailLogCore

// Plan ahead and visits in words and geometry (06 M-STATUS-03/04, 12). The rule itself is core's planDate, run on the
// phone through the framework so it works offline. Port of Android's PlanText.kt: keep the two in step.

// MARK: Visits (09 §2.5, §3.5)

struct Visits: Decodable, Equatable, Sendable {
    var suggested: [VisitView] = []
    var planned: [VisitView] = []

    init(suggested: [VisitView] = [], planned: [VisitView] = []) { self.suggested = suggested; self.planned = planned }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        suggested = try c.decodeIfPresent([VisitView].self, forKey: .suggested) ?? []
        planned = try c.decodeIfPresent([VisitView].self, forKey: .planned) ?? []
    }
    private enum CodingKeys: String, CodingKey { case suggested, planned }

    var all: [VisitView] { planned + suggested }
}

struct VisitItem: Decodable, Equatable, Sendable {
    let key: String
    let status: String
    let done: Bool
}

/// A suggested visit (`id` nil, `suggestionKey` set) or a booking.
struct VisitView: Decodable, Equatable, Sendable {
    var id: String?
    let suggestionKey: String?
    var status: String
    var weekOf: String
    var visitDate: String?
    var providerIds: [String]
    let items: [VisitItem]

    var open: [VisitItem] { items.filter { !$0.done } }
}

// MARK: planDate's answer (apps/core PlanDate.kt)

struct PlanResult: Decodable, Equatable, Sendable {
    struct Lapse: Decodable, Equatable, Sendable {
        let key: String
        /// "already" or "by_date".
        let when: String
        let dueDate: String?
        /// A booking's id, or "sugg:" and the suggestion key.
        let coveredByVisit: String?
    }
    struct Spare: Decodable, Equatable, Sendable { let days: Int?; let hours: Double? }
    struct StillIn: Decodable, Equatable, Sendable { let key: String; let spare: Spare }
    struct Cannot: Decodable, Equatable, Sendable { let key: String; let reason: String }
    struct Meters: Decodable, Equatable, Sendable { let tach: Double?; let hobbs: Double? }

    let date: String
    let hoursPerWeek: Double?
    let hoursUntil: Double?
    let metersOnDate: Meters
    let lapsed: [Lapse]
    let lapses: [Lapse]
    let stillInDate: [StillIn]
    let cannotCheck: [Cannot]

    /// Everything lapsed by the plan date (already, then by date), in due order.
    var lapsedBy: [Lapse] { lapsed + lapses }
}

/// core's planDate over the snapshot JSON; `visits` (the 24-month list, raw) replaces the snapshot's when given.
func planDate(status: Data, visits: String?, date: String, hoursPerWeek: Double?) -> PlanResult? {
    let json = PlanBridgeKt.planDateJson(statusJson: String(decoding: status, as: UTF8.self), visitsJson: visits, date: date,
                                         hoursPerWeek: hoursPerWeek.map { KotlinDouble(value: $0) })
    return try? JSONDecoder().decode(PlanResult.self, from: Data(json.utf8))
}

// MARK: The horizon

/// 14-decisions.md D5: a fixed 24-month horizon whose first six months are drawn at double scale.
struct PlanScale {
    let today: String
    let end: String
    private let six: Double
    private let total: Double
    private let width: Double

    init(today: String) {
        self.today = today
        end = addMonths(24, today)
        six = Double(Day.between(today, addMonths(6, today)))
        total = Double(Day.between(today, end))
        width = 2 * six + (total - six)
    }

    /// 0 at today, 1 at the horizon's end.
    func x(_ date: String) -> Double {
        let d = min(max(Double(Day.between(today, date)), 0), total)
        return (2 * min(d, six) + max(0, d - six)) / width
    }

    /// The day under `x` (snaps to days), never before tomorrow.
    func date(_ x: Double) -> String {
        let u = min(max(x, 0), 1) * width
        let d = u <= 2 * six ? u / 2 : six + (u - 2 * six)
        return Day.adding(Int(min(max(d.rounded(), 1), total)), to: today)
    }

    /// Axis labels: "Today", the end of the double-scale stretch, a year on, the end ("Nov 2028").
    var ticks: [(x: Double, text: String)] {
        let m6 = addMonths(6, today), m12 = addMonths(12, today)
        return [(0, "Today"), (x(m6), monthShort(m6)), (x(m12), monthShort(m12)), (1, "\(monthShort(end)) \(Day.parts(end).y)")]
    }
}

func addMonths(_ n: Int, _ d: String) -> String { Day.string(Day.calendar.date(byAdding: .month, value: n, to: Day.date(d))!) }
private func monthShort(_ d: String) -> String { Day.months[Day.parts(d).m - 1] }

/// The Monday of `date`'s week: visits are booked by week (09 §2.5).
func mondayOf(_ date: String) -> String {
    let weekday = Day.calendar.component(.weekday, from: Day.date(date)) // 1 Sunday … 7 Saturday
    return Day.adding(-((weekday + 5) % 7), to: date)
}

// MARK: Words

private let words = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]

/// 12 §numbers: one to ten in words, then digits.
func word(_ n: Int) -> String { n >= 0 && n < words.count ? words[n] : "\(n)" }

/// The suggestion's or booking's key for a route: the visit id, or "s:" and the suggestion key.
func visitKey(_ v: VisitView) -> String { v.id ?? "s:\(v.suggestionKey ?? "")" }

func findVisit(_ visits: [VisitView], _ key: String) -> VisitView? { visits.first { visitKey($0) == key } }

/// "Dec 7" (the Monday of the visit's week, or its booked day).
func visitDay(_ v: VisitView, today: String = todayISO()) -> String { dayDate(v.visitDate ?? v.weekOf, today: today) }

/// How planDate names a covering visit: a booking's id, or "sugg:" and the suggestion key.
func coveringVisit(_ covered: String?, _ visits: [VisitView]) -> VisitView? {
    guard let c = covered else { return nil }
    return visits.first { c.hasPrefix("sugg:") ? $0.id == nil && $0.suggestionKey == String(c.dropFirst(5)) : $0.id == c }
}

/// The statement under the scrubber and the date to set in bold (UTF-16 [from, to)):
/// "By Mar 1, at about tach 4256, five items lapse unless the two visits happen." / "By Mar 1, nothing tracked lapses."
func planStatement(_ p: PlanResult, today: String) -> (text: String, emphasis: [[Int]]) {
    let head = "By \(dayDate(p.date, today: today))"
    let bold = [[3, head.utf16.count]]
    let all = p.lapsedBy
    if all.isEmpty { return ("\(head), nothing tracked lapses.", bold) }
    let tach = p.metersOnDate.tach.map { ", at about tach \(Int($0.rounded()))" } ?? ""
    let n = all.count
    let visits = Set(all.compactMap(\.coveredByVisit)).count
    let unless = all.contains { $0.coveredByVisit == nil } ? (n == 1 ? " unless it is done" : " unless they are done")
        : visits == 1 ? " unless the visit happens" : " unless the \(word(visits)) visits happen"
    let items = n == 1 ? "one item lapses" : "\(word(n)) items lapse"
    return ("\(head)\(tach), \(items)\(unless).", bold)
}

/// "Close behind: seat-rail AD, 11.9 h left on Mar 1." The item still in date with the least to spare, if any.
func closeBehind(_ p: PlanResult, _ items: [DueItem], today: String) -> String? {
    let rate = p.hoursPerWeek
    func viaHours(_ s: PlanResult.Spare) -> Double? { s.hours.flatMap { h in rate.flatMap { $0 > 0 ? h / ($0 / 7) : nil } } }
    func least(_ s: PlanResult.StillIn) -> Double { [s.spare.days.map(Double.init), viaHours(s.spare)].compactMap { $0 }.min() ?? .greatestFiniteMagnitude }
    guard let next = p.stillInDate.min(by: { least($0) < least($1) }),
          let label = items.first(where: { $0.key == next.key })?.label else { return nil }
    let days = next.spare.days, hours = next.spare.hours, vh = viaHours(next.spare)
    let left: String
    if let hours, days == nil || (vh != nil && vh! < Double(days!)) { left = "\(hours1(hours)) h" }
    else if let days { left = days == 1 ? "1 day" : "\(days) days" }
    else { return nil }
    return "Close behind: \(label), \(left) left on \(dayDate(p.date, today: today))."
}

/// "One visit, four items: three before they come due, and the VOR check that has lapsed."
func visitStatement(_ v: VisitView, _ items: [DueItem]) -> String {
    let inIt = v.open
    let n = inIt.count
    if n == 0 { return "Every item in this visit is done." }
    let lapsed = inIt.filter { $0.status == "overdue" }
    let ahead = n - lapsed.count
    let head = "One visit, \(n == 1 ? "one item" : "\(word(n)) items")"
    let come = ahead == 1 ? "it comes" : "they come"
    if lapsed.isEmpty { return "\(head), \(n == 1 ? "before it comes due" : "all before they come due")." }
    if ahead == 0 { return "\(head), \(n == 1 ? "which has lapsed" : "all lapsed")." }
    if lapsed.count == 1 {
        let label = items.first { $0.key == lapsed[0].key }?.label
        let name = label.map { $0.prefix(1).lowercased() + $0.dropFirst() } ?? "item"
        return "\(head): \(word(ahead)) before \(come) due, and the \(name) that has lapsed."
    }
    return "\(head): \(word(ahead)) before \(come) due, and \(word(lapsed.count)) that have lapsed."
}

/// The status word at the top of a visit (06 M-STATUS-04).
func visitStatusWord(_ status: String) -> String {
    switch status {
    case "planned": "Planned"
    case "in_shop": "In the shop"
    case "awaiting_records": "Awaiting records"
    case "done": "Done"
    case "cancelled": "Cancelled"
    default: "Suggested"
    }
}

/// "AeroCheck Instruments did it last, on Dec 3, 2024."
func lastDoneLine(signer: String?, date: String?) -> String? {
    switch (signer, date) {
    case let (s?, d?): "\(s) did it last, on \(longDate(d))."
    case let (nil, d?): "Last done \(longDate(d))."
    default: nil
    }
}

/// What goes to the shop with the link (M-STATUS-04 Send): tail, owner, each item with its due date and the page that
/// last did it. Plain text for any mail or message app.
func visitMessage(tail: String, owner: String?, _ v: VisitView, _ items: [DueItem], url: String) -> String {
    let lines = v.open.compactMap { vi in items.first { $0.key == vi.key } }.map { i -> String in
        let due = [i.calendar.map { "due \(longDate($0.dueDate))" }, i.hours.map { "due \($0.meter) \(hours1($0.dueAt))" }].compactMap { $0 }.joined(separator: ", ")
        let last = i.lastDone.map { d in [d.date.map { "last done \(longDate($0))" }, d.signer.map { "by \($0)" }, d.pageLabel].compactMap { $0 }.joined(separator: " ") }
        let parts = [due, last ?? ""].filter { !$0.isEmpty }
        return "- \(i.label)" + (parts.isEmpty ? "" : ": " + parts.joined(separator: "; "))
    }
    var s = "\(tail), visit the week of \(longDate(v.weekOf))"
    if let owner { s += " (owner \(owner))" }
    s += ".\n\n"
    for l in lines { s += l + "\n" }
    s += "\nThe records for these items: \(url)\n"
    return s
}

// MARK: Remind me (M-STATUS-03 primary when no visit covers the first lapse; `reminder.snooze`, 09 §5.3)

/// The due cycle a snooze belongs to (apps/web lib/reminders.ts dueSignature): "2027-03-01|4256".
func dueSignature(_ item: DueItem) -> String {
    "\(item.calendar?.dueDate ?? "")|\(item.hours.map { jsNumber($0.dueAt) } ?? "")"
}

/// A number as JavaScript prints it ("4256", "4256.5").
func jsNumber(_ x: Double) -> String { x == x.rounded() && abs(x) < 1e15 ? String(Int(x)) : String(x) }

/// When "Remind me" brings the items back: a week before the plan date at 09:00 local ("Remind me Feb 22"), or, when
/// that has passed, the coming Friday at 09:00 ("Remind me Friday"; next week's when today is Friday, as D7).
func remindAt(planDate: String, now: Date = .now, calendar: Calendar = .current) -> (label: String, at: Date) {
    let p = Day.parts(Day.adding(-7, to: planDate))
    if let weekBefore = calendar.date(from: DateComponents(year: p.y, month: p.m, day: p.d, hour: 9)), weekBefore > now {
        return ("Remind me \(Day.months[p.m - 1]) \(p.d)", weekBefore)
    }
    let start = calendar.startOfDay(for: now)
    let ahead = (6 - calendar.component(.weekday, from: start) + 7) % 7 // Friday is weekday 6
    let friday = calendar.date(byAdding: .day, value: ahead == 0 ? 7 : ahead, to: start)!
    return ("Remind me Friday", calendar.date(bySettingHour: 9, minute: 0, second: 0, of: friday)!)
}

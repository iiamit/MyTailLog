import Foundation

// Wording for Maintenance, Aircraft and Documents (12 §4, §5), pure so the unit tests pin it.
// Port of Android's MaintText.kt: keep the two in step so both phones say the same thing.

/// Today as the engine writes dates ("2026-11-19"), in UTC like `Day`.
func todayISO(_ now: Date = Date()) -> String { Day.string(now) }

/// "Jul 14, 2026".
func longDate(_ iso: String) -> String { iso.count >= 10 ? Day.format(String(iso.prefix(10))) : iso }

/// "Oct 21" this year, else "Oct 21, 2024".
func dayDate(_ iso: String, today: String = todayISO()) -> String {
    guard iso.count >= 10 else { return iso }
    let p = Day.parts(String(iso.prefix(10)))
    return p.y == Day.parts(today).y ? "\(Day.months[p.m - 1]) \(p.d)" : Day.format(String(iso.prefix(10)))
}

/// A number as typed, or nil: "4214.8" stays 4214.8; a comma decimal is accepted.
func num(_ text: String) -> Double? {
    let t = text.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
    return t.isEmpty ? nil : Double(t)
}

func fmt1(_ x: Double?) -> String { x.map { String(format: "%.1f", $0) } ?? "" }
func fmtNum(_ x: Double?) -> String {
    guard let x else { return "" }
    return x == x.rounded() && abs(x) < 1e9 ? String(Int(x)) : String(x)
}
func fmt2(_ x: Double?) -> String {
    x.map { $0.formatted(.number.precision(.fractionLength(2)).grouping(.automatic).locale(Locale(identifier: "en_US"))) } ?? "—"
}
func fmt3(_ x: Double?) -> String { x.map { String(format: "%.3f", $0) } ?? "—" }

/// Squawk severity as the owner reads it (C-SQ-01): low · medium · high are Low · Watch · Ground.
let severities = ["low", "medium", "high"]

func severityWord(_ s: String?) -> String { s == "high" ? "Ground" : s == "medium" ? "Watch" : "Low" }

/// Ground a slip, Watch a ring, Low a dot: the shape says it as well as the word (status never colour-only).
func severityMark(_ s: String?) -> MarkKind { s == "high" ? .overdue : s == "medium" ? .dueSoon : .current }

let severityMeanings = [("Low", "Fix at the next convenient visit"), ("Watch", "Look at it before each flight"),
                        ("Ground", "You won't fly until it is looked at")]

func ago(_ iso: String?, today: String = todayISO()) -> String? {
    guard let iso, iso.count >= 10 else { return nil }
    let n = Day.between(String(iso.prefix(10)), today)
    if n <= 0 { return "today" }
    if n == 1 { return "yesterday" }
    if n < 60 { return "\(n) days ago" }
    return dayDate(iso, today: today)
}

private func photosWord(_ n: Int) -> String? { n <= 0 ? nil : n == 1 ? "1 photo" : "\(n) photos" }

/// "Watch · 10 days ago · Dana · 1 photo" (M-MAINT-05).
func squawkMeta(severity: String?, reportedAt: String?, reporter: String?, photos: Int, today: String = todayISO()) -> String {
    let first = reporter?.split(separator: " ").first.map(String.init)
    return [severityWord(severity), ago(reportedAt, today: today), first, photosWord(photos)].compactMap { $0 }.joined(separator: " · ")
}

/// "Reported Oct 21 by Dana · 1 photo" (M-MAINT-02).
func squawkReported(reportedAt: String?, reporter: String?, photos: Int, today: String = todayISO()) -> String {
    let by = reporter?.split(separator: " ").first.map { " by \($0)" } ?? ""
    return [reportedAt.map { "Reported \(dayDate($0, today: today))\(by)" }, photosWord(photos)].compactMap { $0 }.joined(separator: " · ")
}

/// The AD's mark and word: Not applicable and one-time Complied are settled; the rest come from the due list.
func adStatus(_ status: String?, recurring: Bool, due: DueItem?) -> (MarkKind, String) {
    if status == "not_applicable" { return (.noRecord, "Not applicable") }
    if status == "superseded" { return (.noRecord, "Superseded") }
    if !recurring && (status == "complied" || status == "previously_complied") { return (.current, "Complied") }
    if let due { return (markKind(due.status), statusWord(due.status)) }
    if status == "open" { return (.noRecord, "No record") }
    return (.current, "Current")
}

private func every(_ hours: Double?, _ months: Int?) -> String? {
    let parts = [hours.map { "\(fmtNum($0)) hours" }, months.map { $0 == 1 ? "month" : "\($0) months" }].compactMap { $0 }
    return parts.isEmpty ? nil : "every " + parts.joined(separator: " or ")
}

/// "Recurring, every 100 hours. Complied Jul 14, 2026 at 4168.3; next at tach 4268.3, 55.9 h."
/// One-time: "One-time. Complied Jul 14, 2026." Not applicable: "Reason: …".
func adSentence(status: String?, recurring: Bool, intervalHours: Double?, intervalMonths: Int?, compliedDate: String?,
                compliedHours: Double?, nextDate: String?, nextHours: Double?, reason: String?, tach: Double?) -> String {
    if status == "not_applicable" {
        let r = "Reason: \(reason ?? "not given.")"
        return r.hasSuffix(".") ? r : r + "."
    }
    let head = recurring ? "Recurring\(every(intervalHours, intervalMonths).map { ", \($0)" } ?? "")." : "One-time."
    let complied = compliedDate.map { d in " Complied \(longDate(d))\(compliedHours.map { " at \(fmt1($0))" } ?? "")" }
    var next: String?
    if recurring {
        let parts = [nextHours.map { h in "tach \(fmt1(h))\(tach.map { ", \(fmt1(h - $0)) h" } ?? "")" }, nextDate.map { "on \(longDate($0))" }].compactMap { $0 }
        next = parts.isEmpty ? nil : parts.joined(separator: " or ")
    }
    switch (complied, next) {
    case let (c?, n?): return "\(head)\(c); next at \(n)."
    case let (c?, nil): return "\(head)\(c)."
    case let (nil, n?): return "\(head) Next at \(n)."
    default: return "\(head) No compliance recorded yet."
    }
}

/// Sort order of M-MAINT-01: overdue, due soon, no record, current, complied one-time, not applicable.
func adRank(_ word: String) -> Int {
    switch word {
    case "Overdue": 0
    case "Due soon": 1
    case "No record": 2
    case "Current": 3
    case "Complied": 4
    default: 5
    }
}

/// "Required · every 12 calendar months" / "Advisory · every 50 hours" (M-MAINT-04).
func itemRule(regulatory: Bool, months: Int?, hours: Double?, calendarMonth: Bool) -> String {
    let m = months.map { calendarMonth ? "\($0) calendar months" : $0 == 1 ? "month" : "\($0) months" }
    let h = hours.map { "\(fmtNum($0)) hours" }
    let e = [m, h].compactMap { $0 }.joined(separator: " or ")
    return (regulatory ? "Required" : "Advisory") + (e.isEmpty ? "" : " · every \(e)")
}

/// Item kinds the editor offers, in 06 M-MAINT-04's order.
let itemKinds = [
    ("annual", "Annual inspection"), ("hundred_hour", "100-hour inspection"), ("transponder", "Transponder"),
    ("pitot_static", "Pitot-static and altimeter"), ("elt", "ELT inspection"), ("elt_battery", "ELT battery"),
    ("vor_check", "VOR check"), ("oil_change", "Oil and filter change"), ("engine_tbo", "Engine TBO"),
    ("prop_overhaul", "Propeller overhaul"), ("other", "Something else"),
]

let calendarMonthKinds: Set<String> = ["annual", "transponder", "pitot_static", "elt"]

/// Next due from a last-done date and hours (the engine's rule: calendar-month kinds run to the month's end).
func nextDue(kind: String, lastDate: String?, lastHours: Double?, months: Int?, hours: Double?) -> (date: String?, hours: Double?) {
    var date: String?
    if let lastDate, lastDate.count >= 10, let months,
       var d = Day.calendar.date(byAdding: .month, value: months, to: Day.date(String(lastDate.prefix(10)))) {
        if calendarMonthKinds.contains(kind), let range = Day.calendar.range(of: .day, in: .month, for: d) {
            d = Day.calendar.date(bySetting: .day, value: range.count, of: d) ?? d
        }
        date = Day.string(d)
    }
    return (date, lastHours.flatMap { l in hours.map { l + $0 } })
}

/// The editor's live preview: "Next due works out to Jul 31, 2027, or tach 4268.3, whichever is first."
/// With a flying rate the hours limit gets a date, and the earlier one is named.
func nextDuePreview(kind: String, lastDate: String?, lastHours: Double?, months: Int?, hours: Double?, meter: String,
                    now: Double?, hoursPerDay: Double?, today: String = todayISO()) -> String? {
    let (date, at) = nextDue(kind: kind, lastDate: lastDate, lastHours: lastHours, months: months, hours: hours)
    if date == nil && at == nil { return nil }
    let base = "Next due works out to " + [date.map(longDate), at.map { "\(meter) \(fmt1($0))" }].compactMap { $0 }.joined(separator: ", or ")
    guard let date, let at else { return base + "." }
    var hoursDate: String?
    if let now, let hoursPerDay, hoursPerDay > 0 { hoursDate = Day.adding(max(Int((at - now) / hoursPerDay), 0), to: today) }
    let first = hoursDate.map { $0 < date ? "the hours first, about \(longDate($0))" : "the date first" } ?? "whichever is first"
    return "\(base), \(first)."
}

/// What a meter reading says about where it came from (M-AIRCRAFT-02).
func readingSource(_ source: String?) -> String {
    switch source {
    case "manual": "logged by you"
    case "tach_photo": "from a photo of the tach"
    case "myflightbook": "from MyFlightBook"
    case "adsb": "from ADS-B"
    case "log_entry", "entry", "extraction": "from a log entry"
    case nil: "logged"
    default: "from \(source!.replacingOccurrences(of: "_", with: " "))"
    }
}

func editableReading(_ source: String?) -> Bool { source == "manual" || source == "tach_photo" }

/// Hours per quart over top-offs with a tach: the hours flown across them over the quarts after the first.
func hoursPerQuart(_ adds: [(tach: Double, quarts: Double)]) -> Double? {
    let s = adds.sorted { $0.tach < $1.tach }
    guard s.count >= 2 else { return nil }
    let quarts = s.dropFirst().reduce(0) { $0 + $1.quarts }
    return quarts > 0 ? (s.last!.tach - s.first!.tach) / quarts : nil
}

/// Hours between consecutive top-offs per quart added, the last `n` intervals (the bar chart).
func burnIntervals(_ adds: [(tach: Double, quarts: Double)], n: Int = 12) -> [Double] {
    let s = adds.sorted { $0.tach < $1.tach }
    return Array(zip(s, s.dropFirst()).map { a, b in b.quarts > 0 ? (b.tach - a.tach) / b.quarts : 0 }.suffix(n))
}

/// Moment from weight and arm, when the moment wasn't given (W&B "Moment is computed").
func moment(_ weight: Double?, _ arm: Double?, given: Double? = nil) -> Double? {
    given ?? weight.flatMap { w in arm.map { w * $0 } }
}

/// The four carry-aboard documents (AROW) in M-DOCS-01's order.
let carryAboard = ["airworthiness_cert", "registration", "poh_afm", "weight_balance"]

let docTypes = [
    ("registration", "Registration"), ("airworthiness_cert", "Airworthiness certificate"), ("poh_afm", "Operating handbook"),
    ("weight_balance", "Weight and balance"), ("insurance", "Insurance policy"), ("form_337", "Form 337"), ("form_8130_3", "8130-3"),
    ("stc", "STC"), ("radio_license", "Radio licence"), ("ica", "ICA"), ("maintenance_manual", "Maintenance manual"), ("other", "Other"),
]

func docTypeName(_ t: String?) -> String { docTypes.first { $0.0 == t }?.1 ?? "Document" }

/// Types whose expiry the add sheet asks for (M-DOCS-03).
let expiringTypes: Set<String> = ["registration", "insurance", "radio_license"]

/// "PDF · added Jan 2026".
func docMeta(mime: String?, createdAt: String?) -> String {
    let kind: String? = mime.map { $0.contains("pdf") ? "PDF" : $0.hasPrefix("image/") ? "Photo" : "File" }
    let added = createdAt.flatMap { $0.count >= 10 ? $0 : nil }.map { c -> String in let p = Day.parts(String(c.prefix(10))); return "added \(Day.months[p.m - 1]) \(p.y)" }
    return [kind, added].compactMap { $0 }.joined(separator: " · ")
}

/// What a flight moved (M-FLIGHT-04): each hours-limited item on `meter`, with hours left before and after.
/// Calendar-only items don't move.
struct Moved: Equatable {
    let label: String
    let before: Double
    let after: Double
    let status: String
}

func movedBy(_ items: [DueItem], meter: String, before: Double, after: Double) -> [Moved] {
    guard after > before else { return [] }
    return items.compactMap { i in
        guard let h = i.hours, h.meter == meter else { return nil }
        return Moved(label: i.label, before: h.dueAt - before, after: h.dueAt - after, status: h.dueAt - after < 0 ? "overdue" : i.status)
    }
}

/// "Flight, tach 4212.4 to 4214.8" (the outbox label).
func flightLabel(last: Double?, now: Double) -> String {
    last.map { "Flight, tach \(fmt1($0)) to \(fmt1(now))" } ?? "Reading, tach \(fmt1(now))"
}

/// The equipment installed after a W&B revision: what makes it possibly stale (C-WB-01). "GTX 345 (2025)".
func staleSince(_ rev: Rec, _ components: [Rec]) -> String? {
    guard let date = rev.s("revision_date") else { return nil }
    return components.filter { $0.b("is_installed") && ($0.s("install_date") ?? "") > date }
        .max { ($0.s("install_date") ?? "") < ($1.s("install_date") ?? "") }
        .map { "\($0.s("name") ?? "") (\(($0.s("install_date") ?? "").prefix(4)))" }
}

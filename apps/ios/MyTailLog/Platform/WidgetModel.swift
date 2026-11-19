import Foundation

// The widgets' words (02 §9.14, 05 §11). They read the snapshot the app saves in the App Group after Status loads;
// they never open the database or the network. The server's StatusBody is computed from confirmed records only
// (09 §3.1), and "no record" items are left out here, so an entry read by AI and not yet confirmed never shows on a
// widget. Port of Android's WidgetData.kt; shared with the widget extension.

/// The 60-day horizon is fixed (14-decisions.md D6).
let widgetDays = 60

/// One list line: **lead** rest, plus the parts the small widget and the lock screen show on their own.
struct WidgetRow: Equatable, Sendable {
    let key: String?
    let lead: String
    let rest: String
    let status: String
    /// "9.7 h", "43 days", "lapsed".
    let value: String
    let about: String?
    /// Share of the interval used, 0...1, for the circular gauge; 1 when lapsed.
    var used: Double = 0
}

struct WidgetView: Equatable, Sendable {
    let tail: String?
    let rows: [WidgetRow]
    /// "Nothing due before Jan 17", or the no-aircraft prompt when `tail` is nil.
    let empty: String?
    /// "as of Nov 16" when the records are more than 24 hours old (05 §11.2).
    let asOf: String?
    /// The one accessible summary (02 §9.14 Accessibility).
    let summary: String
    /// The 60-day line with the rings of the listed items.
    let line: StatusSnapshot.LineAhead?
    let aircraftId: String?
}

enum WidgetText {
    static let noAircraft = "Open MyTailLog to choose an aircraft."

    private static func short(_ d: String) -> String { let p = Day.parts(d); return "\(Day.months[p.m - 1]) \(p.d)" }

    private static func andList(_ w: [String]) -> String {
        w.count < 2 ? (w.first ?? "") : w.dropLast().joined(separator: ", ") + " and " + w.last!
    }

    /// The local calendar day as the engine writes it ("2026-11-19").
    static func localDay(_ now: Date, zone: TimeZone = .current) -> String {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = zone
        let p = c.dateComponents([.year, .month, .day], from: now)
        return String(format: "%04d-%02d-%02d", p.year!, p.month!, p.day!)
    }

    static func view(tail: String?, aircraftId: String? = nil, snapshot: StatusSnapshot?, today: String, now: Date) -> WidgetView {
        guard let tail, let body = snapshot else {
            return WidgetView(tail: nil, rows: [], empty: noAircraft, asOf: nil, summary: noAircraft, line: nil, aircraftId: nil)
        }
        let end = Day.adding(widgetDays, to: today)
        // Day counts move at midnight without a new snapshot: shift them by the days since the server's "today".
        let shift = max(0, Day.between(body.today, today))
        let dated = body.items.filter { $0.status != "no_record" && ($0.calendar != nil || $0.hours != nil) }

        func daysNow(_ i: DueItem) -> Int? { i.calendar.map { $0.daysLeft - shift } }
        func lapsed(_ i: DueItem) -> Bool { i.status == "overdue" || (daysNow(i).map { $0 < 0 } ?? false) }
        func near(_ i: DueItem) -> Bool {
            lapsed(i) || i.status == "due_soon" || (daysNow(i).map { $0 <= widgetDays } ?? false)
                || (i.hours.map { h in h.remaining <= 25 || (h.projectedDate.map { $0 <= end } ?? false) } ?? false)
        }
        func row(_ i: DueItem) -> WidgetRow {
            let ifr = i.ifrOnly ? ", IFR only" : ""
            if lapsed(i), let h = i.hours, h.remaining <= 0, i.calendar == nil || daysNow(i)! >= 0 {
                return WidgetRow(key: i.key, lead: i.label, rest: "\(hours1(-h.remaining)) h over\(ifr)", status: "overdue",
                                 value: "\(hours1(-h.remaining)) h", about: "over", used: 1)
            }
            if lapsed(i), let c = i.calendar {
                return WidgetRow(key: i.key, lead: i.label, rest: "lapsed \(short(c.dueDate))\(ifr)", status: "overdue",
                                 value: "lapsed", about: short(c.dueDate), used: 1)
            }
            if i.first == "hours", let h = i.hours {
                let about = h.projectedDate.map { "about \(short($0))" }
                return WidgetRow(key: i.key, lead: i.label, rest: "in \(hours1(h.remaining)) h\(about.map { ", \($0)" } ?? "")\(ifr)",
                                 status: i.status, value: "\(hours1(h.remaining)) h", about: about, used: used(i))
            }
            if let c = i.calendar {
                let d = daysNow(i)!
                return WidgetRow(key: i.key, lead: i.label, rest: "due \(short(c.dueDate))\(ifr)", status: i.status,
                                 value: "\(d) \(d == 1 ? "day" : "days")", about: short(c.dueDate), used: used(i))
            }
            let h = i.hours!
            return WidgetRow(key: i.key, lead: i.label, rest: "in \(hours1(h.remaining)) h\(ifr)", status: i.status,
                             value: "\(hours1(h.remaining)) h", about: nil, used: used(i))
        }
        // The gauge: the interval since the last completion that is gone; 0 when the snapshot cannot say.
        func used(_ i: DueItem) -> Double {
            if i.first != "calendar", let h = i.hours, let last = i.lastDone?.hours, h.dueAt > last {
                return min(max(1 - h.remaining / (h.dueAt - last), 0), 1)
            }
            if let c = i.calendar, let last = i.lastDone?.date {
                let span = Day.between(last, c.dueDate)
                return span > 0 ? min(max(1 - Double(daysNow(i)!) / Double(span), 0), 1) : 0
            }
            return 0
        }

        let shown = dated.filter(near)
        let shownKeys = Set(shown.map(\.key))
        // The next visit in the window, planned before suggested; its items are named on its line, not again below.
        let visits = (body.visits?.planned ?? []) + (body.visits?.suggested ?? [])
        let visit = visits.first { v in
            let d = v.visitDate ?? v.weekOf
            return d >= today && d <= end && v.items.contains { shownKeys.contains($0.key) }
        }
        let inVisit = Set(visit?.items.map(\.key) ?? [])
        let labels = Dictionary(body.items.map { ($0.key, $0.label) }, uniquingKeysWith: { a, _ in a })
        let visitRow = visit.map { v in
            // "annual", but "ELT inspection" keeps its capitals.
            let names = v.items.compactMap { labels[$0.key].map { l in
                l.dropFirst().first?.isUppercase == true ? l : l.prefix(1).lowercased() + l.dropFirst() } }
            let d = short(v.visitDate ?? v.weekOf)
            return WidgetRow(key: nil, lead: "\(d) visit:", rest: andList(names), status: "visit", value: d, about: nil)
        }
        let rows = shown.filter { lapsed($0) && !inVisit.contains($0.key) }.map(row)
            + (visitRow.map { [$0] } ?? [])
            + shown.filter { !lapsed($0) && !inVisit.contains($0.key) }.map(row)

        let empty = rows.isEmpty ? "Nothing due before \(short(end))" : nil
        let asOf = Day.instant(body.computedAt).flatMap { at in
            now.timeIntervalSince(at) > 24 * 3600 ? "as of \(short(localDay(at)))" : nil
        }
        let said = rows.isEmpty ? empty! : rows.map { "\($0.lead.hasSuffix(":") ? String($0.lead.dropLast()) : $0.lead) \($0.rest)" }
            .joined(separator: ". ")
        let line = StatusSnapshot.LineAhead(from: today, to: end, rings: body.lineAhead.rings.filter { shownKeys.contains($0.itemKey) }, undated: [])
        return WidgetView(tail: tail, rows: rows, empty: empty, asOf: asOf, summary: "\(tail), next 60 days: \(said).", line: line,
                          aircraftId: body.aircraftId)
    }
}

/// The App Group files the widgets and intents read (05 §7.1): the aircraft list, the last opened aircraft and each
/// aircraft's raw status snapshot. Written by the app; deleted on sign-out.
enum SharedSnapshots {
    static let group = "group.com.mytaillog.app"

    struct Aircraft: Codable, Equatable, Sendable { let id: String; let tail: String }

    /// Nil when the App Group is not in the build's entitlements (then the widgets say "Open MyTailLog").
    static var dir: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?.appending(path: "widget")
    }

    static func saveAircraft(_ list: [Aircraft]) { write(try? JSONEncoder().encode(list), "aircraft.json") }

    static func aircraft() -> [Aircraft] {
        read("aircraft.json").flatMap { try? JSONDecoder().decode([Aircraft].self, from: $0) } ?? []
    }

    static func saveStatus(_ data: Data, aircraftId: String) { write(data, "status-\(aircraftId).json") }

    static func status(_ aircraftId: String) -> StatusSnapshot? {
        read("status-\(aircraftId).json").flatMap { try? JSONDecoder().decode(StatusSnapshot.self, from: $0) }
    }

    /// The default for widgets and intents: the last aircraft opened in the app.
    static var lastOpened: String? {
        get { read("last").map { String(decoding: $0, as: UTF8.self) } }
        set { write(newValue.map { Data($0.utf8) }, "last") }
    }

    static func clear() { if let dir { try? FileManager.default.removeItem(at: dir) } }

    /// The aircraft to show: the chosen one if still known, else the last opened, else the first.
    static func pick(_ id: String?) -> Aircraft? {
        let list = aircraft()
        return list.first { $0.id == id } ?? list.first { $0.id == lastOpened } ?? list.first
    }

    private static func read(_ name: String) -> Data? { dir.flatMap { try? Data(contentsOf: $0.appending(path: name)) } }

    private static func write(_ data: Data?, _ name: String) {
        guard let dir else { return }
        let url = dir.appending(path: name)
        guard let data else { try? FileManager.default.removeItem(at: url); return }
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try? data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
}

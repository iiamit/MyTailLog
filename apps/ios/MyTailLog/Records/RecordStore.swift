import SwiftUI

// Phase 4's records on the phone: rows of the mirror with the outbox laid over them, so a change made offline shows
// at once (with "On this phone", 06 §1.4), and the writes that put changes in the outbox. Port of Android's Records.kt
// and RecordsHost.kt: keep the two in step.

typealias Row = [String: AnyJSON]

extension AnyJSON {
    /// A value as text: strings as they are (empty is nil), whole numbers without a decimal point.
    var text: String? {
        switch self {
        case .string(let s): s.isEmpty ? nil : s
        case .number(let n): n == n.rounded() && abs(n) < 1e15 ? String(Int(n)) : String(n)
        case .bool(let b): b ? "true" : "false"
        default: nil
        }
    }
    var number: Double? {
        switch self {
        case .number(let n): n
        case .string(let s): Double(s)
        default: nil
        }
    }
    var flag: Bool { if case .bool(let b) = self { b } else { text == "true" } }

    /// Any JSONSerialization value (payloads are built as [String: Any]).
    init(any v: Any?) {
        switch v {
        case nil, is NSNull: self = .null
        case let b as Bool: self = .bool(b)
        case let n as NSNumber where CFGetTypeID(n) == CFBooleanGetTypeID(): self = .bool(n.boolValue)
        case let n as NSNumber: self = .number(n.doubleValue)
        case let i as Int: self = .number(Double(i))
        case let d as Double: self = .number(d)
        case let s as String: self = .string(s)
        case let a as [Any]: self = .array(a.map { AnyJSON(any: $0) })
        case let o as [String: Any]: self = .object(o.mapValues { AnyJSON(any: $0) })
        default: self = .string("\(v!)")
        }
    }
}

/// A row as shown: server truth with this phone's waiting changes applied.
struct Rec: Identifiable, Equatable {
    var row: Row
    var pending = false
    var refused: String?
    var conflict = false

    var id: String { s("id") ?? "" }
    func s(_ k: String) -> String? { row[k]?.text }
    func d(_ k: String) -> Double? { row[k]?.number }
    func b(_ k: String) -> Bool { row[k]?.flag ?? false }
}

/// What a waiting change does to its row: the columns it sets, or nil when it deletes the row.
func patchOf(_ type: String, _ p: Row) -> Row? {
    func obj(_ pairs: [(String, AnyJSON?)]) -> Row { Dictionary(pairs.compactMap { k, v in v.map { (k, $0) } }, uniquingKeysWith: { $1 }) }
    switch type {
    case "squawk.create": return obj([("description", p["description"]), ("severity", p["severity"]), ("status", .string("open")), ("reported_at", p["reportedAt"])])
    case "squawk.resolve": return obj([("status", .string("resolved")), ("resolved_at", p["resolvedAt"]), ("resolved_log_entry_id", p["resolvedEntryId"]), ("resolution_notes", p["resolutionNotes"])])
    case "squawk.reopen": return ["status": .string("open"), "resolved_at": .null, "resolved_log_entry_id": .null]
    case "squawk.update": return obj([("description", p["description"]), ("severity", p["severity"])])
    case "squawkPhoto.create": return obj([("squawk_id", p["squawkId"]), ("taken_at", p["takenAt"])])
    case "oil.create": return obj([("added_date", p["date"]), ("quarts", p["quarts"]), ("tach", p["tach"]), ("hobbs", p["hobbs"]), ("notes", p["notes"])])
    case "reading.create": return obj([("reading_date", p["date"]), ("tach", p["tach"]), ("hobbs", p["hobbs"]), ("source", p["source"] ?? .string("manual"))])
    case "reading.update": return obj([("reading_date", p["date"]), ("tach", p["tach"] ?? .null), ("hobbs", p["hobbs"] ?? .null)])
    case "meterReset.create": return obj([("meter", p["meter"]), ("reset_date", p["date"]), ("prior_value", p["prior"]), ("new_value", p["next"])])
    case "mx.upsert": if case .object(let o)? = p["item"] { return o }; return [:]
    case "ad.upsert": if case .object(let o)? = p["record"] { return o }; return [:]
    case "ad.track":
        return obj([("kind", p["kind"] ?? .string("ad")), ("reference", p["reference"]), ("title", p["title"]), ("status", .string("open")),
                    ("recurring", p["recurring"] ?? .bool(false)), ("interval_hours", p["intervalHours"]), ("interval_months", p["intervalMonths"])])
    case "component.upsert":
        guard case .object(var o)? = p["component"] else { return [:] }
        if o["is_installed"] == nil { o["is_installed"] = .bool(true) }
        return o
    case "component.remove": return obj([("is_installed", .bool(false)), ("removal_date", p["date"]), ("removal_entry_id", p["entryId"])])
    case "component.reinstall": return ["is_installed": .bool(true), "removal_date": .null, "removal_entry_id": .null]
    case "wb.upsert", "document.update", "provider.upsert": if case .object(let o)? = p["fields"] { return o }; return [:]
    case "document.setEntry": return ["log_entry_id": p["entryId"] ?? .null]
    case "document.setExpiry": return obj([("track_expiry", p["trackExpiry"]), ("expires_on", p["expiresOn"] ?? .null)])
    default: return type.hasSuffix(".delete") ? nil : [:]
    }
}

/// `rows` of `table` with the waiting changes laid over them in queue order: creates appear, deletes disappear,
/// updates set their columns. A refused change is shown on its row and not applied.
func overlay(_ table: String, rows: [Row], waiting: [OutboxItem]) -> [Rec] {
    var order: [String] = []
    var out: [String: Rec] = [:]
    for r in rows { let id = r["id"]?.text ?? ""; if out[id] == nil { order.append(id) }; out[id] = Rec(row: r) }
    for w in waiting where w.targetTable == table {
        guard let rowId = w.targetId else { continue }
        let cur = out[rowId]
        if w.status == "refused" { if var c = cur { c.refused = w.error ?? "Refused by the server."; out[rowId] = c }; continue }
        if w.status == "conflict" { if var c = cur { c.conflict = true; out[rowId] = c }; continue }
        guard let patch = patchOf(w.type, w.payload) else { out[rowId] = nil; continue }
        if cur == nil && patch.isEmpty { continue } // a change with nothing to show (mx.seedStandard) makes no row
        var row = cur?.row ?? ["id": .string(rowId)]
        for (k, v) in patch where k != "id" { row[k] = v }
        if cur == nil { order.append(rowId) }
        out[rowId] = Rec(row: row, pending: true, refused: cur?.refused)
    }
    return order.compactMap { out[$0] }
}

let notOnServer = "9999-12-31T00:00:00Z"
func newId() -> String { UUID().uuidString.lowercased() }

/// A payload: nil values are sent as JSON null (the write schemas treat null as "clear").
func payload(_ pairs: KeyValuePairs<String, Any?>) -> [String: Any] {
    Dictionary(pairs.map { ($0.key, $0.value ?? NSNull()) }, uniquingKeysWith: { $1 })
}

extension OfflineStore {
    /// Every row of `table` for `aircraftId`, as shown on this phone. Reading `revision` keeps views current.
    func records(_ table: String, aircraftId: String) -> [Rec] {
        _ = revision
        return overlay(table, rows: rawRows(table, aircraftId: aircraftId), waiting: items.filter { $0.aircraftId == aircraftId })
    }

    /// Queue one change to `table`/`rowId` (05 §6.4). Inserts use the new row's id as the change id, so a photo or a
    /// dependent change can wait on it. Returns the change id.
    /// shortcut: a change to a row that is still only on this phone carries a far-future base (there is no server row to
    /// conflict with); upgrade when the outbox can fold an edit into the waiting insert.
    @discardableResult
    func change(_ type: String, aircraftId: String, table: String, rowId: String, label: String, payload: [String: Any],
                dependsOn: String? = nil) throws -> String {
        let base = needsBase(type, payload)
        let id = !base && !items.contains(where: { $0.id == rowId }) ? rowId : newId()
        let raw = raw(table, id: rowId)
        let baseAt = base ? (rawRow(table, id: rowId)?["updated_at"]?.text ?? notOnServer) : nil
        try enqueue(id: id, type: type, aircraftId: aircraftId, payload: payload, label: label, target: (table, rowId),
                    base: baseAt, baseRow: raw, dependsOn: dependsOn)
        return id
    }

    /// Delete `rowId`: a row still only on this phone is taken out of the outbox with every change and file waiting on it;
    /// otherwise `type` is queued.
    func remove(_ type: String, aircraftId: String, table: String, rowId: String, label: String, payload: [String: Any]) throws {
        if raw(table, id: rowId) == nil, items.contains(where: { $0.targetId == rowId && $0.status != "sending" }) {
            let jobs = recordFiles.filter { $0.meta.squawkId == rowId }
            let gone = Set(jobs.map(\.id))
            for item in items where item.targetId == rowId || item.dependsOn == rowId || item.dependsOn.map(gone.contains) == true { discard(item.id) }
            jobs.forEach(removeFileJob)
            reload()
            return
        }
        try change(type, aircraftId: aircraftId, table: table, rowId: rowId, label: label, payload: payload)
    }
}

/// A short message at the foot of a board (02 §8.4), with an optional action ("Undo").
struct Toast: Identifiable {
    let id = UUID()
    let text: String
    var action: String?
    var run: (() -> Void)?
}

/// What phase 4's screens share for the open aircraft: its records on this phone, the outbox, the online routes,
/// the server's status snapshot, and one toast that survives navigation.
@MainActor @Observable
final class Recs {
    let offline: OfflineStore
    let api: RecordsAPI
    let aircraft: AircraftAccess
    @ObservationIgnored private weak var status: StatusModel?
    var toast: Toast?

    init(offline: OfflineStore, api: RecordsAPI, aircraft: AircraftAccess, status: StatusModel?) {
        self.offline = offline
        self.api = api
        self.aircraft = aircraft
        self.status = status
    }

    var id: String { aircraft.id }
    var tail: String { aircraft.tailNumber }
    /// 06 §1.5: viewers and the demo aircraft read only.
    var canEdit: Bool { aircraft.role != .viewer && !aircraft.isDemo }
    var isOwner: Bool { aircraft.role == .owner && !aircraft.isDemo }
    var online: Bool { !offline.isOffline }
    var snapshot: StatusSnapshot? { status?.snapshot.flatMap { $0.aircraftId == id ? $0 : nil } }

    func records(_ table: String) -> [Rec] { offline.records(table, aircraftId: id) }
    func rec(_ table: String, _ rowId: String) -> Rec? { records(table).first { $0.id == rowId } }
    func onServer(_ table: String, _ rowId: String) -> Bool { offline.raw(table, id: rowId) != nil }

    func say(_ text: String, action: String? = nil, run: (() -> Void)? = nil) { toast = Toast(text: text, action: action, run: run) }

    /// Queue a change; a phone that can't write its own outbox says so rather than pretending.
    @discardableResult
    func change(_ type: String, _ table: String, _ rowId: String, _ label: String, _ payload: [String: Any], dependsOn: String? = nil) -> String? {
        do { return try offline.change(type, aircraftId: id, table: table, rowId: rowId, label: label, payload: payload, dependsOn: dependsOn) }
        catch { say("Not saved: that didn't save on this phone. Try again."); return nil }
    }

    func delete(_ type: String, _ table: String, _ rowId: String, _ label: String, _ payload: [String: Any]) {
        do { try offline.remove(type, aircraftId: id, table: table, rowId: rowId, label: label, payload: payload) }
        catch { say("Not saved: that didn't save on this phone. Try again.") }
    }

    /// "Saved." online, "Saved on this phone." offline (12 §8).
    var savedWord: String { online ? "Saved." : "Saved on this phone." }

    /// The server's due item for a row ("mx:<id>", "ad:<id>", "doc:<id>"), when the snapshot has it.
    func due(_ key: String) -> DueItem? { snapshot?.items.first { $0.key == key } }

    /// "Airframe p. 60" for an entry, from this phone's copy of the books.
    func pageLabel(_ entryId: String?) -> String? {
        guard let entryId, let e = offline.rawRow("log_entry", id: entryId) else { return nil }
        let page = e["page_id"]?.text.flatMap { offline.rawRow("page", id: $0) }
        guard let book = (page?["logbook_id"]?.text ?? e["logbook_id"]?.text).flatMap({ offline.rawRow("logbook", id: $0) }) else { return nil }
        let name = book["title"]?.text ?? bookName(book["type"]?.text) ?? "Logbook"
        return page?["page_sequence"]?.text.map { "\(name) p. \($0)" } ?? name
    }

    /// Entries for a picker: newest first, "Jul 14, 2026 · Airframe p. 60 · the first words".
    func entries() -> [(id: String, line: String)] {
        records("log_entry").filter { $0.s("replaced_by_entry_id") == nil }
            .sorted { ($0.s("entry_date") ?? "") > ($1.s("entry_date") ?? "") }
            .map { e in (e.id, [e.s("entry_date").map(longDate), pageLabel(e.id), e.s("description").map { String($0.prefix(80)) }].compactMap { $0 }.joined(separator: " · ")) }
    }

    func entryLine(_ entryId: String?) -> String? {
        guard let entryId, let e = offline.rawRow("log_entry", id: entryId) else { return nil }
        return [e["entry_date"]?.text.map(longDate), pageLabel(entryId)].compactMap { $0 }.joined(separator: " · ")
    }

    /// Meter entry uses the physical dial; continuous lifetime hours belong only in due calculations.
    func meterReading(_ name: String) -> (value: Double?, date: String?) {
        latestMeterReading(snapshot?.meters[name], readings: records("hours_reading"), meter: name,
                           resets: records("meter_reset"))
    }

    func meter(_ name: String) -> Double? { meterReading(name).value }

}

/// Phase 4's pushed screens (05 §5.3): on the phone they push onto the tab's stack; on the tablet they fill the right leaf.
enum RecRoute: Hashable {
    case squawk(String), ad(String, record: Bool = false), item(String), findAds
    case hours, equipment, component(String), wb, oil, details
    case documents, doc(String)
    /// Phase 5: Plan ahead and a visit (Status), a record room link and Links and people (Share).
    case plan, visit(String), link(String, made: Bool = false), links
}

/// How a phase 4 screen moves: the phone's stack, or the tablet's right leaf.
struct RecNav {
    var open: @MainActor (RecRoute) -> Void = { _ in }
    var back: @MainActor () -> Void = {}
    var tablet = false
}

extension EnvironmentValues {
    @Entry var recNav = RecNav()
}

/// Newest effective reading wins across replacements, never the largest historical dial number.
func latestMeterReading(_ meter: StatusSnapshot.Meter?, readings: [Rec], meter name: String,
                        resets: [Rec]) -> (value: Double?, date: String?) {
    var value = meter?.face
    var date = meter?.asOf.map { String($0.prefix(10)) } ?? ""
    let reset = resets.filter { $0.s("meter") == name }
        .sorted { ($0.s("reset_date") ?? "", $0.s("updated_at") ?? "", $0.id) > ($1.s("reset_date") ?? "", $1.s("updated_at") ?? "", $1.id) }.first
    let resetDate = reset?.s("reset_date") ?? ""
    if let reset, let next = reset.d("new_value"), resetDate > date || (resetDate == date && reset.pending) {
        value = next; date = resetDate
    }
    let newest = readings.filter { $0.d(name) != nil && ($0.s("reading_date") ?? "") >= resetDate }
        .sorted { ($0.s("reading_date") ?? "", $0.s("updated_at") ?? "", $0.id) > ($1.s("reading_date") ?? "", $1.s("updated_at") ?? "", $1.id) }.first
    if let newest, let newerDate = newest.s("reading_date"),
       value == nil || newerDate > date || (newerDate == date && newest.pending && reset?.pending != true) {
        return (newest.d(name), newerDate)
    }
    return (value, date.isEmpty ? nil : date)
}

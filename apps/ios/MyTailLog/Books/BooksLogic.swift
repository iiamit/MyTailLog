import Foundation

// The Logbooks rules that are not drawing: what waits for review, the review desk's fields and outcomes, the writes
// a confirmation sends and the ones its Undo sends (06 M-BOOKS-*, M-REVIEW-*; 02 §6.7 ReviewField; 07 review flow).

/// Below this the reader's confidence in a field is doubt (apps/web/src/lib/extraction/schema.ts CONFIDENCE_THRESHOLD).
let confidenceThreshold = 0.75

/// Extraction states that mean "being read now" (09 §3.7 BEING_READ).
let beingRead: Set<String> = ["queued", "processing", "waiting_allowance"]

/// The lane order every Logbooks list follows (10 §5); Other last.
func laneOrder(_ type: String) -> Int { ["airframe", "engine", "prop", "avionics"].firstIndex(of: type) ?? 4 }

extension LogbookRow {
    var name: String { title ?? bookName(type) ?? "Logbook" }
}

/// One field on the review desk (02 §6.7).
struct ReviewField: Identifiable, Equatable {
    enum Kind { case date, number, text, paper }
    /// The log_entry column.
    let key: String
    let label: String
    let kind: Kind
    let value: String?
    let confidence: Double?
    let box: FieldBox?

    var id: String { key }
    var doubtful: Bool { (confidence ?? 1) < confidenceThreshold }
}

/// What the owner decided about one field (M-REVIEW-02's three outcomes).
enum FieldOutcome: Equatable {
    case looksRight
    case edited(String)
    case notOnPage
}

extension EntryRow {
    /// The fields the desk shows, least certain first (M-REVIEW-01 acceptance). Hobbs only when the page has one.
    var reviewFields: [ReviewField] {
        func f(_ key: String, _ label: String, _ kind: ReviewField.Kind, _ value: String?) -> ReviewField {
            ReviewField(key: key, label: label, kind: kind, value: value, confidence: field_confidence?[key], box: field_boxes?[key] ?? nil)
        }
        var out = [
            f("entry_date", "Date", .date, entry_date),
            f("tach", "Tach", .number, tach.map(Self.number)),
            f("work_performed", "Work", .paper, work_performed ?? description),
            f("signature_name", "Signed", .text, [signature_name, mechanic_cert_number].compactMap { $0 }.joined(separator: ", ").nilIfEmpty),
        ]
        if hobbs != nil { out.insert(f("hobbs", "Hobbs", .number, hobbs.map(Self.number)), at: 2) }
        // Stable: equal confidences keep the paper's order.
        return out.enumerated().sorted { a, b in
            let ca = a.element.confidence ?? 1, cb = b.element.confidence ?? 1
            return ca != cb ? ca < cb : a.offset < b.offset
        }.map(\.element)
    }

    /// The box around the whole entry: the union of its fields' boxes (02 §6.1 quiet highlight).
    var entryBox: FieldBox? {
        let boxes = (field_boxes ?? [:]).values.compactMap { $0 }.filter { $0.w > 0 && $0.h > 0 }
        guard let first = boxes.first else { return nil }
        var x0 = first.x, y0 = first.y, x1 = first.x + first.w, y1 = first.y + first.h
        for b in boxes { x0 = min(x0, b.x); y0 = min(y0, b.y); x1 = max(x1, b.x + b.w); y1 = max(y1, b.y + b.h) }
        return FieldBox(x: x0, y: y0, w: x1 - x0, h: y1 - y0)
    }

    /// The entry's name in the owner's words (M-BOOKS-02 title): the short description, else the work.
    var title: String { (description ?? work_performed ?? "Logbook entry").trimmingCharacters(in: .whitespacesAndNewlines) }

    var trustLevel: TrustLevel { trust == "ai_read" ? .aiRead : trust == "signed" ? .signed : .confirmed }

    static func number(_ v: Double) -> String { String(format: "%.1f", v) }
}

extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}

func trustLabel(_ level: TrustLevel) -> String {
    switch level {
    case .aiRead: "Read by AI"
    case .confirmed: "Confirmed by you"
    case .signed: "Signed by a mechanic"
    }
}

/// A page that waits for review (M-REVIEW-01): read, and at least one entry not yet confirmed.
func waitsForReview(_ page: PageRow, entries: [EntryRow]) -> Bool {
    page.extraction_status == "extracted" && entries.contains { $0.page_id == page.id && !$0.owner_confirmed }
}

/// The review queue, in lane then page order (07 review flow).
func reviewQueue(pages: [PageRow], entries: [EntryRow], logbooks: [LogbookRow]) -> [PageRow] {
    let type = Dictionary(logbooks.map { ($0.id, $0.type) }, uniquingKeysWith: { a, _ in a })
    return pages.filter { waitsForReview($0, entries: entries) }.sorted {
        let la = laneOrder(type[$0.logbook_id] ?? ""), lb = laneOrder(type[$1.logbook_id] ?? "")
        return la != lb ? la < lb : ($0.page_sequence ?? .max) < ($1.page_sequence ?? .max)
    }
}

/// The entries on a page, in reading order.
func entries(on page: PageRow, _ all: [EntryRow]) -> [EntryRow] {
    all.filter { $0.page_id == page.id }.sorted { ($0.entry_index ?? 0) < ($1.entry_index ?? 0) }
}

/// "Airframe p. 6" (02 §5.4 PageCite).
func pageLabel(_ page: PageRow, logbooks: [LogbookRow]) -> String {
    let name = logbooks.first { $0.id == page.logbook_id }?.name ?? "Logbook"
    return page.page_sequence.map { "\(name) p. \($0)" } ?? name
}

/// Every doubtful field has an outcome, so the page can be confirmed (M-REVIEW-01 primary).
func canConfirm(_ entries: [EntryRow], outcomes: [String: [String: FieldOutcome]]) -> Bool {
    entries.allSatisfy { e in e.reviewFields.filter(\.doubtful).allSatisfy { outcomes[e.id]?[$0.key] != nil } }
}

/// The column value an edited or cleared field writes; nil when the edit can't be read (a tach that isn't a number).
func columnValue(_ field: ReviewField, _ outcome: FieldOutcome) -> JSONValue? {
    switch outcome {
    case .looksRight: return nil
    case .notOnPage: return .null
    case .edited(let text):
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        switch field.kind {
        case .number: return Double(t).map(JSONValue.number)
        case .date: return t.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil ? .string(t) : nil
        case .text, .paper: return t.isEmpty ? .null : .string(t)
        }
    }
}

/// The writes "Confirm page and next" sends (M-REVIEW-03): an entry with an edited or cleared field is updated (which
/// confirms it, 09 §5); the rest are confirmed as read; then the page is marked reviewed. Bases are the rows' updated_at.
/// The signature line edits only the name; the certificate number stays as read.
func confirmMutations(aircraftId: String, page: PageRow, entries: [EntryRow],
                      outcomes: [String: [String: FieldOutcome]]) -> [Mutation] {
    var out: [Mutation] = []
    for e in entries where !e.owner_confirmed {
        var fields: [String: JSONValue] = [:]
        for field in e.reviewFields {
            guard let o = outcomes[e.id]?[field.key], let v = columnValue(field, o) else { continue }
            fields[field.key] = v
        }
        if fields.isEmpty {
            out.append(Mutation(type: "entry.confirm", aircraftId: aircraftId,
                                payload: ["entryId": .value(.string(e.id)), "confirmed": .value(.bool(true))], base: e.updated_at))
        } else {
            out.append(Mutation(type: "entry.update", aircraftId: aircraftId,
                                payload: ["entryId": .value(.string(e.id)), "fields": .object(fields)], base: e.updated_at))
        }
    }
    out.append(pageReview(aircraftId: aircraftId, page: page, status: "confirmed"))
    return out
}

func pageReview(aircraftId: String, page: PageRow, status: String, base: String? = nil) -> Mutation {
    Mutation(type: "page.review", aircraftId: aircraftId,
             payload: ["pageId": .value(.string(page.id)), "status": .value(.string(status))], base: base ?? page.updated_at)
}

/// Undo (M-REVIEW-03, 6 s): first put back what the owner edited (an update confirms, so it comes before the un-confirm),
/// then un-confirm each entry and the page. `stamps` are the updated_at values the confirmation wrote.
/// Returns two batches: the second needs the first's new updated_at for any entry it re-wrote.
func undoEditsMutations(aircraftId: String, before: [EntryRow], stamps: [String: String],
                        outcomes: [String: [String: FieldOutcome]]) -> [Mutation] {
    before.compactMap { e -> Mutation? in
        var fields: [String: JSONValue] = [:]
        for field in e.reviewFields {
            guard let o = outcomes[e.id]?[field.key], columnValue(field, o) != nil else { continue }
            fields[field.key] = originalValue(e, field.key)
        }
        guard !fields.isEmpty, !e.owner_confirmed else { return nil }
        return Mutation(type: "entry.update", aircraftId: aircraftId,
                        payload: ["entryId": .value(.string(e.id)), "fields": .object(fields)], base: stamps[e.id])
    }
}

func undoConfirmMutations(aircraftId: String, page: PageRow, before: [EntryRow], stamps: [String: String]) -> [Mutation] {
    before.filter { !$0.owner_confirmed }.map { e in
        Mutation(type: "entry.confirm", aircraftId: aircraftId,
                 payload: ["entryId": .value(.string(e.id)), "confirmed": .value(.bool(false))], base: stamps[e.id])
    } + [pageReview(aircraftId: aircraftId, page: page, status: page.review_status, base: stamps[page.id])]
}

private func originalValue(_ e: EntryRow, _ key: String) -> JSONValue {
    switch key {
    case "entry_date": e.entry_date.map(JSONValue.string) ?? .null
    case "tach": e.tach.map(JSONValue.number) ?? .null
    case "hobbs": e.hobbs.map(JSONValue.number) ?? .null
    case "work_performed": e.work_performed.map(JSONValue.string) ?? .null
    case "signature_name": e.signature_name.map(JSONValue.string) ?? .null
    default: .null
    }
}

/// M-BOOKS-04: the two owner answers to a gap and what the gap then says.
enum GapAnswer: String, CaseIterable, Identifiable {
    case noPagesExist = "no_pages_exist"
    case askedPreviousOwner = "asked_previous_owner"

    var id: String { rawValue }
    var button: String { self == .noPagesExist ? "No pages exist" : "I asked the previous owner" }
}

func gapMutation(aircraftId: String, gapId: String, answer: GapAnswer, note: String, base: String?) -> Mutation {
    let n = note.trimmingCharacters(in: .whitespacesAndNewlines)
    return Mutation(type: "gap.setStatus", aircraftId: aircraftId,
                    payload: ["gapId": .value(.string(gapId)), "status": .value(.string(answer.rawValue)),
                              "note": .value(n.isEmpty ? .null : .string(n))], base: base)
}

/// The gap's title in the map's words (10 §7, M-BOOKS-04).
func gapTitle(_ gap: MapData.Gap) -> String {
    let book = (bookName(gap.logbook) ?? "logbook").lowercased()
    let from = gap.from.prefix(4), to = gap.to.prefix(4)
    switch gap.status {
    case "no_pages_exist": return "No \(book) pages exist for \(from) to \(to) (you marked this)"
    default: return "No \(book) pages, \(from) to \(to)"
    }
}

/// What a write's refusal says to the owner (12 voice): the viewer case in the app's words, else the server's.
func pushProblem(_ results: [PushResult]) -> String? {
    guard let bad = results.first(where: { $0.status != "ok" }) else { return nil }
    if bad.status == "conflict" { return "Someone changed this while you were looking. Pull to refresh and try again." }
    if let e = bad.error, e.localizedCaseInsensitiveContains("edit access") { return "You can view this aircraft. The owner can make changes." }
    return bad.error ?? "That didn't save. Try again."
}

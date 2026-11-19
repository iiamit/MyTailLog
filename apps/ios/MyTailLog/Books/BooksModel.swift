import SwiftUI

/// The open aircraft's logbooks: the map model, books, pages and entries, page images, and the writes Logbooks sends.
/// What was loaded stays on screen while a refresh runs or after one fails; `failed` with nothing loaded is the error state.
/// shortcut: in memory and online only until the phase 3 mirror; the map comes from the server instead of the device copy.
@MainActor @Observable
final class BooksModel {
    let aircraft: AircraftAccess
    private(set) var map: MapData?
    private(set) var logbooks: [LogbookRow] = []
    private(set) var pages: [PageRow] = []
    private(set) var entries: [EntryRow] = []
    private(set) var loading = true
    private(set) var failed = false

    /// Viewers and the demo read everything and change nothing (06 §1.5).
    var canEdit: Bool { aircraft.role != .viewer }
    var queue: [PageRow] { reviewQueue(pages: pages, entries: entries, logbooks: logbooks) }
    var readingNow: [PageRow] { pages.filter { beingRead.contains($0.extraction_status) } }

    private let api: StatusAPI
    private let token: @Sendable () async throws -> String
    private let images = NSCache<NSString, UIImage>()

    init(aircraft: AircraftAccess, api: StatusAPI, token: @escaping @Sendable () async throws -> String) {
        self.aircraft = aircraft
        self.api = api
        self.token = token
        Task { await refresh() }
    }

    func refresh() async {
        loading = true
        failed = false
        do {
            let t = try await token(), id = aircraft.id, api = api
            async let m = api.map(token: t, aircraftId: id)
            async let b = api.logbooks(token: t, aircraftId: id)
            async let p = api.pages(token: t, aircraftId: id)
            async let e = api.entries(token: t, aircraftId: id)
            (map, logbooks, pages, entries) = try await (m, b, p, e)
        } catch {
            failed = true
        }
        loading = false
    }

    func logbook(_ id: String) -> LogbookRow? { logbooks.first { $0.id == id } }
    func page(_ id: String) -> PageRow? { pages.first { $0.id == id } }
    func entry(_ id: String) -> EntryRow? { entries.first { $0.id == id } }
    func label(_ page: PageRow) -> String { pageLabel(page, logbooks: logbooks) }
    /// "Engine logbook, page 13" (the spoken and caption form of a PageCite).
    func longLabel(_ page: PageRow) -> String {
        let name = logbook(page.logbook_id)?.name ?? "Logbook"
        return page.page_sequence.map { "\(name) logbook, page \($0)" } ?? "\(name) logbook"
    }

    func entries(on page: PageRow) -> [EntryRow] { MyTailLog.entries(on: page, entries) }

    /// The page image (thumbnail or full scan), cached for the session.
    func image(_ pageId: String, thumb: Bool) async -> UIImage? {
        let key = "\(pageId)|\(thumb)" as NSString
        if let hit = images.object(forKey: key) { return hit }
        guard let page = page(pageId), let t = try? await token(),
              let data = try? await api.pageImage(token: t, pageId: pageId, thumb: thumb, version: page.updated_at),
              let image = UIImage(data: data) else { return nil }
        images.setObject(image, forKey: key)
        return image
    }

    func evidence(_ gapId: String) async -> GapEvidence? {
        guard let t = try? await token() else { return nil }
        return try? await api.gapEvidence(token: t, aircraftId: aircraft.id, gapId: gapId)
    }

    /// Sends writes; nil when every one landed, else what to tell the owner.
    func push(_ mutations: [Mutation]) async -> (results: [PushResult], problem: String?) {
        do {
            let results = try await api.push(token: token(), mutations)
            return (results, pushProblem(results))
        } catch {
            return ([], "That didn't save. Check your connection and try again.")
        }
    }

    /// M-BOOKS-04: the owner's answer to a gap. The gap row's updated_at is the base (09 §5).
    func answer(gap: MapData.Gap, _ answer: GapAnswer, note: String) async -> String? {
        struct Stamp: Decodable { let updated_at: String }
        let base: String?
        do {
            let rows: [Stamp] = try await api.get(api.rest("logbook_gap", ["select": "updated_at", "id": "eq.\(gap.id)"]), token())
            base = rows.first?.updated_at
        } catch {
            return "That didn't save. Check your connection and try again."
        }
        let problem = await push([gapMutation(aircraftId: aircraft.id, gapId: gap.id, answer: answer, note: note, base: base)]).problem
        if problem == nil { await refresh() }
        return problem
    }

    /// What one confirmation wrote, for its Undo.
    struct Confirmation {
        let page: PageRow
        let before: [EntryRow]
        let outcomes: [String: [String: FieldOutcome]]
        let stamps: [String: String]
    }

    /// M-REVIEW-03 "Confirm page and next". Returns the confirmation for Undo, or the problem.
    func confirm(_ page: PageRow, outcomes: [String: [String: FieldOutcome]]) async -> Result<Confirmation, Problem> {
        let before = entries(on: page)
        let ms = confirmMutations(aircraftId: aircraft.id, page: page, entries: before, outcomes: outcomes)
        let (results, problem) = await push(ms)
        if let problem { return .failure(Problem(text: problem)) }
        var stamps: [String: String] = [:]
        for (m, r) in zip(ms, results) {
            if case .value(.string(let id)) = m.payload["entryId"] ?? m.payload["pageId"], let at = r.row?.updated_at { stamps[id] = at }
        }
        await refresh()
        return .success(Confirmation(page: page, before: before, outcomes: outcomes, stamps: stamps))
    }

    /// Undo puts back what the owner edited, then un-confirms the entries and the page.
    func undo(_ c: Confirmation) async -> String? {
        var stamps = c.stamps
        let edits = undoEditsMutations(aircraftId: aircraft.id, before: c.before, stamps: stamps, outcomes: c.outcomes)
        if !edits.isEmpty {
            let (results, problem) = await push(edits)
            if let problem { return problem }
            for (m, r) in zip(edits, results) {
                if case .value(.string(let id)) = m.payload["entryId"], let at = r.row?.updated_at { stamps[id] = at }
            }
        }
        let problem = await push(undoConfirmMutations(aircraftId: aircraft.id, page: c.page, before: c.before, stamps: stamps)).problem
        await refresh()
        return problem
    }

    struct Problem: Error { let text: String }
}

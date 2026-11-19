import SwiftUI

/// The open aircraft's logbooks: the map model, books, pages and entries, page images, and the writes Logbooks sends.
/// What was loaded stays on screen while a refresh runs or after one fails; `failed` with nothing loaded is the error state.
/// Books, pages and entries come from the phone's mirror (05 §6.1) once it has synced; the map comes from the server
/// and its last copy is kept on the phone for offline. `fromPhone` says the server couldn't be asked.
/// shortcut: the map is not computed on the phone (09 §3.12 item 7); offline it is the last one the server drew.
@MainActor @Observable
final class BooksModel {
    let aircraft: AircraftAccess
    private(set) var map: MapData?
    private(set) var logbooks: [LogbookRow] = []
    private(set) var pages: [PageRow] = []
    private(set) var entries: [EntryRow] = []
    private(set) var loading = true
    private(set) var failed = false
    /// Shown from the phone's copy because the server couldn't be reached.
    private(set) var fromPhone = false

    /// Viewers and the demo read everything and change nothing (06 §1.5).
    var canEdit: Bool { aircraft.role != .viewer }
    var queue: [PageRow] { reviewQueue(pages: pages, entries: entries, logbooks: logbooks) }
    var readingNow: [PageRow] { pages.filter { beingRead.contains($0.extraction_status) } }

    private let api: StatusAPI
    private let token: @Sendable () async throws -> String
    private let images = NSCache<NSString, UIImage>()
    let offline: OfflineStore?

    init(aircraft: AircraftAccess, api: StatusAPI, offline: OfflineStore? = nil, token: @escaping @Sendable () async throws -> String) {
        self.aircraft = aircraft
        self.api = api
        self.offline = offline
        self.token = token
        Task { await refresh() }
    }

    func refresh() async {
        loading = true
        failed = false
        let id = aircraft.id, api = api
        // The mirror first (it is what this phone holds), synced first when there is signal.
        if let offline {
            await offline.sync()
            readMirror(offline)
        }
        do {
            let t = try await token()
            let m = try await api.map(token: t, aircraftId: id)
            map = m
            saveMap(m)
            fromPhone = false
            if offline?.hasPulled != true || logbooks.isEmpty {
                async let b = api.logbooks(token: t, aircraftId: id)
                async let p = api.pages(token: t, aircraftId: id)
                async let e = api.entries(token: t, aircraftId: id)
                (logbooks, pages, entries) = try await (b, p, e)
            }
        } catch {
            map = map ?? loadMap()
            fromPhone = true
            failed = logbooks.isEmpty && map == nil
        }
        loading = false
    }

    /// Logbooks, pages and entries from mirror.db, shaped like the server's rows (`_raw`).
    func readMirror(_ offline: OfflineStore) {
        guard offline.hasPulled else { return }
        let id = aircraft.id
        let b: [LogbookRow] = offline.rows("logbook", aircraftId: id)
        guard !b.isEmpty else { return }
        logbooks = b
        pages = (offline.rows("page", aircraftId: id) as [PageRow]).sorted { ($0.page_sequence ?? .max, $0.id) < ($1.page_sequence ?? .max, $1.id) }
        entries = (offline.rows("log_entry", aircraftId: id) as [MirrorEntry]).filter { $0.replaced_by_entry_id == nil }.map(\.entry)
            .sorted { ($0.entry_date ?? "~") < ($1.entry_date ?? "~") }
    }

    private var mapURL: URL? { offline?.dir.appending(path: "Cache/map-\(aircraft.id).json") }
    private func saveMap(_ m: MapData) { if let url = mapURL, let data = try? JSONEncoder().encode(m) { try? data.write(to: url) } }
    private func loadMap() -> MapData? { mapURL.flatMap { try? Data(contentsOf: $0) }.flatMap { try? JSONDecoder().decode(MapData.self, from: $0) } }

    /// The lands-in line for a page of `logbook` dated in a year (05 §15.1): open gaps on its map line, then its pages' dates.
    func placement(logbook: LogbookRow) -> (Int?) -> String? {
        let lines = Set(map?.lines.filter { $0.logbookId == logbook.id }.map(\.lineId) ?? [])
        let gaps = map?.gaps.filter { lines.contains($0.lineId) && $0.status == "open" }.map { LandsIn.Gap(from: $0.from, to: $0.to) } ?? []
        let dated = pages.filter { $0.logbook_id == logbook.id }.compactMap { p in
            p.page_sequence.flatMap { seq in p.landing_date.map { LandsIn.Page(sequence: seq, landingDate: $0) } }
        }
        let name = logbook.name
        return { LandsIn.line(year: $0, logbook: name, gaps: gaps, pages: dated) }
    }

    /// Reading progress and the allowance; nil offline or on failure.
    func readingQueue() async -> ReadingQueue? {
        guard offline?.isOffline != true, let t = try? await token() else { return nil }
        return try? await api.readingQueue(token: t, aircraftId: aircraft.id)
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

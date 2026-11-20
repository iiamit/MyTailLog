import Foundation

/// The aircraft list and the current aircraft's status snapshot (port of Android's StatusViewModel).
/// The snapshot is the server's (09 §3.12) and stays on screen while a refresh runs or after one fails;
/// `failed` with no snapshot is the error state.
/// Snapshots are cached here for the session; the copy that survives a relaunch is OfflineStore's (StatusOffline.swift).
@MainActor @Observable
final class StatusModel {
    private(set) var aircraft: [AircraftAccess] = []
    private(set) var currentId: String?
    private(set) var snapshot: StatusSnapshot?
    private(set) var loading = true
    private(set) var failed = false

    var current: AircraftAccess? { aircraft.first { $0.id == currentId } }
    var noAircraft: Bool { !loading && !failed && aircraft.isEmpty }
    /// The tail line (06 §1.3): the open aircraft and when the server worked its status out.
    var line: AircraftLine {
        AircraftLine(tail: current?.tailNumber ?? (noAircraft ? nil : ""), lastSync: Day.instant(snapshot?.computedAt))
    }

    private var cache: [String: StatusSnapshot] = [:]
    private var task: Task<Void, Never>?
    private let loadAircraft: @Sendable () async throws -> [AircraftAccess]
    private let loadStatus: @Sendable (String) async throws -> StatusSnapshot

    init(loadAircraft: @escaping @Sendable () async throws -> [AircraftAccess],
         loadStatus: @escaping @Sendable (String) async throws -> StatusSnapshot) {
        self.loadAircraft = loadAircraft
        self.loadStatus = loadStatus
        load(nil)
    }

    /// Pull to refresh and Retry: the list and the current aircraft's snapshot again.
    func refresh() async {
        await load(currentId).value
    }

    func select(_ id: String) {
        guard id != currentId else { return }
        currentId = id
        snapshot = cache[id]
        failed = false
        load(id)
    }

    @discardableResult
    private func load(_ preferred: String?) -> Task<Void, Never> {
        task?.cancel()
        let next = Task { await run(preferred) }
        task = next
        return next
    }

    private func run(_ preferred: String?) async {
        loading = true
        failed = false
        do {
            let list = try await loadAircraft()
            try Task.checkCancellation()
            let id = preferred.flatMap { p in list.contains { $0.id == p } ? p : nil } ?? Self.defaultAircraft(list)
            aircraft = list
            currentId = id
            snapshot = id.flatMap { cache[$0] } ?? (snapshot?.aircraftId == id ? snapshot : nil)
            guard let id else {
                loading = false
                return
            }
            let snap = try await loadStatus(id)
            try Task.checkCancellation()
            cache[id] = snap
            snapshot = snap
            loading = false
        } catch {
            // A superseded load (cancelled; URLSession reports it as URLError.cancelled) leaves the state to its successor.
            guard !Task.isCancelled else { return }
            loading = false
            failed = true
        }
    }

    /// Until the hangar (M-HANGAR-01) remembers a choice: the user's own aircraft first, the demo last.
    static func defaultAircraft(_ list: [AircraftAccess]) -> String? {
        (list.first { $0.role == .owner && !$0.isDemo } ?? list.first { !$0.isDemo } ?? list.first)?.id
    }
}

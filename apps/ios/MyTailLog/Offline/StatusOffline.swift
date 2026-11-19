import Foundation

/// Status on the phone (09 §3.12): the server's snapshot is the authority. The last one fetched is kept, and the
/// mirror's `aircraft_status_snapshot` is used when it is newer, so Status opens offline with the records it last
/// had and the tail line says when they were synced.
/// shortcut: no local recompute of due items for unsent changes yet (09 §3.12 items 1-6); the Waiting group on
/// Status names them "On this phone" instead.
extension OfflineStore {
    private struct AccessRow: Codable { let id: String; let tailNumber: String; let isDemo: Bool; let role: String }
    private var accessURL: URL { dir.appending(path: "Cache/aircraft.json") }
    private func statusURL(_ id: String) -> URL { dir.appending(path: "Cache/status-\(id).json") }

    func saveAircraft(_ list: [AircraftAccess]) {
        let rows = list.map { AccessRow(id: $0.id, tailNumber: $0.tailNumber, isDemo: $0.isDemo, role: "\($0.role)") }
        try? JSONEncoder().encode(rows).write(to: accessURL)
    }

    /// The aircraft list from the last online read, else from the mirror (owner where the user owns it, else viewer).
    func cachedAircraft() -> [AircraftAccess] {
        if let data = try? Data(contentsOf: accessURL), let rows = try? JSONDecoder().decode([AccessRow].self, from: data) {
            return rows.map { AircraftAccess(id: $0.id, tailNumber: $0.tailNumber, isDemo: $0.isDemo,
                                             role: $0.role == "owner" ? .owner : $0.role == "editor" ? .editor : .viewer) }
        }
        struct Row: Decodable { let id: String; let tail_number: String; let owner_id: String; let is_demo: Bool? }
        return (aircraftRows() as [Row]).map {
            AircraftAccess(id: $0.id, tailNumber: $0.tail_number, isDemo: $0.is_demo ?? false,
                           role: $0.is_demo == true ? .viewer : $0.owner_id == userId ? .owner : .viewer)
        }
    }

    func saveStatus(_ data: Data, aircraftId: String) { try? data.write(to: statusURL(aircraftId)) }

    func cachedStatus(_ aircraftId: String) -> StatusSnapshot? {
        cachedStatusData(aircraftId).flatMap { try? JSONDecoder().decode(StatusSnapshot.self, from: $0) }
    }

    /// The newest snapshot this phone has, as JSON (the mirror's or the last one fetched): what core's planDate reads.
    func cachedStatusData(_ aircraftId: String) -> Data? {
        struct Row: Decodable { let snapshot: AnyJSON }
        let mirrored = (rows("aircraft_status_snapshot", aircraftId: aircraftId) as [Row]).first.flatMap { try? JSONEncoder().encode($0.snapshot) }
        let cached = try? Data(contentsOf: statusURL(aircraftId))
        func at(_ d: Data) -> String { (try? JSONDecoder().decode(StatusSnapshot.self, from: d))?.computedAt ?? "" }
        return [mirrored, cached].compactMap { $0 }.filter { (try? JSONDecoder().decode(StatusSnapshot.self, from: $0)) != nil }.max { at($0) < at($1) }
    }
}

extension StatusAPI {
    /// The status snapshot as the server sent it, kept on the phone as well as decoded.
    func statusData(token: String, aircraftId: String) async throws -> Data {
        var request = URLRequest(url: apiURL.appending(path: "api/aircraft/\(aircraftId)/status"), timeoutInterval: 20)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await http.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else { throw HTTPError(status: status) }
        return data
    }
}

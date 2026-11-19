import Foundation

/// GET /api/aircraft/{id}/status (09 §4.2, 4.3): the due engine's StatusBody (apps/web/src/lib/due/engine.ts)
/// plus when the server worked it out. The server is the authority (09 §3.12); only what Status reads is decoded.
struct StatusSnapshot: Decodable, Equatable, Sendable {
    let aircraftId: String
    let today: String
    let situation: String
    let verdict: Verdict
    let meters: [String: Meter]
    let rate: Rate
    let items: [DueItem]
    let lineAhead: LineAhead
    let counts: Counts
    let computedAt: String?

    struct Verdict: Decodable, Equatable, Sendable {
        let text: String
        /// [from, to) pairs in UTF-16 offsets (JS string indices).
        let emphasis: [[Int]]
        let lines: [String]
    }

    struct Meter: Decodable, Equatable, Sendable {
        let stitched: Double?
        let asOf: String?
    }

    struct Rate: Decodable, Equatable, Sendable {
        let hoursPerWeek: Double
        let basis: String
        let meter: String
    }

    struct LineAhead: Decodable, Equatable, Sendable {
        let from: String
        let to: String
        let rings: [Ring]
        let undated: [String]
    }

    struct Ring: Decodable, Equatable, Sendable {
        let itemKey: String
        let line: String
        let date: String
        let status: String
    }

    struct Counts: Decodable, Equatable, Sendable {
        let overdue: Int
        let dueSoon: Int
        let noRecord: Int
        let pagesToReview: Int
    }
}

struct DueItem: Decodable, Equatable, Identifiable, Sendable {
    let key: String
    let source: String
    let label: String
    let rule: String
    let line: String?
    let advisory: Bool
    let ifrOnly: Bool
    /// "overdue", "due_soon", "current" or "no_record".
    let status: String
    let calendar: Calendar?
    let hours: Hours?
    /// "calendar" or "hours": the limit that bites first.
    let first: String?
    let lastDone: LastDone?
    /// A newer completion waits for review; it moves nothing until confirmed (02 §5.8).
    let waitingEntryId: String?

    var id: String { key }

    struct Calendar: Decodable, Equatable, Sendable {
        let dueDate: String
        let daysLeft: Int
        let calendarMonthRule: Bool
    }

    struct Hours: Decodable, Equatable, Sendable {
        let meter: String
        let dueAt: Double
        let remaining: Double
        let projectedDate: String?
        let projectionBasis: String
    }

    struct LastDone: Decodable, Equatable, Sendable {
        let date: String?
        let hours: Double?
        let pageLabel: String?
        let trust: String?
        let signer: String?
    }
}

/// 06 §1.5: the demo aircraft is read-only like a viewer's.
enum AircraftRole: Sendable { case owner, editor, viewer }

struct AircraftAccess: Identifiable, Hashable, Sendable {
    let id: String
    let tailNumber: String
    let isDemo: Bool
    let role: AircraftRole
}

/// What Status reads while there is no local mirror (phase 3): the aircraft the user can open, through PostgREST
/// under RLS, then the server's snapshot. Mirrors apps/core/api StatusApi.kt.
struct StatusAPI: Sendable {
    let supabaseURL: URL
    let apiKey: String
    let apiURL: URL
    var http: URLSession = .shared

    struct HTTPError: Error { let status: Int }

    /// Reads ApiHost beside the Supabase keys (Config/*.xcconfig through Info.plist).
    static func fromBundle(_ bundle: Bundle = .main) -> StatusAPI {
        let auth = AuthClient.fromBundle(bundle)
        let host = bundle.object(forInfoDictionaryKey: "ApiHost") as? String ?? ""
        guard !host.isEmpty, let url = URL(string: "https://\(host)") else {
            preconditionFailure("ApiHost missing from Info.plist; see apps/ios/Config.")
        }
        return StatusAPI(supabaseURL: auth.baseURL, apiKey: auth.apiKey, apiURL: url)
    }

    struct AircraftRow: Decodable {
        let id: String
        let tail_number: String
        let owner_id: String
        let is_demo: Bool?
    }

    struct ShareRow: Decodable {
        let aircraft_id: String
        let role: String
    }

    /// Every aircraft RLS lets this user read, by tail number, with the user's role on each.
    func aircraft(token: String, userId: String, email: String?) async throws -> [AircraftAccess] {
        let rows: [AircraftRow] = try await get(rest("aircraft", ["select": "id,tail_number,owner_id,is_demo", "order": "tail_number"]), token)
        // Only shared aircraft need the grant; an owner can read the grants they gave, so match on the caller's email.
        var shares: [ShareRow] = []
        if let email, !rows.allSatisfy({ $0.owner_id == userId }) {
            shares = try await get(rest("aircraft_share", ["select": "aircraft_id,role", "invited_email": "ilike.\(email)"]), token)
        }
        return Self.access(rows, shares: shares, userId: userId)
    }

    static func access(_ rows: [AircraftRow], shares: [ShareRow], userId: String) -> [AircraftAccess] {
        let roles = Dictionary(shares.map { ($0.aircraft_id, $0.role) }, uniquingKeysWith: { a, _ in a })
        return rows.map { row in
            let demo = row.is_demo ?? false
            let role: AircraftRole = demo ? .viewer : row.owner_id == userId ? .owner : roles[row.id] == "editor" ? .editor : .viewer
            return AircraftAccess(id: row.id, tailNumber: row.tail_number, isDemo: demo, role: role)
        }
    }

    func status(token: String, aircraftId: String) async throws -> StatusSnapshot {
        try await get(apiURL.appending(path: "api/aircraft/\(aircraftId)/status"), token, apiKey: false)
    }

    func rest(_ table: String, _ query: [String: String]) -> URL {
        supabaseURL.appending(path: "rest/v1/\(table)")
            .appending(queryItems: query.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) })
    }

    func get<T: Decodable>(_ url: URL, _ token: String, apiKey sendKey: Bool = true) async throws -> T {
        var request = URLRequest(url: url, timeoutInterval: 20)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if sendKey { request.setValue(apiKey, forHTTPHeaderField: "apikey") }
        let (data, response) = try await http.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else { throw HTTPError(status: status) }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

extension Session {
    /// The user id is the access token's `sub` claim (a Supabase JWT); nil if the token cannot be read.
    var userId: String? {
        let parts = accessToken.split(separator: ".")
        guard parts.count == 3 else { return nil }
        var b64 = parts[1].replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        b64 += String(repeating: "=", count: (4 - b64.count % 4) % 4)
        guard let data = Data(base64Encoded: b64),
              let claims = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return claims["sub"] as? String
    }
}

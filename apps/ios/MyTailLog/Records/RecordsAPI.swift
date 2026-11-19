import Foundation

/// One AD from the Federal Register (W-MAINT-02's source; the phone queries it directly, as the browser does).
struct FoundAd: Identifiable, Equatable, Sendable {
    let adNumber: String?
    let title: String
    let abstract: String?
    let effectiveOn: String?
    let htmlUrl: String
    var id: String { htmlUrl + (adNumber ?? "") }
}

/// A written-versus-calculated time check (09 §3.10).
struct TimeCheck: Equatable, Sendable {
    let component: String
    let entryId: String
    let pageLabel: String?
    let written: Double
    let calculated: Double
    let apart: Bool
    let difference: Double
    let digitSwap: Bool
    let dismissed: Bool
}

/// Phase 4's online routes: squawk photos, documents, mechanic links, time checks, aircraft details and the FAA
/// search. Port of Android's RecordsApi.kt. Everything here needs signal; the screens say so when there is none.
struct RecordsAPI: Sendable {
    let apiURL: URL
    let token: @Sendable () async throws -> String
    /// PostgREST for aircraft details (owner-only RLS is the guard).
    var supabase: (url: URL, key: String)?
    var http: URLSession = .shared

    struct Failure: Error, LocalizedError {
        let status: Int
        let message: String
        var errorDescription: String? { message }
    }

    private func url(_ path: String) -> URL { apiURL.appending(path: path) }

    private func send(_ request: URLRequest) async throws -> (Data, Int) {
        var r = request
        r.setValue("Bearer \(try await token())", forHTTPHeaderField: "Authorization")
        let (data, response) = try await http.data(for: r)
        return (data, (response as? HTTPURLResponse)?.statusCode ?? 0)
    }

    /// A JSON answer, or the server's `error` verbatim.
    private func json(_ request: URLRequest) async throws -> [String: Any] {
        let (data, status) = try await send(request)
        let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        guard (200..<300).contains(status) else {
            throw Failure(status: status, message: o?["error"] as? String ?? "The server refused it (\(status)).")
        }
        return o ?? [:]
    }

    private func post(_ path: String, _ body: [String: Any]? = nil) -> URLRequest {
        var r = URLRequest(url: url(path), timeoutInterval: 60)
        r.httpMethod = "POST"
        if let body {
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            r.httpBody = try? JSONSerialization.data(withJSONObject: body)
        }
        return r
    }

    /// POST …/blob kind squawk_photo; the squawk must already be on the server.
    func squawkPhoto(aircraftId: String, squawkId: String, photoId: String, jpeg: Data) async throws {
        let boundary = "mtl-\(UUID().uuidString)"
        var body = Data()
        func field(_ k: String, _ v: String) { body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(k)\"\r\n\r\n\(v)\r\n".utf8)) }
        field("kind", "squawk_photo"); field("squawkId", squawkId); field("id", photoId)
        body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(photoId).jpg\"\r\nContent-Type: image/jpeg\r\n\r\n".utf8))
        body.append(jpeg)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        var r = URLRequest(url: url("api/aircraft/\(aircraftId)/blob"), timeoutInterval: 120)
        r.httpMethod = "POST"
        r.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        r.httpBody = body
        _ = try await json(r)
    }

    /// POST …/documents (JSON, base64): the upload is the create. Returns the new document's id.
    func document(aircraftId: String, meta: FileMeta, bytes: Data) async throws -> String {
        var body: [String: Any] = ["file": bytes.base64EncodedString(), "type": meta.type ?? "other",
                                   "fileName": meta.fileName ?? "document", "mimeType": meta.mimeType ?? "application/octet-stream"]
        if let t = meta.title { body["title"] = t }
        if meta.trackExpiry == true { body["trackExpiry"] = true }
        if let e = meta.expiresOn { body["expiresOn"] = e }
        var r = post("api/aircraft/\(aircraftId)/documents", body)
        r.timeoutInterval = 180
        let o = try await json(r)
        guard let id = (o["document"] as? [String: Any])?["id"] as? String else { throw Failure(status: 500, message: "No document came back.") }
        return id
    }

    /// The stored file (GET /api/document/{id}, RLS-checked).
    func documentFile(_ id: String) async throws -> Data {
        let (data, status) = try await send(URLRequest(url: url("api/document/\(id)"), timeoutInterval: 120))
        guard (200..<300).contains(status) else { throw Failure(status: status, message: "This file couldn't be downloaded (\(status)).") }
        return data
    }

    /// A mechanic link for one squawk (09 §4.12). Returns its URL.
    func mechanicLink(aircraftId: String, squawkId: String, recipient: String, days: Int, photos: Bool) async throws -> String {
        let o = try await json(post("api/aircraft/\(aircraftId)/mechanic-links", [
            "kind": "squawk", "squawkIds": [squawkId], "recipientLabel": recipient, "expiresInDays": days,
            "includePhotos": photos, "includeReporter": false,
        ]))
        guard let link = o["url"] as? String else { throw Failure(status: 500, message: "No link came back.") }
        return link
    }

    func timeChecks(aircraftId: String) async throws -> [TimeCheck] {
        let (data, status) = try await send(URLRequest(url: url("api/aircraft/\(aircraftId)/time-checks"), timeoutInterval: 30))
        guard (200..<300).contains(status) else { throw Failure(status: status, message: "Time checks failed (\(status)).") }
        return Self.parseTimeChecks(data)
    }

    /// Aircraft details through PostgREST; the owner-only RLS policy is the guard (W-AIRCRAFT-05, online only).
    func saveDetails(aircraftId: String, fields: [String: Any]) async throws {
        guard let supabase else { throw Failure(status: 0, message: "Not saved.") }
        var c = URLComponents(url: supabase.url.appending(path: "rest/v1/aircraft"), resolvingAgainstBaseURL: false)!
        c.queryItems = [URLQueryItem(name: "id", value: "eq.\(aircraftId)")]
        var r = URLRequest(url: c.url!, timeoutInterval: 30)
        r.httpMethod = "PATCH"
        r.setValue(supabase.key, forHTTPHeaderField: "apikey")
        r.setValue("return=representation", forHTTPHeaderField: "Prefer")
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        r.httpBody = try JSONSerialization.data(withJSONObject: fields)
        let (data, status) = try await send(r)
        guard (200..<300).contains(status) else { throw Failure(status: status, message: "Not saved (\(status)).") }
        if let rows = try? JSONSerialization.jsonObject(with: data) as? [Any], rows.isEmpty {
            throw Failure(status: 403, message: "Only the aircraft owner can edit these details.")
        }
    }

    /// The Federal Register's FAA final rules under 14 CFR 39 matching `term` (lib/faa/federalRegister.ts).
    func findAds(_ term: String) async throws -> [FoundAd] {
        var c = URLComponents(string: "https://www.federalregister.gov/api/v1/documents.json")!
        c.queryItems = [
            ("conditions[agencies][]", "federal-aviation-administration"), ("conditions[type][]", "RULE"),
            ("conditions[cfr][title]", "14"), ("conditions[cfr][part]", "39"), ("conditions[term]", term),
            ("order", "newest"), ("per_page", "40"),
        ].map { URLQueryItem(name: $0.0, value: $0.1) } + ["title", "effective_on", "html_url", "abstract", "docket_ids"].map { URLQueryItem(name: "fields[]", value: $0) }
        var r = URLRequest(url: c.url!, timeoutInterval: 30)
        r.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await http.data(for: r)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else { throw Failure(status: status, message: "The FAA list didn't answer (\(status)).") }
        return Self.parseFoundAds(data)
    }

    /// "Find completions in the logbooks" (POST …/maintenance/scan, online only, uses the AI allowance).
    func scanCompletions(aircraftId: String) async throws { _ = try await json(post("api/aircraft/\(aircraftId)/maintenance/scan")) }

    /// "Find equipment in the logbooks" (POST …/equipment/scan): proposals land in equipment_proposal. Returns how many.
    func scanEquipment(aircraftId: String) async throws -> Int {
        let o = try await json(post("api/aircraft/\(aircraftId)/equipment/scan"))
        return (o["proposed"] as? Int) ?? Int(o["proposed"] as? String ?? "") ?? 0
    }

    static func parseFoundAds(_ data: Data) -> [FoundAd] {
        let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
        return ((o?["results"] as? [[String: Any]]) ?? []).map { r in
            let number = ((r["docket_ids"] as? [String]) ?? []).lazy.compactMap { d -> String? in
                let t = d.trimmingCharacters(in: .whitespaces)
                guard t.lowercased().hasPrefix("ad ") else { return nil }
                return String(t.dropFirst(3)).trimmingCharacters(in: .whitespaces)
            }.first
            return FoundAd(adNumber: number, title: r["title"] as? String ?? "", abstract: r["abstract"] as? String,
                           effectiveOn: r["effective_on"] as? String, htmlUrl: r["html_url"] as? String ?? "")
        }
    }

    static func parseTimeChecks(_ data: Data) -> [TimeCheck] {
        ((try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] ?? []).compactMap { o in
            func d(_ k: String) -> Double? { (o[k] as? NSNumber)?.doubleValue ?? Double(o[k] as? String ?? "") }
            func flag(_ k: String) -> Bool { o[k] as? Bool ?? (o[k] as? String == "true") }
            guard let component = o["component"] as? String, let entry = o["entryId"] as? String,
                  let written = d("written"), let calculated = d("calculated") else { return nil }
            return TimeCheck(component: component, entryId: entry, pageLabel: (o["pageRef"] as? [String: Any])?["label"] as? String,
                             written: written, calculated: calculated, apart: o["result"] as? String == "apart",
                             difference: d("difference") ?? 0, digitSwap: flag("digitSwap"), dismissed: flag("dismissed"))
        }
    }
}

// MARK: Phase 5: plan and share (09 §4.4, §4.5, §4.11; online only, never queued). Port of Android's RecordsApi.kt.

/// One person with access to the aircraft (aircraft_share).
struct Person: Identifiable, Equatable, Sendable {
    let email: String
    let role: String
    var id: String { email }
}

extension RecordsAPI {
    private func get(_ path: String, _ query: [URLQueryItem] = []) -> URLRequest {
        var c = URLComponents(url: url(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { c.queryItems = query }
        return URLRequest(url: c.url!, timeoutInterval: 60)
    }

    /// The body of a 2xx answer, or the server's `error` verbatim.
    private func body(_ request: URLRequest) async throws -> Data {
        let (data, status) = try await send(request)
        guard (200..<300).contains(status) else {
            let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            throw Failure(status: status, message: o?["error"] as? String ?? "The server refused it (\(status)).")
        }
        return data
    }

    /// Suggested and planned visits over Plan ahead's 24 months (the snapshot carries Status's 12), raw for core's
    /// planDate and decoded for the screens.
    func visits(aircraftId: String) async throws -> (raw: String, visits: Visits) {
        let data = try await body(get("api/aircraft/\(aircraftId)/visits", [URLQueryItem(name: "horizonMonths", value: "24")]))
        return (String(decoding: data, as: UTF8.self), try JSONDecoder().decode(Visits.self, from: data))
    }

    /// A 30-day mechanic link for a planned visit (D12): `{ url, expiresAt, mailto }`. Never sends anything itself.
    func sendVisit(aircraftId: String, visitId: String, recipient: String, providerId: String?) async throws -> [String: Any] {
        var b: [String: Any] = ["recipientLabel": recipient, "expiresInDays": 30]
        if let providerId { b["providerId"] = providerId }
        return try await json(post("api/aircraft/\(aircraftId)/visits/\(visitId)/send", b))
    }

    /// The owner's record room links as the server sends them (kept on the phone so QR and copy work offline).
    func rooms(aircraftId: String) async throws -> Data { try await body(get("api/aircraft/\(aircraftId)/record-rooms")) }

    /// POST …/record-rooms: `{ id, url, qrPayload, expiresAt }`.
    func createRoom(aircraftId: String, _ b: [String: Any]) async throws -> [String: Any] {
        try await json(post("api/aircraft/\(aircraftId)/record-rooms", b))
    }

    /// PATCH …/record-rooms/{id}: `{ extendDays: 30 }` or `{ revoke: true }`.
    func updateRoom(aircraftId: String, roomId: String, _ b: [String: Any]) async throws -> [String: Any] {
        var r = post("api/aircraft/\(aircraftId)/record-rooms/\(roomId)", b)
        r.httpMethod = "PATCH"
        return try await json(r)
    }

    func roomOpens(aircraftId: String, roomId: String) async throws -> [RoomOpen] {
        parseOpens(try await body(get("api/aircraft/\(aircraftId)/record-rooms/\(roomId)/opens")))
    }

    /// The maintenance summary or pre-buy dossier PDF, or the due list CSV.
    func file(aircraftId: String, _ kind: ShareFile) async throws -> Data {
        var r = get("api/aircraft/\(aircraftId)/\(kind.path)", kind == .due ? [URLQueryItem(name: "type", value: "due")] : [])
        r.timeoutInterval = 120
        do { return try await body(r) } catch let e as Failure { throw Failure(status: e.status, message: "That file couldn't be made (\(e.status)).") }
    }

    // People with access: aircraft_share through PostgREST; the owner-only RLS policy is the guard, as on the web.

    private func rest(_ query: String, method: String = "GET", _ b: [String: Any]? = nil, prefer: String? = nil) throws -> URLRequest {
        guard let supabase else { throw Failure(status: 0, message: "People can't be reached from this phone.") }
        var r = URLRequest(url: URL(string: supabase.url.appending(path: "rest/v1/aircraft_share").absoluteString + "?" + query)!, timeoutInterval: 30)
        r.httpMethod = method
        r.setValue(supabase.key, forHTTPHeaderField: "apikey")
        if let prefer { r.setValue(prefer, forHTTPHeaderField: "Prefer") }
        if let b {
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            r.httpBody = try JSONSerialization.data(withJSONObject: b)
        }
        return r
    }

    func people(aircraftId: String) async throws -> [Person] {
        let (data, status) = try await send(rest("aircraft_id=eq.\(aircraftId)&select=invited_email,role&order=created_at"))
        guard (200..<300).contains(status) else { throw Failure(status: status, message: "People couldn't be loaded (\(status)).") }
        return ((try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] ?? []).map {
            Person(email: $0["invited_email"] as? String ?? "", role: $0["role"] as? String ?? "viewer")
        }
    }

    /// Give `email` access as editor or viewer, or change their role (upsert on aircraft and email, as addShare does).
    func setPerson(aircraftId: String, ownerId: String, email: String, role: String) async throws {
        let b: [String: Any] = ["aircraft_id": aircraftId, "invited_email": email.trimmingCharacters(in: .whitespaces).lowercased(),
                                "role": role, "invited_by": ownerId]
        let (_, status) = try await send(rest("on_conflict=aircraft_id,invited_email", method: "POST", b, prefer: "resolution=merge-duplicates,return=minimal"))
        guard (200..<300).contains(status) else { throw Failure(status: status, message: "Only the aircraft owner can share it.") }
    }

    func removePerson(aircraftId: String, email: String) async throws {
        let e = email.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? email
        let (_, status) = try await send(rest("aircraft_id=eq.\(aircraftId)&invited_email=eq.\(e)", method: "DELETE"))
        guard (200..<300).contains(status) else { throw Failure(status: status, message: "Not removed (\(status)).") }
    }
}

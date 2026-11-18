import Foundation

struct Session: Codable, Equatable, Sendable {
    var accessToken: String
    var refreshToken: String
    var expiresAt: Date
    var email: String?
}

enum AuthError: Error, Equatable {
    case offline, wrongCode, rateLimited, rejected, server

    /// Owner-facing copy (06 M-AUTH-01, 12 §10). Raw auth-service text is never shown.
    var message: String {
        switch self {
        case .offline: "Signing in needs signal. Try again when you have it."
        case .wrongCode: "That code didn't match. Check the newest email, or send it again."
        case .rateLimited: "Too many codes asked for. Wait a minute, then send it again."
        case .rejected: "That didn't work. Check the email address and try again."
        case .server: "Something went wrong on our side. Try again in a minute."
        }
    }

    /// Supabase Auth answers `{"error_code": "...", "msg": "..."}`; it reports a wrong and an expired code alike as `otp_expired`.
    static func from(status: Int, body: Data) -> AuthError {
        let code = (try? JSONSerialization.jsonObject(with: body) as? [String: Any])?["error_code"] as? String
        if code == "otp_expired" { return .wrongCode }
        if status == 429 || code?.contains("rate_limit") == true { return .rateLimited }
        return (400..<500).contains(status) ? .rejected : .server
    }
}

/// Email one-time code against Supabase Auth over plain URLSession (05 §8.2).
struct AuthClient: Sendable {
    let baseURL: URL
    let apiKey: String
    var http: URLSession = .shared

    /// Reads SupabaseHost / SupabasePublishableKey, set from Config/*.xcconfig through Info.plist.
    static func fromBundle(_ bundle: Bundle = .main) -> AuthClient {
        let host = bundle.object(forInfoDictionaryKey: "SupabaseHost") as? String ?? ""
        let key = bundle.object(forInfoDictionaryKey: "SupabasePublishableKey") as? String ?? ""
        guard !host.isEmpty, !key.isEmpty, let url = URL(string: "https://\(host)") else {
            preconditionFailure("SupabaseHost / SupabasePublishableKey missing from Info.plist; see apps/ios/Config.")
        }
        return AuthClient(baseURL: url, apiKey: key)
    }

    /// Sends the sign-in email (creates the account on first use).
    func sendCode(email: String) async throws {
        _ = try await post("otp", body: ["email": email, "create_user": true])
    }

    func verify(email: String, code: String) async throws -> Session {
        try Self.session(from: await post("verify", body: ["type": "email", "email": email, "token": code]))
    }

    func refresh(_ session: Session) async throws -> Session {
        try Self.session(from: await post("token", query: "grant_type=refresh_token", body: ["refresh_token": session.refreshToken]))
    }

    /// Revokes the refresh token on the server. Best effort: the device forgets the session either way.
    func signOut(_ session: Session) async {
        _ = try? await post("logout", body: [:], bearer: session.accessToken)
    }

    static func session(from data: Data, now: Date = .now) throws -> Session {
        struct Response: Decodable {
            struct User: Decodable { let email: String? }
            let access_token: String
            let refresh_token: String
            let expires_in: Double
            let user: User?
        }
        guard let r = try? JSONDecoder().decode(Response.self, from: data) else { throw AuthError.server }
        return Session(accessToken: r.access_token, refreshToken: r.refresh_token,
                       expiresAt: now.addingTimeInterval(r.expires_in), email: r.user?.email)
    }

    private func post(_ path: String, query: String? = nil, body: [String: Any], bearer: String? = nil) async throws -> Data {
        var components = URLComponents(url: baseURL.appending(path: "auth/v1/\(path)"), resolvingAgainstBaseURL: false)!
        components.query = query
        var request = URLRequest(url: components.url!, timeoutInterval: 20)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "apikey")
        if let bearer { request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization") }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let data: Data, response: URLResponse
        do {
            (data, response) = try await http.data(for: request)
        } catch let error as URLError where [.notConnectedToInternet, .networkConnectionLost, .timedOut,
                                             .cannotFindHost, .cannotConnectToHost, .dataNotAllowed].contains(error.code) {
            throw AuthError.offline
        } catch {
            throw AuthError.server
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else { throw AuthError.from(status: status, body: data) }
        return data
    }
}

import Foundation

struct Session: Codable, Equatable, Sendable {
    var accessToken: String
    var refreshToken: String
    var expiresAt: Date
    var email: String?
}

enum AuthError: Error, Equatable {
    case offline, wrongCode, expired, rateLimited, rejected, server
    case wrongPassword, accountExists, weakPassword, notConfirmed
    /// Apple or Google started but did not finish (cancelling is not an error and shows nothing).
    case providerFailed(String)

    /// Owner-facing copy (06 M-AUTH-01, 12 §10). Raw auth-service text is never shown.
    var message: String {
        switch self {
        case .offline: "Signing in needs signal. Try again when you have it."
        case .wrongCode: "That code didn't match. Check the newest email, or send it again."
        case .expired: "That code has expired. Send a new one."
        case .rateLimited: "Too many codes asked for. Wait a minute, then send it again."
        case .rejected: "That didn't work. Check the email address and try again."
        case .server: "Something went wrong on our side. Try again in a minute."
        // The three below are not in 06's copy list; written to 12's pattern (what happened, what to do).
        case .wrongPassword: "That email and password don't match. Try again, or email yourself a link."
        case .accountExists: "There's already an account for that email. Sign in instead."
        case .weakPassword: "Use at least 8 characters."
        case .notConfirmed: "Confirm your email first with the link or code we sent, then sign in."
        case .providerFailed(let name): "\(name) sign-in didn't finish. Try again, or use your email."
        }
    }

    /// Supabase Auth answers `{"error_code": "...", "msg": "..."}`; it reports a wrong and an expired code alike as `otp_expired`.
    static func from(status: Int, body: Data) -> AuthError {
        let code = (try? JSONSerialization.jsonObject(with: body) as? [String: Any])?["error_code"] as? String
        switch code {
        case "otp_expired": return .wrongCode
        case "invalid_credentials": return .wrongPassword
        case "user_already_exists", "email_exists": return .accountExists
        case "weak_password": return .weakPassword
        case "email_not_confirmed": return .notConfirmed
        default: break
        }
        if status == 429 || code?.contains("rate_limit") == true { return .rateLimited }
        if status == 408 { return .server }
        return (400..<500).contains(status) ? .rejected : .server
    }
}

/// Supabase Auth (GoTrue) over plain URLSession (05 §8.2): email link and code, password, Apple ID token, OAuth with PKCE.
struct AuthClient: Sendable {
    let baseURL: URL
    let apiKey: String
    var http: URLSession = .shared
    var refreshSession: (@Sendable (Session) async throws -> Session)?

    /// Reads SupabaseHost / SupabasePublishableKey, set from Config/*.xcconfig through Info.plist.
    static func fromBundle(_ bundle: Bundle = .main) -> AuthClient {
        let host = bundle.object(forInfoDictionaryKey: "SupabaseHost") as? String ?? ""
        let key = bundle.object(forInfoDictionaryKey: "SupabasePublishableKey") as? String ?? ""
        guard !host.isEmpty, !key.isEmpty, let url = URL(string: "https://\(host)") else {
            preconditionFailure("SupabaseHost / SupabasePublishableKey missing from Info.plist; see apps/ios/Config.")
        }
        return AuthClient(baseURL: url, apiKey: key)
    }

    /// Sends the one sign-in email: a 6-digit code and a link (creates the account on first use). With the PKCE
    /// challenge the link returns to `AuthFlow.emailReturn` with a code only this phone's verifier can exchange.
    func sendCode(email: String, challenge: String) async throws {
        _ = try await post("otp", query: redirect(AuthFlow.emailReturn),
                           body: ["email": email, "create_user": true, "code_challenge": challenge, "code_challenge_method": "s256"])
    }

    /// `type` is "email" for the sign-in code, "recovery" for the password-reset code.
    func verify(email: String, code: String, type: String = "email") async throws -> Session {
        try Self.session(from: await post("verify", body: ["type": type, "email": email, "token": code]))
    }

    /// Completes an email link or an OAuth return.
    func exchange(code: String, verifier: String) async throws -> Session {
        try Self.session(from: await post("token", query: "grant_type=pkce", body: ["auth_code": code, "code_verifier": verifier]))
    }

    /// Sign in with Apple: the identity token and the raw nonce whose hash Apple signed into it.
    func signInWithIdToken(provider: String, idToken: String, nonce: String) async throws -> Session {
        try Self.session(from: await post("token", query: "grant_type=id_token",
                                          body: ["provider": provider, "id_token": idToken, "nonce": nonce]))
    }

    /// The page ASWebAuthenticationSession opens; it ends at `AuthFlow.oauthReturn?code=…`.
    func authorizeURL(provider: String, challenge: String) -> URL {
        var components = URLComponents(url: baseURL.appending(path: "auth/v1/authorize"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "provider", value: provider),
            URLQueryItem(name: "redirect_to", value: AuthFlow.oauthReturn),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "s256"),
        ]
        return components.url!
    }

    func signIn(email: String, password: String) async throws -> Session {
        try Self.session(from: await post("token", query: "grant_type=password", body: ["email": email, "password": password]))
    }

    /// Returns the session when the project signs new accounts straight in, nil when it emails a confirmation first.
    func signUp(email: String, password: String, name: String, challenge: String) async throws -> Session? {
        var body: [String: Any] = ["email": email, "password": password, "code_challenge": challenge, "code_challenge_method": "s256"]
        if !name.isEmpty { body["data"] = ["full_name": name] }
        let data = try await post("signup", query: redirect(AuthFlow.emailReturn), body: body)
        return try? Self.session(from: data)
    }

    /// Emails a password-reset code (the recovery email).
    func sendReset(email: String) async throws {
        _ = try await post("recover", body: ["email": email])
    }

    func setPassword(_ password: String, session: Session) async throws {
        _ = try await post("user", method: "PUT", body: ["password": password], bearer: session.accessToken)
    }

    func refresh(_ session: Session) async throws -> Session {
        if let refreshSession { return try await refreshSession(session) }
        return try Self.session(from: await post("token", query: "grant_type=refresh_token", body: ["refresh_token": session.refreshToken]))
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

    private func redirect(_ url: String) -> String {
        "redirect_to=" + url.addingPercentEncoding(withAllowedCharacters: .alphanumerics)!
    }

    private func post(_ path: String, query: String? = nil, method: String = "POST", body: [String: Any],
                      bearer: String? = nil) async throws -> Data {
        var components = URLComponents(url: baseURL.appending(path: "auth/v1/\(path)"), resolvingAgainstBaseURL: false)!
        components.percentEncodedQuery = query
        var request = URLRequest(url: components.url!, timeoutInterval: 20)
        request.httpMethod = method
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

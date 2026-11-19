import CryptoKit
import Foundation

/// The pure pieces of the sign-in flows (05 §8.2, §8.4): PKCE, the Apple nonce, the return URLs, the password rule.
enum AuthFlow {
    /// OAuth (ASWebAuthenticationSession) returns here; registered in project.yml as a URL scheme.
    static let oauthReturn = "com.mytaillog.app://auth/callback"
    static let oauthScheme = "com.mytaillog.app"
    /// Email links return here as a Universal Link (associated domain applinks:mytaillog.com).
    static let emailReturn = "https://mytaillog.com/app/auth/callback"

    /// A random URL-safe string: the PKCE verifier (RFC 7636, 43–128 chars) and the Apple raw nonce.
    static func randomToken(bytes: Int = 32) -> String {
        var data = Data(count: bytes)
        _ = data.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, bytes, $0.baseAddress!) }
        return base64URL(data)
    }

    /// S256 code challenge for a verifier.
    static func challenge(for verifier: String) -> String {
        base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
    }

    /// Apple takes the SHA-256 of the nonce (hex); Supabase is given the raw nonce and checks it against the token.
    static func appleNonceHash(_ raw: String) -> String {
        SHA256.hash(data: Data(raw.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    /// 06 M-AUTH-01: "At least 8 characters".
    static func isAcceptablePassword(_ password: String) -> Bool { password.count >= 8 }

    enum Callback: Equatable {
        case code(String)
        /// The provider or the auth service reported a failure (`error_code` when it gave one).
        case failed(code: String?)
    }

    /// Accepts only this app's two return routes; any other URL is not an instruction to sign in.
    /// Supabase puts errors in the query or the fragment, so both are read.
    static func parseCallback(_ url: URL) -> Callback? {
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        let scheme = parts.scheme?.lowercased(), host = parts.host?.lowercased()
        let isOAuth = scheme == oauthScheme && host == "auth" && parts.path == "/callback"
        let isEmail = scheme == "https" && (host == "mytaillog.com" || host == "www.mytaillog.com")
            && parts.path == "/app/auth/callback"
        guard isOAuth || isEmail else { return nil }
        var items = parts.queryItems ?? []
        if let fragment = parts.fragment, let extra = URLComponents(string: "?" + fragment)?.queryItems {
            items += extra
        }
        func value(_ name: String) -> String? { items.first { $0.name == name }?.value.flatMap { $0.isEmpty ? nil : $0 } }
        if value("error") != nil || value("error_code") != nil { return .failed(code: value("error_code")) }
        if let code = value("code") { return .code(code) }
        return .failed(code: nil)
    }

    private static func base64URL(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

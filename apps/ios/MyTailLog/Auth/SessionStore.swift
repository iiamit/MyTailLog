import Foundation
import Security

/// The Supabase session (and the email link's PKCE verifier) in the Keychain, this device only,
/// readable after first unlock (05 §8.1).
/// shortcut: no keychain access group yet; add one when the widget/intent/share extensions arrive (phase 6).
enum SessionKeychain {
    private static func query(_ account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "com.mytaillog.app.session",
            kSecAttrAccount as String: account,
        ]
    }

    static func load() -> Session? {
        loadData("supabase").flatMap { try? JSONDecoder().decode(Session.self, from: $0) }
    }

    static func save(_ session: Session) {
        guard let data = try? JSONEncoder().encode(session) else { return }
        saveData(data, "supabase")
    }

    static func delete() { deleteData("supabase") }

    /// The verifier of the last email sent from this phone; kept across launches because the owner leaves for Mail.
    static var emailVerifier: String? {
        get { loadData("email-pkce").map { String(decoding: $0, as: UTF8.self) } }
        set { if let newValue { saveData(Data(newValue.utf8), "email-pkce") } else { deleteData("email-pkce") } }
    }

    private static func loadData(_ account: String) -> Data? {
        var q = query(account)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess else { return nil }
        return item as? Data
    }

    private static func saveData(_ data: Data, _ account: String) {
        deleteData(account)
        var q = query(account)
        q[kSecValueData as String] = data
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(q as CFDictionary, nil)
    }

    private static func deleteData(_ account: String) {
        SecItemDelete(query(account) as CFDictionary)
    }
}

@MainActor @Observable
final class SessionStore {
    private(set) var session: Session?
    /// Shown as the first line of sign-in when a session could not be refreshed (06 M-AUTH-01).
    private(set) var notice: String?
    /// An email link opened without this phone's PKCE verifier, or one that could not be used (05 §8.4):
    /// sign-in asks for the code from the same email instead of showing an error.
    var linkNeedsCode = false

    private let auth: AuthClient
    private let core: any CoreBridge

    init(auth: AuthClient, core: any CoreBridge) {
        self.auth = auth
        self.core = core
        session = SessionKeychain.load()
    }

    /// One email, a link and a code. Resends reuse the verifier so the first email's link still completes here.
    func sendCode(email: String) async throws {
        try await auth.sendCode(email: email, challenge: AuthFlow.challenge(for: emailVerifier()))
    }

    func verify(email: String, code: String) async throws {
        try await adopt(auth.verify(email: email, code: code))
    }

    /// An email link (Universal Link) or a stray OAuth return opened the app. A link this phone cannot complete
    /// becomes the code prompt, never an error.
    func open(_ url: URL) async {
        guard session == nil, let callback = AuthFlow.parseCallback(url) else { return }
        guard case .code(let code) = callback, let verifier = SessionKeychain.emailVerifier else {
            linkNeedsCode = true
            return
        }
        do {
            try await adopt(auth.exchange(code: code, verifier: verifier))
        } catch {
            linkNeedsCode = true
        }
    }

    func signInWithApple(idToken: String, nonce: String) async throws {
        do {
            try await adopt(auth.signInWithIdToken(provider: "apple", idToken: idToken, nonce: nonce))
        } catch AuthError.offline {
            throw AuthError.offline
        } catch {
            throw AuthError.providerFailed("Apple")
        }
    }

    /// Google through Supabase OAuth with PKCE; `present` runs ASWebAuthenticationSession and returns the callback URL.
    /// The verifier lives only for this call: the web session is in-process, so it cannot outlive the app.
    func signInWithGoogle(present: (URL) async throws -> URL) async throws {
        let verifier = AuthFlow.randomToken()
        let callback = try await present(auth.authorizeURL(provider: "google", challenge: AuthFlow.challenge(for: verifier)))
        guard case .code(let code)? = AuthFlow.parseCallback(callback) else { throw AuthError.providerFailed("Google") }
        do {
            try await adopt(auth.exchange(code: code, verifier: verifier))
        } catch AuthError.offline {
            throw AuthError.offline
        } catch {
            throw AuthError.providerFailed("Google")
        }
    }

    func signIn(email: String, password: String) async throws {
        try await adopt(auth.signIn(email: email, password: password))
    }

    /// True when signed in; false when the project emails a confirmation first (it carries a link and a code).
    func signUp(email: String, password: String, name: String) async throws -> Bool {
        guard let session = try await auth.signUp(email: email, password: password, name: name,
                                                  challenge: AuthFlow.challenge(for: emailVerifier())) else { return false }
        await adopt(session)
        return true
    }

    func sendReset(email: String) async throws {
        try await auth.sendReset(email: email)
    }

    /// The reset code signs in (recovery); the new password is set before the session is kept.
    func resetPassword(email: String, code: String, newPassword: String) async throws {
        let session = try await auth.verify(email: email, code: code, type: "recovery")
        try await auth.setPassword(newPassword, session: session)
        await adopt(session)
    }

    private func emailVerifier() -> String {
        if let existing = SessionKeychain.emailVerifier { return existing }
        let fresh = AuthFlow.randomToken()
        SessionKeychain.emailVerifier = fresh
        return fresh
    }

    private func adopt(_ session: Session) async {
        SessionKeychain.save(session)
        SessionKeychain.emailVerifier = nil
        notice = nil
        linkNeedsCode = false
        self.session = session
        await core.setAccessToken(session.accessToken)
    }

    /// On launch and on return to the foreground. Offline or a server hiccup keeps the session (offline first);
    /// only a refresh the server refuses signs the owner out.
    func refreshIfNeeded() async {
        guard let current = session else { return }
        guard current.expiresAt.timeIntervalSinceNow < 300 else {
            await core.setAccessToken(current.accessToken)
            return
        }
        do {
            let fresh = try await auth.refresh(current)
            SessionKeychain.save(fresh)
            session = fresh
            await core.setAccessToken(fresh.accessToken)
        } catch AuthError.offline, AuthError.server {
            return
        } catch {
            await forget()
            notice = "You've been signed out. Sign in again to keep syncing."
        }
    }

    /// The session for an API call, refreshed first when it is about to expire.
    func currentSession() async throws -> Session {
        await refreshIfNeeded()
        guard let session else { throw AuthError.server }
        return session
    }

    /// shortcut: phase 0 has no outbox, so this is the "nothing unsent" path of 05 §8.6; add the unsent-work prompt with sync.
    func signOut() async {
        // This phone stops getting the account's reminders while the session can still say so (06 M-SYS-05).
        await Push.shared.stop()
        if let session { await auth.signOut(session) }
        await forget()
    }

    private func forget() async {
        SessionKeychain.delete()
        SessionKeychain.emailVerifier = nil
        session = nil
        await core.wipe()
    }
}

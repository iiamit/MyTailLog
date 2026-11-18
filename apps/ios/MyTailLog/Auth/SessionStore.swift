import Foundation
import Security

/// The Supabase session in the Keychain, this device only, readable after first unlock (05 §8.1).
/// shortcut: no keychain access group yet; add one when the widget/intent/share extensions arrive (phase 6).
enum SessionKeychain {
    private static var query: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "com.mytaillog.app.session",
            kSecAttrAccount as String: "supabase",
        ]
    }

    static func load() -> Session? {
        var q = query
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
        return try? JSONDecoder().decode(Session.self, from: data)
    }

    static func save(_ session: Session) {
        guard let data = try? JSONEncoder().encode(session) else { return }
        delete()
        var q = query
        q[kSecValueData as String] = data
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(q as CFDictionary, nil)
    }

    static func delete() {
        SecItemDelete(query as CFDictionary)
    }
}

@MainActor @Observable
final class SessionStore {
    private(set) var session: Session?
    /// Shown as the first line of sign-in when a session could not be refreshed (06 M-AUTH-01).
    private(set) var notice: String?

    private let auth: AuthClient
    private let core: any CoreBridge

    init(auth: AuthClient, core: any CoreBridge) {
        self.auth = auth
        self.core = core
        session = SessionKeychain.load()
    }

    func sendCode(email: String) async throws {
        try await auth.sendCode(email: email)
    }

    func verify(email: String, code: String) async throws {
        let session = try await auth.verify(email: email, code: code)
        SessionKeychain.save(session)
        notice = nil
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

    /// shortcut: phase 0 has no outbox, so this is the "nothing unsent" path of 05 §8.6; add the unsent-work prompt with sync.
    func signOut() async {
        if let session { await auth.signOut(session) }
        await forget()
    }

    private func forget() async {
        SessionKeychain.delete()
        session = nil
        await core.wipe()
    }
}

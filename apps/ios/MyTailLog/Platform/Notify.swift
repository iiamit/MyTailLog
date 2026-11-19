import Foundation
import UIKit
import UserNotifications

// Notifications (05 §10): APNs registration through POST /api/push, the inbox (GET /api/me/notifications) and the
// account's reminder settings (/api/me/preferences, /api/me/reminders/test). The web's endpoints; nothing new on the
// server. Port of Android's Notify.kt account routes.

struct InboxItem: Decodable, Equatable, Identifiable, Sendable {
    struct Action: Decodable, Equatable, Sendable { let id: String; let label: String? }
    let id: String
    let aircraftId: String?
    let title: String?
    let body: String?
    let deepLink: String?
    let actions: [Action]?
    let createdAt: String
    var readAt: String?

    var read: Bool { readAt != nil }
}

/// Inbox rows under one heading per aircraft (by tail), account-wide rows last; newest first inside each, groups in
/// order of their newest row (05 §10.2 grouping, as the pushes are threaded).
func inboxGroups(_ items: [InboxItem], tails: [String: String]) -> [(title: String, items: [InboxItem])] {
    var order: [String] = []
    var groups: [String: [InboxItem]] = [:]
    for n in items.sorted(by: { $0.createdAt > $1.createdAt }) {
        let key = n.aircraftId ?? AppLinks.parse(n.deepLink)?.aircraftId ?? ""
        if groups[key] == nil { order.append(key) }
        groups[key, default: []].append(n)
    }
    let ordered = order.filter { !$0.isEmpty } + order.filter(\.isEmpty)
    return ordered.map { key in (key.isEmpty ? "Account" : tails[key] ?? "Aircraft", groups[key]!) }
}

/// "12 min ago", "3 h ago", "Nov 16", as the web's inbox says it.
func inboxWhen(_ iso: String, now: Date = .now, zone: TimeZone = .current) -> String {
    guard let at = Day.instant(iso) else { return "" }
    let mins = Int(now.timeIntervalSince(at) / 60)
    if mins < 60 { return "\(max(1, mins)) min ago" }
    if mins < 24 * 60 { return "\((mins + 30) / 60) h ago" }
    let d = Day.parts(WidgetText.localDay(at, zone: zone))
    return "\(Day.months[d.m - 1]) \(d.d)"
}

/// POST /api/me/reminders/test's answer as one sentence (the web's and Android's words).
func testResultText(devices: Int, email: Bool) -> String {
    let d = devices == 1 ? "1 device" : "\(devices) devices"
    switch (devices > 0, email) {
    case (true, true): return "Reached \(d) and your email."
    case (true, false): return "Reached \(d)."
    case (false, true): return "Reached your email."
    case (false, false): return "Nothing was reached: no phone is signed in and the email didn't send."
    }
}

struct NotifyAPI: Sendable {
    let apiURL: URL
    let token: @Sendable () async throws -> String
    var http: URLSession = .shared

    struct Failed: Error { let status: Int; let message: String }

    func inbox() async throws -> [InboxItem] {
        struct Body: Decodable { let items: [InboxItem] }
        return try await JSONDecoder().decode(Body.self, from: send("GET", "api/me/notifications")).items
    }

    func markRead(_ id: String) async throws { _ = try await send("POST", "api/me/notifications/\(id)", ["read": true]) }

    /// Runs a row action on the server; returns where to go next, if anywhere.
    func act(_ id: String, _ actionId: String) async throws -> String? {
        let o = try await JSONSerialization.jsonObject(with: send("POST", "api/me/notifications/\(id)/action", ["actionId": actionId])) as? [String: Any]
        return o?["deepLink"] as? String
    }

    /// profile.preferences with `alerts` resolved over the defaults.
    func preferences() async throws -> [String: Any] {
        try await JSONSerialization.jsonObject(with: send("GET", "api/me/preferences")) as? [String: Any] ?? [:]
    }

    /// Merged by the server per alerts key, so a phone change keeps the web's lead times.
    func savePreferences(_ patch: [String: Any]) async throws -> [String: Any] {
        try await JSONSerialization.jsonObject(with: send("PATCH", "api/me/preferences", patch)) as? [String: Any] ?? [:]
    }

    func test() async throws -> String {
        let o = try await JSONSerialization.jsonObject(with: send("POST", "api/me/reminders/test", [:])) as? [String: Any] ?? [:]
        return testResultText(devices: o["devices"] as? Int ?? 0, email: o["email"] as? Bool ?? false)
    }

    func registerDevice(_ deviceToken: String) async throws { _ = try await send("POST", "api/push", ["token": deviceToken, "platform": "ios"]) }

    func unregisterDevice(_ deviceToken: String) async throws { _ = try await send("DELETE", "api/push", ["token": deviceToken, "platform": "ios"]) }

    private func send(_ method: String, _ path: String, _ body: [String: Any]? = nil) async throws -> Data {
        var request = URLRequest(url: apiURL.appending(path: path), timeoutInterval: 20)
        request.httpMethod = method
        request.setValue("Bearer \(try await token())", forHTTPHeaderField: "Authorization")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await http.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw Failed(status: status, message: message ?? "The server refused it (\(status)).")
        }
        return data
    }
}

/// This phone's APNs registration (05 §10). The device token goes to POST /api/push on sign-in and every launch (a
/// stale token is a reminder that silently stops arriving), unless "Reminders on this phone" is off.
@MainActor @Observable
final class Push {
    static let shared = Push()
    static let onKey = "push.on"
    private static let tokenKey = "push.token"

    enum State: Equatable { case unknown, registered, off, failed(String) }
    private(set) var state: State = .unknown
    var api: NotifyAPI?

    static var on: Bool { UserDefaults.standard.object(forKey: onKey) as? Bool ?? true }

    /// Asks for permission the first time (`.alert, .sound, .badge`, no provisional: 06 M-SYS-05), then registers.
    func start() async {
        guard Self.on else { state = .off; return }
        let center = UNUserNotificationCenter.current()
        if await center.notificationSettings().authorizationStatus == .notDetermined {
            _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
        }
        UIApplication.shared.registerForRemoteNotifications()
    }

    func didRegister(_ deviceToken: Data) async {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        guard Self.on, let api else { return }
        do {
            try await api.registerDevice(hex)
            UserDefaults.standard.set(hex, forKey: Self.tokenKey)
            state = .registered
        } catch {
            state = .failed((error as? NotifyAPI.Failed)?.message ?? error.localizedDescription)
        }
    }

    func didFail(_ message: String) { state = .failed(message) }

    /// Sign-out and "Reminders on this phone" off: this device only (06 M-SYS-05), with the owner's own session.
    func stop() async {
        if let t = UserDefaults.standard.string(forKey: Self.tokenKey), let api { try? await api.unregisterDevice(t) }
        UserDefaults.standard.removeObject(forKey: Self.tokenKey)
        UIApplication.shared.unregisterForRemoteNotifications()
        state = .off
    }
}

/// Where tapped notifications and intents hand their link to the shell.
@MainActor @Observable
final class LinkInbox {
    static let shared = LinkInbox()
    var pending: AppLink?
}

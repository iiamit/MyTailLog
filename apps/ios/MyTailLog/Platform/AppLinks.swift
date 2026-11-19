import Foundation

// One route table for notifications, widgets, the Live Activity, intents, Spotlight and Universal Links (05 §5.5).
// Pure, so it is unit-tested. Port of Android's AppLinks.kt: keep the two in step. Shared with the widget extension.

/// Where a link lands inside the app.
enum LinkTarget: String, Sendable {
    case status, items, item, plan, visit, entry, review, queue, scan, flight, newSquawk, squawk, ad, docs, doc, share
    case sync, settings, reminders, inbox
}

/// A parsed link: `aircraftId` nil means the last opened aircraft.
struct AppLink: Equatable, Sendable {
    let aircraftId: String?
    let target: LinkTarget
    var arg: String? = nil
}

enum AppLinks {
    /// The https form every widget, intent, Spotlight item and Live Activity uses.
    static let root = "https://mytaillog.com/app"

    static func url(_ aircraftId: String?, _ path: String = "") -> URL {
        URL(string: root + (aircraftId.map { "/a/\($0)" } ?? "") + (path.isEmpty ? "" : "/\(path)"))!
    }

    /// `https://mytaillog.com/app/a/{id}/…`, `https://mytaillog.com/app/{route}` (last opened aircraft), and the server's
    /// `mytaillog://aircraft/{id}/…` deep links (notification rows and pushes, the web's appLinkToWeb vocabulary).
    /// Nil for anything else, including the sign-in return (`/app/auth/callback`) and the OAuth scheme.
    static func parse(_ raw: String?) -> AppLink? {
        guard let raw = raw?.trimmingCharacters(in: .whitespaces), !raw.isEmpty,
              let c = URLComponents(string: raw), let scheme = c.scheme?.lowercased() else { return nil }
        let path: String
        switch scheme {
        case "mytaillog":
            path = "/" + (c.host ?? "") + c.path
        case "https", "http":
            guard let host = c.host?.lowercased(), host == "mytaillog.com" || host.hasSuffix(".mytaillog.com") else { return nil }
            guard c.path == "/app" || c.path.hasPrefix("/app/") else { return nil }
            path = String(c.path.dropFirst(4))
        default:
            return nil
        }
        let segs = path.split(separator: "/").map(String.init)
        if segs.first == "auth" { return nil }
        let id: String?, rest: [String]
        if segs.count >= 2, ["a", "aircraft"].contains(segs[0]) { (id, rest) = (segs[1], Array(segs.dropFirst(2))) } else { (id, rest) = (nil, segs) }
        // The web's section words ("status", "books", "maint") are dropped so both vocabularies meet.
        let sections: Set<String> = ["status", "books", "logbooks", "maint", "maintenance"]
        let r = rest.count > 1 && sections.contains(rest[0]) ? Array(rest.dropFirst()) : rest
        func link(_ t: LinkTarget, _ arg: String? = nil) -> AppLink { AppLink(aircraftId: id, target: t, arg: arg) }
        switch r.count {
        case 0: return link(.status)
        case 1:
            switch r[0] {
            case "due", "items": return link(.items)
            case "plan": return link(.plan)
            case "review": return link(.review)
            case "queue": return link(.queue)
            case "scan": return link(.scan)
            case "flight": return link(.flight)
            case "docs", "documents": return link(.docs)
            case "share": return link(.share)
            case "sync": return link(.sync)
            case "settings": return link(.settings)
            case "notifications": return link(.inbox)
            default: return link(.status) // an unknown path still opens the aircraft (03 §10.3)
            }
        default:
            switch (r[0], r[1]) {
            case ("item", let x): return link(.item, x)
            case ("visit", let x): return link(.visit, x)
            case ("entry", let x): return link(.entry, x)
            case ("review", _): return link(.review)
            case ("squawk", "new"): return link(.newSquawk)
            case ("squawk", let x): return link(.squawk, x)
            case ("ad", let x): return link(.ad, x)
            case ("doc", let x): return link(.doc, x)
            case ("settings", "notifications"): return link(.reminders)
            default: return link(.status)
            }
        }
    }

    /// Pushes, inbox rows and reading updates group by aircraft (05 §10.2); account-wide ones share one group.
    static func thread(_ deepLink: String?) -> String {
        parse(deepLink)?.aircraftId.map { "aircraft-\($0)" } ?? "account"
    }
}

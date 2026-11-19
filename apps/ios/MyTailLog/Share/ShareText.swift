import CoreImage
import CoreImage.CIFilterBuiltins
import UIKit

// Record rooms (08 §3.16, 09 §4.11) on the phone: the list the server sends, what a new one holds, and the words for
// expiry and opens (06 M-SHARE-01..03, 12). Port of Android's ShareText.kt: keep the two in step.

/// One record room link (GET …/record-rooms row). `url` is nil only if the server could not decrypt the token.
struct Room: Identifiable, Equatable, Sendable {
    let id: String
    var label: String
    var audience: String
    var url: String?
    var createdAt: String
    var expiresAt: String
    var revokedAt: String?
    var active: Bool
    var opens: Int
    var lastOpenedAt: String?
    var logbooks: Int
    var documents: Int
    var scans: Bool
    var summary: Bool
    var squawks: Bool
    var mapWindow: String
}

/// One open: one browser within 30 minutes, with the parts of the room it looked at.
struct RoomOpen: Equatable, Sendable {
    let openedAt: String
    let lastAt: String
    let sections: [String]
}

private func obj(_ data: Data) -> Any? { try? JSONSerialization.jsonObject(with: data) }

func parseRooms(_ data: Data) -> [Room] {
    ((obj(data) as? [[String: Any]]) ?? []).compactMap { o in
        let inc = o["includes"] as? [String: Any] ?? [:]
        guard let id = o["id"] as? String, let expires = o["expiresAt"] as? String else { return nil }
        return Room(id: id, label: o["label"] as? String ?? "", audience: o["audience"] as? String ?? "other", url: o["url"] as? String,
                    createdAt: o["createdAt"] as? String ?? "", expiresAt: expires, revokedAt: o["revokedAt"] as? String,
                    active: o["active"] as? Bool ?? false, opens: (o["opens"] as? NSNumber)?.intValue ?? 0, lastOpenedAt: o["lastOpenedAt"] as? String,
                    logbooks: (inc["logbookIds"] as? [Any])?.count ?? 0, documents: (inc["documentIds"] as? [Any])?.count ?? 0,
                    scans: inc["scans"] as? Bool ?? false, summary: inc["summary"] as? Bool ?? false, squawks: inc["squawks"] as? Bool ?? false,
                    mapWindow: o["mapWindow"] as? String ?? "whole_life")
    }
}

func parseOpens(_ data: Data) -> [RoomOpen] {
    ((obj(data) as? [[String: Any]]) ?? []).compactMap { o in
        guard let at = o["openedAt"] as? String else { return nil }
        return RoomOpen(openedAt: at, lastAt: o["lastAt"] as? String ?? at, sections: o["sections"] as? [String] ?? [])
    }
}

/// The rooms list body as kept on the phone: only JSON arrays, so a cached error never replaces the list.
func isRoomList(_ data: Data) -> Bool { obj(data) is [Any] }

/// The four people a hand-off starts from (M-SHARE-01). `people` is "someone else"; co-owners get an invite instead.
enum Audience: String, CaseIterable, Sendable {
    case ia, buyer, insurer, people

    var key: String { self == .people ? "other" : rawValue }
    var days: Int { self == .insurer ? 14 : 30 }
    var mapWindow: String { self == .ia ? "line_ahead" : self == .insurer ? "last_5_years" : "whole_life" }
    /// "What your IA opens first".
    var recipient: String { [.ia: "your IA", .buyer: "the buyer", .insurer: "the insurer"][self] ?? "they" }
}

/// The days a link can stay open (09 §4.11).
let roomDays = [7, 14, 30, 90, 180]

/// What a new room holds. Defaults per audience: the IA and the buyer get everything, the insurer the summary and documents.
struct RoomDraft: Equatable {
    var audience: Audience
    var label: String
    var days: Int
    var summary: Bool
    var logbookIds: Set<String>
    var scans: Bool
    var documentIds: Set<String>
    var squawks: Bool

    static func of(_ a: Audience, tail: String, logbooks: [String], documents: [String]) -> RoomDraft {
        RoomDraft(audience: a, label: defaultLabel(a, tail), days: a.days, summary: true,
                  logbookIds: a == .insurer ? [] : Set(logbooks), scans: a != .insurer, documentIds: Set(documents), squawks: a == .ia)
    }

    var body: [String: Any] {
        ["label": label.trimmingCharacters(in: .whitespaces), "audience": audience.key, "mapWindow": audience.mapWindow, "cover": "map",
         "includeSummary": summary, "includeDossier": audience == .buyer, "logbookIds": logbookIds.sorted(), "includeScans": scans,
         "documentIds": documentIds.sorted(), "includeSquawks": squawks, "includeReporters": false, "expiresInDays": days]
    }

    var holdsSomething: Bool { summary || !logbookIds.isEmpty || !documentIds.isEmpty || squawks }
}

func defaultLabel(_ a: Audience, _ tail: String) -> String {
    switch a {
    case .ia: "\(tail) annual, for my IA"
    case .buyer: "\(tail) pre-buy"
    case .insurer: "\(tail), for my insurer"
    case .people: "\(tail) records"
    }
}

func instant(_ iso: String) -> Date? { Day.instant(iso) }

/// The calendar day of an instant in `zone` ("2026-12-18").
func localDay(_ iso: String, _ zone: TimeZone) -> String {
    guard let d = instant(iso) else { return String(iso.prefix(10)) }
    var c = Calendar(identifier: .gregorian)
    c.timeZone = zone
    let p = c.dateComponents([.year, .month, .day], from: d)
    return String(format: "%04d-%02d-%02d", p.year!, p.month!, p.day!)
}

/// "Dec 18, 2026, in 30 days" / "ended Nov 2" / "revoked Nov 2".
func roomExpiry(_ r: Room, now: Date = .now, zone: TimeZone = .current) -> String {
    let today = localDay(ISO8601DateFormatter().string(from: now), zone)
    if let revoked = r.revokedAt { return "revoked \(dayDate(localDay(revoked, zone), today: today))" }
    let end = localDay(r.expiresAt, zone)
    if (instant(r.expiresAt) ?? .distantPast) <= now { return "ended \(dayDate(end, today: today))" }
    let days = Day.between(today, end)
    return "\(longDate(end)), \(days <= 0 ? "today" : days == 1 ? "tomorrow" : "in \(days) days")"
}

/// The list row's second line: "Expires Dec 18 · opened 3 times · last Nov 17".
func roomLine(_ r: Room, now: Date = .now, zone: TimeZone = .current) -> String {
    let today = localDay(ISO8601DateFormatter().string(from: now), zone)
    let end = r.revokedAt.map { "Revoked \(dayDate(localDay($0, zone), today: today))" }
        ?? (!r.active ? "Ended \(dayDate(localDay(r.expiresAt, zone), today: today))" : "Expires \(dayDate(localDay(r.expiresAt, zone), today: today))")
    let opens = r.opens == 0 ? "not opened yet" : r.opens == 1 ? "opened once" : "opened \(r.opens) times"
    let last = r.lastOpenedAt.map { " · last \(dayDate(localDay($0, zone), today: today))" } ?? ""
    return "\(end) · \(opens)\(last)"
}

/// "2 logbooks with their scans, 1 document and the maintenance summary".
func roomHolds(_ r: Room) -> String {
    var parts: [String] = []
    if r.logbooks > 0 { parts.append((r.logbooks == 1 ? "1 logbook" : "\(r.logbooks) logbooks") + (r.scans ? " with their scans" : "")) }
    if r.documents > 0 { parts.append(r.documents == 1 ? "1 document" : "\(r.documents) documents") }
    if r.summary { parts.append("the maintenance summary") }
    if r.squawks { parts.append("open squawks") }
    let s = parts.isEmpty ? "Nothing yet" : parts.count == 1 ? parts[0] : parts.dropLast().joined(separator: ", ") + " and " + parts.last!
    return s.prefix(1).uppercased() + s.dropFirst()
}

/// "Opens on" (M-SHARE-02): what the recipient sees first.
func roomOpensOn(_ mapWindow: String) -> String {
    switch mapWindow {
    case "line_ahead": "The line ahead, then the tabs"
    case "last_5_years": "The map of the last five years, then the tabs"
    default: "The map of the whole life, then the tabs"
    }
}

/// "mytaillog.com/r/7KQ2M4…" for the link row: the scheme dropped, the token kept whole (it is what the QR encodes).
func shortUrl(_ url: String) -> String {
    url.hasPrefix("https://") ? String(url.dropFirst(8)) : url.hasPrefix("http://") ? String(url.dropFirst(7)) : url
}

/// One open as a log line: "Nov 17, 9:41 AM · Status, Logbooks".
func openLine(_ o: RoomOpen, zone: TimeZone = .current) -> String {
    guard let t = instant(o.openedAt) else { return o.openedAt }
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.timeZone = zone
    f.dateFormat = "MMM d, h:mm a"
    let stamp = f.string(from: t)
    return o.sections.isEmpty ? stamp : "\(stamp) · \(o.sections.map { $0.prefix(1).uppercased() + $0.dropFirst() }.joined(separator: ", "))"
}

/// Roles as the owner reads them (M-SHARE-03).
func roleWord(_ role: String) -> String { role == "editor" ? "Editor" : role == "owner" ? "Owner" : "Viewer" }

/// The server-made files (M-SHARE-01 "Files"; 08 summary, dossier, exports).
enum ShareFile: String, CaseIterable, Identifiable, Sendable {
    case summary, dossier, due
    var id: String { rawValue }
    var path: String { self == .due ? "export" : rawValue }
    var title: String { [.summary: "Share a summary", .dossier: "Get the pre-buy dossier", .due: "Export the due list"][self]! }
    func fileName(_ tail: String) -> String {
        [.summary: "\(tail) maintenance summary.pdf", .dossier: "\(tail) pre-buy dossier.pdf", .due: "\(tail) due list.csv"][self]!
    }
}

/// The QR of `text` (CoreImage, no margin: the card draws the quiet zone), one pixel per module, black on white.
func qrImage(_ text: String) -> UIImage? {
    let f = CIFilter.qrCodeGenerator()
    f.message = Data(text.utf8)
    f.correctionLevel = "M"
    guard let out = f.outputImage, let cg = CIContext().createCGImage(out, from: out.extent) else { return nil }
    return UIImage(cgImage: cg)
}

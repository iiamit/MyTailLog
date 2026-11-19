import Foundation

/// Any JSON value read back from the core (payloads, diff cells, mirror rows).
enum AnyJSON: Codable, Equatable, Sendable {
    case string(String), number(Double), bool(Bool), array([AnyJSON]), object([String: AnyJSON]), null

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let n = try? c.decode(Double.self) { self = .number(n) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let a = try? c.decode([AnyJSON].self) { self = .array(a) }
        else { self = .object(try c.decode([String: AnyJSON].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let s): try c.encode(s)
        case .number(let n): try c.encode(n)
        case .bool(let b): try c.encode(b)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        case .null: try c.encodeNil()
        }
    }

    /// How a conflict table shows the value (06 M-SYS-01).
    var display: String {
        switch self {
        case .string(let s): s.isEmpty ? "Empty" : s
        case .number(let n): n == n.rounded() && abs(n) < 1e15 ? String(Int(n)) : String(n)
        case .bool(let b): b ? "Yes" : "No"
        case .array(let a): a.isEmpty ? "None" : "\(a.count) items"
        case .object: "Details"
        case .null: "None"
        }
    }

    var string: String? { if case .string(let s) = self { s } else { nil } }
}

/// One change in outbox.db (05 §6.2).
struct OutboxItem: Decodable, Identifiable, Equatable, Sendable {
    let id: String
    let aircraftId: String
    let type: String
    let label: String
    let createdAt: Int64
    let attempts: Int64
    let nextTryAt: Int64?
    /// pending | sending | conflict | refused | blocked
    let status: String
    let error: String?
    let targetTable: String?
    let targetId: String?
    let dependsOn: String?
    let payload: [String: AnyJSON]
}

/// What a file job carries besides its bytes (05 §7.2).
struct FileMeta: Codable, Equatable, Sendable {
    var pageId: String
    var logbookId: String
    var batchId: String?
    var phash: String?
    var capturedAt: String
    var isHandwritten: Bool
    /// The year read off the page, for the queue's lands-in line when the camera couldn't show it (05 §15.2).
    var year: Int?
}

/// A page (or its thumbnail) waiting to upload: held | uploading | uploaded | registered | failed.
struct FileJob: Decodable, Identifiable, Equatable, Sendable {
    let id: String
    let kind: String
    let aircraftId: String
    let localPath: String
    let bytes: Int64
    let status: String
    let progress: Double
    let attempts: Int64
    let error: String?
    let createdAt: Int64
    let meta: FileMeta
}

struct ActivityRow: Decodable, Equatable, Sendable, Identifiable {
    let at: Int64
    let kind: String
    let text: String
    let ref: String?
    var id: String { "\(at)|\(kind)|\(ref ?? "")|\(text)" }
}

/// One field of a conflict (05 §6.6).
struct FieldDiffRow: Decodable, Equatable, Sendable, Identifiable {
    let field: String
    let base: AnyJSON
    let mine: AnyJSON
    let theirs: AnyJSON
    let clash: Bool
    let changedByMe: Bool
    let changedByThem: Bool
    var id: String { field }

    /// "next_due_date" → "Next due date".
    var label: String {
        let words = field.replacingOccurrences(of: "_", with: " ")
        return words.prefix(1).uppercased() + words.dropFirst()
    }
}

/// The batches that still need a `batch.create` (05 §7.2): every batch a held page names that is neither queued nor
/// on the server. A session the app was killed during is closed this way on the next launch, so no page waits forever.
func orphanBatches(files: [FileJob], queued: Set<String>, onServer: Set<String>) -> [(batchId: String, logbookId: String, aircraftId: String, pages: Int, handwritten: Bool)] {
    let pages = files.filter { $0.kind == "page" }
    let byBatch = Dictionary(grouping: pages.filter { $0.meta.batchId != nil }) { $0.meta.batchId! }
    return byBatch.keys.sorted().compactMap { id in
        guard !queued.contains(id), !onServer.contains(id), let first = byBatch[id]?.first else { return nil }
        return (id, first.meta.logbookId, first.aircraftId, byBatch[id]!.count, first.meta.isHandwritten)
    }
}

/// Upload retry (07 B-UPLOAD): 30 s, 2 min, 10 min, 1 h, then every 6 h; listed with "Try again" after 5 failures.
enum UploadBackoff {
    static let maxAttempts = 5
    static func delay(afterAttempts n: Int) -> TimeInterval {
        switch n {
        case ..<1: 0
        case 1: 30
        case 2: 120
        case 3: 600
        case 4: 3600
        default: 6 * 3600
        }
    }
}

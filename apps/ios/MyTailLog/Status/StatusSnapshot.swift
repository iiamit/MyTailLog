import Foundation

// The server's status snapshot and its visits, as decoded. Shared with the widget extension (05 §11.2).

/// GET /api/aircraft/{id}/status (09 §4.2, 4.3): the due engine's StatusBody (apps/web/src/lib/due/engine.ts)
/// plus when the server worked it out. The server is the authority (09 §3.12); only what Status reads is decoded.
struct StatusSnapshot: Decodable, Equatable, Sendable {
    let aircraftId: String
    let today: String
    let situation: String
    let verdict: Verdict
    let meters: [String: Meter]
    let rate: Rate
    let items: [DueItem]
    let lineAhead: LineAhead
    let counts: Counts
    let computedAt: String?
    /// Suggested and booked visits over Status's 12 months (09 §3.5); older snapshots have none.
    var visits: Visits? = nil

    struct Verdict: Decodable, Equatable, Sendable {
        let text: String
        /// [from, to) pairs in UTF-16 offsets (JS string indices).
        let emphasis: [[Int]]
        let lines: [String]
    }

    struct Meter: Decodable, Equatable, Sendable {
        let stitched: Double?
        let asOf: String?
    }

    struct Rate: Decodable, Equatable, Sendable {
        let hoursPerWeek: Double
        let basis: String
        let meter: String
    }

    struct LineAhead: Decodable, Equatable, Sendable {
        let from: String
        let to: String
        let rings: [Ring]
        let undated: [String]
    }

    struct Ring: Decodable, Equatable, Sendable {
        let itemKey: String
        let line: String
        let date: String
        let status: String
    }

    struct Counts: Decodable, Equatable, Sendable {
        let overdue: Int
        let dueSoon: Int
        let noRecord: Int
        let pagesToReview: Int
    }
}

struct DueItem: Decodable, Equatable, Identifiable, Sendable {
    let key: String
    let source: String
    let label: String
    let rule: String
    let line: String?
    let advisory: Bool
    let ifrOnly: Bool
    /// "overdue", "due_soon", "current" or "no_record".
    let status: String
    let calendar: Calendar?
    let hours: Hours?
    /// "calendar" or "hours": the limit that bites first.
    let first: String?
    let lastDone: LastDone?
    /// A newer completion waits for review; it moves nothing until confirmed (02 §5.8).
    let waitingEntryId: String?
    /// The shop that usually does it (a visit's default "Where?").
    var providerId: String? = nil

    var id: String { key }

    struct Calendar: Decodable, Equatable, Sendable {
        let dueDate: String
        let daysLeft: Int
        let calendarMonthRule: Bool
    }

    struct Hours: Decodable, Equatable, Sendable {
        let meter: String
        let dueAt: Double
        let remaining: Double
        let projectedDate: String?
        let projectionBasis: String
    }

    struct LastDone: Decodable, Equatable, Sendable {
        let date: String?
        let hours: Double?
        let pageLabel: String?
        let trust: String?
        let signer: String?
    }
}


struct Visits: Decodable, Equatable, Sendable {
    var suggested: [VisitView] = []
    var planned: [VisitView] = []

    init(suggested: [VisitView] = [], planned: [VisitView] = []) { self.suggested = suggested; self.planned = planned }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        suggested = try c.decodeIfPresent([VisitView].self, forKey: .suggested) ?? []
        planned = try c.decodeIfPresent([VisitView].self, forKey: .planned) ?? []
    }
    private enum CodingKeys: String, CodingKey { case suggested, planned }

    var all: [VisitView] { planned + suggested }
}

struct VisitItem: Decodable, Equatable, Sendable {
    let key: String
    let status: String
    let done: Bool
}

/// A suggested visit (`id` nil, `suggestionKey` set) or a booking.
struct VisitView: Decodable, Equatable, Sendable {
    var id: String?
    let suggestionKey: String?
    var status: String
    var weekOf: String
    var visitDate: String?
    var providerIds: [String]
    let items: [VisitItem]

    var open: [VisitItem] { items.filter { !$0.done } }
}

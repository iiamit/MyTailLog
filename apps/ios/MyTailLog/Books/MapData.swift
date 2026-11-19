import Foundation

/// GET /api/aircraft/{id}/map (09 §4.6, 10 §2): the MapModel as the server sends it.
/// Mirrors apps/core/domain MapModel.kt field for field; `MapLayoutBridge` hands it to the core's layout.
struct MapData: Codable, Equatable, Sendable {
    struct Range: Codable, Equatable, Sendable { let from: String; let to: String; let scaleBreak: String? }
    struct Volume: Codable, Equatable, Sendable { let id: String; let label: String; let from: String?; let to: String? }
    struct Line: Codable, Equatable, Sendable { let lineId: String; let logbook: String; let logbookId: String; let name: String; let volumes: [Volume] }
    struct Stop: Codable, Equatable, Sendable, Identifiable {
        let id: String; let lineId: String; let logbook: String; let date: String; let entryIds: [String]
        let trust: String; let pageIds: [String]; let label: String?; let major: Bool
    }
    struct Interchange: Codable, Equatable, Sendable, Identifiable {
        let id: String; let date: String; let stopIds: [String]; let lineIds: [String]; let trust: String; let label: String?
    }
    struct Gap: Codable, Equatable, Sendable, Identifiable {
        let id: String; let lineId: String; let logbook: String; let from: String; let to: String; let status: String; let unconfirmedPages: Int
    }
    struct Era: Codable, Equatable, Sendable { let lineId: String; let logbook: String; let from: String; let to: String?; let label: String; let anchorEntryId: String? }
    struct Squawk: Codable, Equatable, Sendable { let id: String; let date: String; let open: Bool; let line: String; let lineId: String }
    struct Ring: Codable, Equatable, Sendable {
        let itemKey: String; let line: String; let lineId: String; let date: String; let dateKind: String
        let status: String; let label: String; let kind: String
    }
    struct Visit: Codable, Equatable, Sendable {
        let id: String?; let suggestionKey: String?; let state: String; let weekOf: String; let itemKeys: [String]; let label: String
    }

    let today: String
    let range: Range
    let lines: [Line]
    let stops: [Stop]
    let interchanges: [Interchange]
    let gaps: [Gap]
    let eras: [Era]
    let squawks: [Squawk]
    let rings: [Ring]
    let visits: [Visit]
    let undatedEntries: Int

    /// M-BOOKS-05: one book. Other lines go; an interchange keeps only that book's stop, so it reads as a stop.
    func only(lineId: String) -> MapData {
        MapData(today: today, range: range, lines: lines.filter { $0.lineId == lineId },
                stops: stops.filter { $0.lineId == lineId }, interchanges: [],
                gaps: gaps.filter { $0.lineId == lineId }, eras: eras.filter { $0.lineId == lineId },
                squawks: squawks.filter { $0.lineId == lineId }, rings: rings.filter { $0.lineId == lineId },
                visits: [], undatedEntries: undatedEntries)
    }
}

/// The positioned primitives the core's layout returns (Layout in MapLayout.kt), in viewBox units.
/// Encodable with the same keys so the Swift tests diff it against packages/shared/fixtures/map-layout*.json.
struct MapLayout: Encodable, Equatable, Sendable {
    struct Rect: Encodable, Equatable, Sendable { let x, y, w, h: Double }
    struct Seg: Encodable, Equatable, Sendable { let x1, y1, x2, y2: Double }
    struct Point: Encodable, Equatable, Sendable { let x, y: Double }
    struct Lane: Encodable, Equatable, Sendable { let lineId, logbook, name: String; let c, nameX, nameY: Double; let anchor: String }
    struct Segment: Encodable, Equatable, Sendable { let lineId, kind: String; let gapId: String?; let x1, y1, x2, y2: Double }
    struct Stop: Encodable, Equatable, Sendable { let id, lineId: String; let x, y, r: Double; let dotted, major: Bool; let count: Int; let ids: [String] }
    struct Capsule: Encodable, Equatable, Sendable { let id: String; let x, y, w, h: Double; let dotted: Bool; let dots: [Point] }
    struct Ring: Encodable, Equatable, Sendable { let itemKey, lineId: String; let x, y, r: Double; let status: String }
    struct Visit: Encodable, Equatable, Sendable { let id, state: String; let x, y, w, h: Double }
    struct Era: Encodable, Equatable, Sendable { let lineId: String; let x, y, w, h: Double }
    struct Squawk: Encodable, Equatable, Sendable { let id: String; let x, y: Double; let open: Bool }
    struct Tick: Encodable, Equatable, Sendable { let x, y: Double; let label, anchor: String }
    struct Label: Encodable, Equatable, Sendable {
        let key, text: String; let x, y: Double; let anchor: String
        enum CodingKeys: String, CodingKey { case key = "for", text, x, y, anchor }
    }

    let size: String
    let width, height, fontSize: Double
    let lanes: [Lane]
    let segments: [Segment]
    let stops: [Stop]
    let interchanges: [Capsule]
    let rings: [Ring]
    let visits: [Visit]
    let eras: [Era]
    let squawks: [Squawk]
    let today: Seg?
    let scaleBreak: Seg?
    let window: Rect?
    let ticks: [Tick]
    let labels: [Label]
    let more: Int
}

/// Options for one layout (LayoutOptions in MapLayout.kt).
struct MapLayoutOptions: Codable, Equatable, Sendable {
    struct DateRange: Codable, Equatable, Sendable { let from: String; let to: String }
    var size: String
    var renderedWidth: Double?
    var zoom: DateRange?
    var planAhead: Bool?
    var window: DateRange?
    var allEras: Bool?
}

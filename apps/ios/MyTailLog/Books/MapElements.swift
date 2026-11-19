import Foundation

/// One thing on the map a person can reach: a stop, a visit (interchange), a gap or a due ring (10 §10).
/// Built from the layout and the model; drives taps, VoiceOver children and rotors, and the list view.
struct MapElement: Identifiable, Equatable {
    enum Kind: String { case stop, visit, gap, ring }
    let kind: Kind
    /// The model id (stop id, interchange id, gap id, ring item key).
    let key: String
    /// Hit and focus rectangle in layout units.
    let x, y, w, h: Double
    /// The accessible name (10 §10): what, when, which books, how sure.
    let name: String

    var id: String { "\(kind.rawValue):\(key)" }
}

private func spoken(_ d: String) -> String {
    let p = Day.parts(d)
    let months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    return "\(months[p.m - 1]) \(p.d), \(p.y)"
}

private func trustSpoken(_ trust: String) -> String {
    switch trust {
    case "ai_read": "read by AI, not confirmed"
    case "signed": "signed"
    default: "confirmed by you"
    }
}

/// Every reachable element, newest first on the phone (top to bottom) and oldest first on the horizontal map,
/// so VoiceOver reads in the direction the eye does. `title` names a stop by its first entry.
func mapElements(_ layout: MapLayout, _ data: MapData, title: (MapData.Stop) -> String?) -> [MapElement] {
    let vertical = layout.size == "phone"
    let stopById = Dictionary(data.stops.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    let bookOfLine = Dictionary(data.lines.map { ($0.lineId, $0.name) }, uniquingKeysWith: { a, _ in a })
    var out: [MapElement] = []

    for s in layout.stops {
        let stops = s.ids.compactMap { stopById[$0] }
        guard let first = stops.first else { continue }
        let book = bookOfLine[s.lineId] ?? ""
        let name: String
        if stops.count > 1 {
            let lowest = stops.contains { $0.trust == "ai_read" } ? "ai_read" : "confirmed"
            name = "\(stops.count) stops, \(spoken(stops.first!.date)) to \(spoken(stops.last!.date)), \(book), \(trustSpoken(lowest))"
        } else {
            let what = title(first) ?? first.label ?? "Entry"
            name = "\(what), \(spoken(first.date)), \(book), \(trustSpoken(first.trust))"
        }
        out.append(MapElement(kind: .stop, key: s.id, x: s.x - s.r, y: s.y - s.r, w: 2 * s.r, h: 2 * s.r, name: name))
    }
    for c in layout.interchanges {
        guard let x = data.interchanges.first(where: { $0.id == c.id }) else { continue }
        let books = x.lineIds.compactMap { bookOfLine[$0] }
        let list = books.count > 1 ? books.dropLast().joined(separator: ", ") + " and " + books.last! : books.joined()
        out.append(MapElement(kind: .visit, key: c.id, x: c.x, y: c.y, w: c.w, h: c.h,
                              name: "\(x.label ?? "Visit"), \(spoken(x.date)), \(list), \(trustSpoken(x.trust))"))
    }
    var seenGaps = Set<String>()
    for g in layout.segments {
        guard let gapId = g.gapId, seenGaps.insert(gapId).inserted, let gap = data.gaps.first(where: { $0.id == gapId }) else { continue }
        let pieces = layout.segments.filter { $0.gapId == gapId }
        let xs = pieces.flatMap { [$0.x1, $0.x2] }, ys = pieces.flatMap { [$0.y1, $0.y2] }
        let pad = 6.0
        let status = gap.status == "no_pages_exist" ? ", you marked that no pages exist"
            : gap.status == "asked_previous_owner" ? ", you asked the previous owner" : ""
        out.append(MapElement(kind: .gap, key: gapId, x: xs.min()! - pad, y: ys.min()! - pad,
                              w: xs.max()! - xs.min()! + 2 * pad, h: ys.max()! - ys.min()! + 2 * pad,
                              name: "\(gapTitle(gap))\(status)"))
    }
    for r in layout.rings {
        guard let ring = data.rings.first(where: { $0.itemKey == r.itemKey }) else { continue }
        let due = ring.status == "overdue" ? "overdue" : "due \(spoken(ring.date)), \(statusWord(ring.status).lowercased())"
        out.append(MapElement(kind: .ring, key: r.itemKey, x: r.x - r.r, y: r.y - r.r, w: 2 * r.r, h: 2 * r.r,
                              name: "\(ring.label), \(due), \(bookName(ring.line) ?? "")"))
    }
    return out.sorted { vertical ? $0.y < $1.y : $0.x < $1.x }
}

/// What a tap at `point` (layout units) reaches: everything within `reach` units (half a 44pt target), nearest first.
func hits(_ elements: [MapElement], at point: (x: Double, y: Double), reach: Double) -> [MapElement] {
    func distance(_ e: MapElement) -> Double {
        let dx = max(e.x - point.x, 0, point.x - (e.x + e.w)), dy = max(e.y - point.y, 0, point.y - (e.y + e.h))
        return (dx * dx + dy * dy).squareRoot()
    }
    return elements.map { ($0, distance($0)) }.filter { $0.1 <= reach }.sorted { $0.1 < $1.1 }.map(\.0)
}

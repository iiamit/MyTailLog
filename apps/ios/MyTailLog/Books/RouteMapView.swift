import SwiftUI

/// RouteMap (02 §4.4, 10 §6–§8): draws the core's layout. Phone: vertical, newest at the top (10 §8.4); tablet: the
/// horizontal RouteMap (10 §8.2). Lines, stops and rings in a Canvas; every element is also an accessibility child with
/// rotors (10 §10), and the List view carries the same facts.
/// `zoom` stretches time on the phone (pinch); labels keep their place beside their element.
/// shortcut: map labels stay at the default text size (the layout places 13pt labels); the List carries them at the
/// reader's size. Upgrade when the layout takes a text-size option.
struct RouteMapView: View {
    let data: MapData
    let layout: MapLayout
    let elements: [MapElement]
    var selected: String?
    var zoom: Double = 1
    let open: (MapElement) -> Void
    @State private var choices: [MapElement] = []
    @Environment(\.legibilityWeight) private var legibilityWeight
    @Namespace private var rotor

    private var vertical: Bool { layout.size == "phone" }
    /// Rendered points per layout unit.
    private var k: Double { layout.fontSize > 0 ? 13 / layout.fontSize : 1 }
    private func p(_ x: Double, _ y: Double) -> CGPoint {
        vertical ? CGPoint(x: x * k, y: y * k * zoom) : CGPoint(x: x * k, y: y * k)
    }
    private func r(_ e: MapElement) -> CGRect {
        let a = p(e.x, e.y), b = p(e.x + e.w, e.y + e.h)
        return CGRect(x: a.x, y: a.y, width: max(b.x - a.x, 1), height: max(b.y - a.y, 1))
    }
    var size: CGSize { CGSize(width: layout.width * k, height: layout.height * k * (vertical ? zoom : 1)) }

    var body: some View {
        Canvas { ctx, _ in draw(ctx) }
            .frame(width: size.width, height: size.height)
            .contentShape(Rectangle())
            .onTapGesture { tap($0) }
            .accessibilityHidden(true)
            // Real views over the drawing, so each element's frame is where it is drawn; taps still reach the Canvas.
            .overlay(alignment: .topLeading) { children.allowsHitTesting(false) }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(mapName)
            .accessibilityRotor("Stops") { rotorEntries(.stop) }
            .accessibilityRotor("Visits") { rotorEntries(.visit) }
            .accessibilityRotor("Gaps") { rotorEntries(.gap) }
            .accessibilityRotor("Due items") { rotorEntries(.ring) }
            .confirmationDialog("Which one?", isPresented: Binding { !choices.isEmpty } set: { if !$0 { choices = [] } },
                                titleVisibility: .hidden) {
                ForEach(choices) { e in Button(e.name) { open(e) } }
            }
    }

    private var mapName: String {
        let first = data.range.from.prefix(4), last = data.range.to.prefix(4)
        return "Route map of the logbooks, \(first) to \(last)"
    }

    private var children: some View {
        ZStack(alignment: .topLeading) {
            Color.clear.accessibilityHidden(true)
            ForEach(elements) { e in
                let rect = r(e)
                Color.clear
                    .frame(width: max(rect.width, 24), height: max(rect.height, 24))
                    .position(x: rect.midX, y: rect.midY)
                    .accessibilityElement()
                    .accessibilityLabel(e.name)
                    .accessibilityAddTraits(selected == e.id ? [.isButton, .isSelected] : .isButton)
                    .accessibilityAction { open(e) }
                    .accessibilityRotorEntry(id: e.id, in: rotor)
            }
        }
        .frame(width: size.width, height: size.height)
    }

    private func rotorEntries(_ kind: MapElement.Kind) -> some AccessibilityRotorContent {
        ForEach(elements.filter { $0.kind == kind }) { e in
            AccessibilityRotorEntry(Text(e.name), id: e.id, in: rotor)
        }
    }

    /// Several within one 44pt target ask which (M-BOOKS-01).
    private func tap(_ point: CGPoint) {
        let u = (x: Double(point.x) / k, y: Double(point.y) / (k * (vertical ? zoom : 1)))
        // A tap right on one element opens it; only a near miss between several asks.
        let direct = hits(elements, at: u, reach: 0)
        let found = direct.count == 1 ? direct : hits(elements, at: u, reach: 22 / k)
        if found.count == 1 { open(found[0]) } else if found.count > 1 { choices = Array(found.prefix(6)) }
    }

    // MARK: Drawing (10 §6)

    private func ink(_ lineId: String) -> Color {
        Tokens.Colors.line(data.lines.first { $0.lineId == lineId }?.logbook ?? "")
    }

    private func draw(_ ctx: GraphicsContext) {
        let traits = UITraitCollection(preferredContentSizeCategory: .large)
        let labelFont = DType.caption.font(boldText: legibilityWeight == .bold, traits: traits, weight: 500)
        let tickFont = DType.tabLabel.font(boldText: legibilityWeight == .bold, traits: traits, weight: 600)

        for e in layout.eras {
            let a = p(e.x, e.y), b = p(e.x + e.w, e.y + e.h)
            ctx.fill(Path(roundedRect: CGRect(x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y), cornerRadius: 4),
                     with: .color(ink(e.lineId).opacity(0.08)))
        }
        if let s = layout.scaleBreak {
            var path = Path(); path.move(to: p(s.x1, s.y1)); path.addLine(to: p(s.x2, s.y2))
            ctx.stroke(path, with: .color(Tokens.Colors.rule2), style: StrokeStyle(lineWidth: 1, dash: [3, 5]))
        }
        for s in layout.segments {
            var path = Path(); path.move(to: p(s.x1, s.y1)); path.addLine(to: p(s.x2, s.y2))
            let c = ink(s.lineId)
            switch s.kind {
            case "gap": ctx.stroke(path, with: .color(c), style: StrokeStyle(lineWidth: Tokens.Map.gapStroke, lineCap: .butt, dash: [6, 6]))
            case "no_pages": ctx.stroke(path, with: .color(c.opacity(0.6)), style: StrokeStyle(lineWidth: 3))
            case "future": ctx.stroke(path, with: .color(c), style: StrokeStyle(lineWidth: Tokens.Map.lineStroke, lineCap: .round,
                                                                                dash: [0.1, Tokens.Map.futureDotSpacing]))
            default: ctx.stroke(path, with: .color(c), style: StrokeStyle(lineWidth: Tokens.Map.lineStroke, lineCap: .round, lineJoin: .round))
            }
        }
        if let t = layout.today {
            var path = Path(); path.move(to: p(t.x1, t.y1)); path.addLine(to: p(t.x2, t.y2))
            ctx.stroke(path, with: .color(Tokens.Colors.ink), lineWidth: 1.5)
        }
        for v in layout.visits {
            let rect = capsule(v.x, v.y, v.w, v.h)
            ctx.fill(Path(roundedRect: rect, cornerRadius: 10), with: .color(Tokens.Colors.leaf2))
            ctx.stroke(Path(roundedRect: rect, cornerRadius: 10), with: .color(Tokens.Colors.ink),
                       style: StrokeStyle(lineWidth: Tokens.Map.capStroke, dash: v.state == "suggested" ? [4, 4] : []))
        }
        for c in layout.interchanges {
            let rect = capsule(c.x, c.y, c.w, c.h)
            let isSel = selected == "visit:\(c.id)"
            ctx.fill(Path(roundedRect: rect, cornerRadius: 10), with: .color(Tokens.Colors.leaf))
            ctx.stroke(Path(roundedRect: rect, cornerRadius: 10), with: .color(Tokens.Colors.ink),
                       style: StrokeStyle(lineWidth: isSel ? Tokens.Map.capSelStroke : Tokens.Map.capStroke, dash: c.dotted ? [2, 2.5] : []))
            for d in c.dots {
                let lane = layout.lanes.min { abs((vertical ? $0.c - d.x : $0.c - d.y)) < abs((vertical ? $1.c - d.x : $1.c - d.y)) }
                let q = p(d.x, d.y)
                ctx.fill(Path(ellipseIn: CGRect(x: q.x - 3, y: q.y - 3, width: 6, height: 6)), with: .color(ink(lane?.lineId ?? "")))
            }
        }
        for s in layout.stops {
            let q = p(s.x, s.y), rad = s.r * k
            let disc = Path(ellipseIn: CGRect(x: q.x - rad, y: q.y - rad, width: 2 * rad, height: 2 * rad))
            let isSel = selected == "stop:\(s.id)"
            ctx.fill(disc, with: .color(Tokens.Colors.leaf))
            ctx.stroke(disc, with: .color(ink(s.lineId)),
                       style: StrokeStyle(lineWidth: isSel ? 3.5 : Tokens.Map.stopStroke, dash: s.dotted ? [2, 2.5] : []))
            if isSel {
                let o = rad + 4
                ctx.stroke(Path(ellipseIn: CGRect(x: q.x - o, y: q.y - o, width: 2 * o, height: 2 * o)),
                           with: .color(Tokens.Colors.sectionInkBooks), lineWidth: 2)
            }
            if s.count > 1 {
                ctx.draw(ctx.resolve(Text("\(s.count)").font(tickFont).foregroundStyle(Tokens.Colors.ink)), at: q, anchor: .center)
            }
        }
        for s in layout.squawks {
            let q = p(s.x, s.y)
            var d = Path()
            d.move(to: CGPoint(x: q.x, y: q.y - 4)); d.addLine(to: CGPoint(x: q.x + 4, y: q.y))
            d.addLine(to: CGPoint(x: q.x, y: q.y + 4)); d.addLine(to: CGPoint(x: q.x - 4, y: q.y)); d.closeSubpath()
            ctx.fill(d, with: .color(s.open ? Tokens.Colors.ink : Tokens.Colors.leaf))
            ctx.stroke(d, with: .color(Tokens.Colors.ink), lineWidth: 1.5)
        }
        for ring in layout.rings {
            ctx.statusMark(markKind(ring.status), at: p(ring.x, ring.y), radius: ring.r * k, ringWidth: Tokens.Map.ringStroke)
        }
        for t in layout.ticks {
            let text = ctx.resolve(Text(t.label).font(tickFont).foregroundStyle(t.label == "Today" ? Tokens.Colors.ink : Tokens.Colors.ink3))
            let anchor: UnitPoint = vertical ? .bottomLeading : t.anchor == "end" ? .bottomTrailing : t.anchor == "start" ? .bottomLeading : .bottom
            ctx.draw(text, at: p(t.x, t.y), anchor: anchor)
        }
        if !vertical {
            for lane in layout.lanes {
                let text = ctx.resolve(Text(lane.name).font(labelFont).fontWeight(.bold).foregroundStyle(Tokens.Colors.line(lane.logbook)))
                ctx.draw(text, at: p(lane.nameX, lane.nameY), anchor: .bottomLeading)
            }
        }
        // Labels: `y` is the baseline; the layout's box runs 0.8 em above it to 0.2 em below.
        let fs = layout.fontSize
        for l in layout.labels {
            let text = ctx.resolve(Text(l.text).font(labelFont).foregroundStyle(Tokens.Colors.ink2))
            let anchor: UnitPoint = l.anchor == "end" ? .trailing : l.anchor == "middle" ? .center : .leading
            ctx.draw(text, at: p(l.x, l.y - 0.3 * fs), anchor: anchor)
        }
    }

    private func capsule(_ x: Double, _ y: Double, _ w: Double, _ h: Double) -> CGRect {
        let a = p(x, y), b = p(x + w, y + h)
        return CGRect(x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y)
    }
}

/// The book initials over each column (10 §8.4), pinned above the scrolling map; each centred over its column.
struct MapColumnHeads: View {
    let layout: MapLayout

    var body: some View {
        let k = layout.fontSize > 0 ? 13 / layout.fontSize : 1
        ZStack(alignment: .topLeading) {
            Color.clear
            ForEach(layout.lanes, id: \.lineId) { lane in
                Text(lane.name).dFont(.caption, weight: 700).foregroundStyle(Tokens.Colors.line(lane.logbook))
                    .fixedSize()
                    .position(x: lane.c * k, y: 12)
            }
        }
        .frame(width: layout.width * k, height: 24)
        .accessibilityHidden(true)
    }
}

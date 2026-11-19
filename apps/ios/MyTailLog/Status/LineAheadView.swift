import SwiftUI

/// LineAhead, phone variant (02 §4.5, 06 M-STATUS-01): the four book lines, solid up to today then dotted, the due rings
/// on their book's line. Tap a ring to open its item; rings that overlap ask which. VoiceOver hears one summary with an
/// action per ring; the rows below are the full equivalent.
/// shortcut: no visit caps (the server sends no visits yet) and tapping the empty line opens nothing until Plan ahead (phase 5).
struct LineAheadView: View {
    let snapshot: StatusSnapshot
    let open: (String) -> Void
    @State private var width: CGFloat = 0
    @State private var choices: [String] = []
    @Environment(\.legibilityWeight) private var legibilityWeight

    private let top: CGFloat = 30
    private let gap: CGFloat = 28
    private var ahead: StatusSnapshot.LineAhead { snapshot.lineAhead }
    private var labels: [String: String] {
        Dictionary(snapshot.items.map { ($0.key, $0.label) }, uniquingKeysWith: { a, _ in a })
    }

    var body: some View {
        Canvas { ctx, size in draw(ctx, size) }
            .frame(height: 168)
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
            .contentShape(Rectangle())
            .onTapGesture { tap($0) }
            .accessibilityElement()
            .accessibilityLabel(snapshot.lineSummary)
            .accessibilityActions {
                ForEach(ringKeys, id: \.self) { key in
                    Button("Open \(labels[key] ?? key)") { open(key) }
                }
            }
            .confirmationDialog("Open an item", isPresented: Binding { !choices.isEmpty } set: { if !$0 { choices = [] } },
                                titleVisibility: .hidden) {
                ForEach(choices, id: \.self) { key in
                    Button(labels[key] ?? key) { open(key) }
                }
            }
    }

    private var ringKeys: [String] {
        var seen = Set<String>()
        return ahead.rings.map(\.itemKey).filter { seen.insert($0).inserted }
    }

    private func center(_ ring: StatusSnapshot.Ring, _ w: CGFloat) -> CGPoint? {
        guard let row = LineGeometry.row(ring.line) else { return nil }
        let r = Tokens.Map.ringRadius
        return CGPoint(x: min(max(LineGeometry.x(ring.date, ahead) * w, r), w - r), y: top + CGFloat(row) * gap)
    }

    /// Hit regions reach 22pt around a ring (44pt targets, 06 M-STATUS-01).
    private func tap(_ point: CGPoint) {
        var hits: [String] = []
        for ring in ahead.rings {
            guard let c = center(ring, width), hypot(c.x - point.x, c.y - point.y) <= 22, !hits.contains(ring.itemKey) else { continue }
            hits.append(ring.itemKey)
        }
        if hits.count == 1 { open(hits[0]) } else if hits.count > 1 { choices = hits }
    }

    private func draw(_ ctx: GraphicsContext, _ size: CGSize) {
        let w = size.width, today = LineGeometry.past * w
        // The chart's labels are type.map, capped so they keep to the fixed line geometry at large sizes.
        let font = DType.caption.font(boldText: legibilityWeight == .bold,
                                      traits: UITraitCollection(preferredContentSizeCategory: .extraExtraLarge))
        func label(_ s: String) -> GraphicsContext.ResolvedText {
            ctx.resolve(Text(s).font(font).foregroundStyle(Tokens.Colors.ink3))
        }
        let stroke = Tokens.Map.lineStrokeThin
        for (i, line) in LineGeometry.lines.enumerated() {
            let y = top + CGFloat(i) * gap
            ctx.draw(label(bookName(line) ?? line), at: CGPoint(x: 0, y: y - 6), anchor: .bottomLeading)
            let ink = Tokens.Colors.line(line)
            var past = Path(); past.move(to: CGPoint(x: 0, y: y)); past.addLine(to: CGPoint(x: today, y: y))
            ctx.stroke(past, with: .color(ink), style: StrokeStyle(lineWidth: stroke, lineCap: .round))
            var future = Path(); future.move(to: CGPoint(x: today, y: y)); future.addLine(to: CGPoint(x: w, y: y))
            ctx.stroke(future, with: .color(ink),
                       style: StrokeStyle(lineWidth: stroke, lineCap: .round, dash: [0.1, Tokens.Map.futureDotSpacing / 2]))
        }
        let bottom = top + CGFloat(LineGeometry.lines.count - 1) * gap
        var todayLine = Path(); todayLine.move(to: CGPoint(x: today, y: top - 10)); todayLine.addLine(to: CGPoint(x: today, y: bottom + 10))
        ctx.stroke(todayLine, with: .color(Tokens.Colors.ink3), lineWidth: 1)
        for ring in ahead.rings {
            if let c = center(ring, w) {
                ctx.statusMark(markKind(ring.status), at: c, radius: Tokens.Map.ringRadius, ringWidth: Tokens.Map.ringStroke)
            }
        }
        let ticks = LineGeometry.ticks(ahead)
        for (i, tick) in ticks.enumerated() {
            let y = bottom + 18
            switch i {
            case 0: ctx.draw(label(tick.text), at: CGPoint(x: max(tick.x * w - 4, 0), y: y), anchor: .topLeading)
            case ticks.count - 1: ctx.draw(label(tick.text), at: CGPoint(x: w, y: y), anchor: .topTrailing)
            default: ctx.draw(label(tick.text), at: CGPoint(x: tick.x * w, y: y), anchor: .top)
            }
        }
    }
}

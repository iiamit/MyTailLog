import SwiftUI

// The status vocabulary as drawing, shared by the app and the widget extension (02 §5.2, §9.14).

extension Tokens.Colors {
    /// The logbook ink for a line ("airframe", "engine", "propeller", "avionics"; anything else is other).
    static func line(_ line: String?) -> Color {
        switch line {
        case "airframe": lineAirframe
        case "engine": lineEngine
        case "propeller", "prop": linePropeller
        case "avionics": lineAvionics
        default: lineOther
        }
    }
}

extension GraphicsContext {
    /// The status mark drawn into `radius` around `center`: filled dot, alarm ring, dashed ring.
    /// Shared by StatusMark and the LineAhead's rings so the vocabulary is one drawing.
    func statusMark(_ kind: MarkKind, at center: CGPoint, radius: CGFloat, ringWidth: CGFloat) {
        let disc = Path(ellipseIn: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2))
        func ring(_ color: Color, _ width: CGFloat, dash: [CGFloat] = []) {
            fill(disc, with: .color(Tokens.Colors.leaf))
            let r = radius - width / 2
            stroke(Path(ellipseIn: CGRect(x: center.x - r, y: center.y - r, width: r * 2, height: r * 2)),
                   with: .color(color), style: StrokeStyle(lineWidth: width, dash: dash))
        }
        switch kind {
        case .current: fill(disc, with: .color(Tokens.Colors.ink))
        case .dueSoon: ring(Tokens.Colors.alarm, ringWidth)
        case .overdue: fill(disc, with: .color(Tokens.Colors.alarm))
        case .noRecord: ring(Tokens.Colors.ink3, 2, dash: [3, 3])
        }
    }
}

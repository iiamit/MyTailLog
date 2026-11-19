import SwiftUI

// Records vocabulary (02 §5): Verdict, StatusMark, TrustMark, PageCite, LineChip, FirstBadge, group headers and rows.
// Status is never colour alone: every mark carries its word.

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

/// StatusMark (02 §5.2): mark plus word. Overdue is a slip with a white dot.
struct StatusMark: View {
    let kind: MarkKind
    let label: String
    var compact = false
    @ScaledMetric private var scale: CGFloat = 1

    var body: some View {
        if kind == .overdue {
            HStack(spacing: 6) {
                Circle().fill(Tokens.Colors.onAlarm).frame(width: 8 * scale, height: 8 * scale)
                Text(label).dFont(.caption, weight: 700).foregroundStyle(Tokens.Colors.onAlarm)
            }
            .padding(.leading, 7).padding(.trailing, 9).padding(.vertical, 2)
            .background(Tokens.Colors.alarm, in: RoundedRectangle(cornerRadius: Tokens.Radius.s))
        } else {
            HStack(spacing: 7) {
                let size = (compact ? 10 : 12) * scale
                Canvas { ctx, s in
                    ctx.statusMark(kind, at: CGPoint(x: s.width / 2, y: s.height / 2), radius: s.width / 2, ringWidth: compact ? 2.5 : 3)
                }
                .frame(width: size, height: size)
                Text(label).dFont(compact ? .caption : .small, weight: 700)
                    .foregroundStyle(kind == .dueSoon ? Tokens.Colors.alarmText : kind == .noRecord ? Tokens.Colors.ink3 : Tokens.Colors.ink)
            }
        }
    }
}

/// TrustMark (02 §5.3): dotted ring read by AI, filled dot confirmed, diamond signed. The words carry the meaning.
struct TrustMark: View {
    let level: TrustLevel
    let label: String
    @ScaledMetric private var mark: CGFloat = 9

    var body: some View {
        HStack(spacing: 5) {
            switch level {
            case .aiRead:
                Circle().inset(by: 1).stroke(Tokens.Colors.ink3, style: StrokeStyle(lineWidth: 2, dash: [1.5, 1.5]))
                    .frame(width: mark, height: mark)
            case .confirmed:
                Circle().fill(Tokens.Colors.ink).frame(width: mark, height: mark)
            case .signed:
                RoundedRectangle(cornerRadius: 1).fill(Tokens.Colors.ink).frame(width: mark - 2, height: mark - 2).rotationEffect(.degrees(45))
            }
            Text(label).dFont(.caption).foregroundStyle(Tokens.Colors.ink2)
        }
    }
}

/// LineChip (02 §5.5): the book's ink swatch and its name.
struct LineChip: View {
    let line: String?
    let label: String

    var body: some View {
        HStack(spacing: 6) {
            RoundedRectangle(cornerRadius: Tokens.Radius.s).fill(Tokens.Colors.line(line)).frame(width: 16, height: 5)
            Text(label).dFont(.caption).foregroundStyle(Tokens.Colors.ink2)
        }
    }
}

/// FirstBadge (02 §5.6): which limit bites first. VoiceOver hears "comes first".
struct FirstBadge: View {
    var body: some View {
        Text("first").dFont(.caption).foregroundStyle(Tokens.Colors.ink)
            .padding(.horizontal, 4)
            .overlay(RoundedRectangle(cornerRadius: 2).strokeBorder(Tokens.Colors.ink, lineWidth: 1))
            .accessibilityLabel("comes first")
    }
}

/// PageCite (02 §5.4): "Airframe p. 58" in the board ink, underlined, spoken expanded. Nil is an owner's note
/// without a page: "your note" in ink-3, not a link.
/// shortcut: not tappable until the ScanViewer lands with Logbooks (phase 2).
struct PageCite: View {
    let label: String?
    @Environment(\.section) private var section

    var body: some View {
        if let label {
            Text(label).dFont(.caption).underline().foregroundStyle(section.boardInk)
                .accessibilityLabel(label.replacingOccurrences(of: " p. ", with: " logbook, page "))
        } else {
            Text("your note").dFont(.caption).foregroundStyle(Tokens.Colors.ink3)
        }
    }
}

/// Verdict (02 §5.1): the opening sentence in type.lede with the server's bold runs at 800. A heading; wraps, never truncates.
struct Verdict: View {
    let text: String
    /// [from, to) in UTF-16 offsets, as the server sends them.
    let emphasis: [[Int]]
    @Environment(\.legibilityWeight) private var legibilityWeight
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Text(attributed)
            .dFont(.lede)
            .foregroundStyle(Tokens.Colors.ink)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.isHeader)
    }

    private var attributed: AttributedString {
        var out = AttributedString(text)
        let traits = UITraitCollection(preferredContentSizeCategory: UIContentSizeCategory(dynamicTypeSize))
        let bold = DType.lede.font(boldText: legibilityWeight == .bold, traits: traits, weight: 800)
        let utf16 = text.utf16
        for pair in emphasis where pair.count == 2 {
            let lo = min(max(pair[0], 0), utf16.count), hi = min(max(pair[1], lo), utf16.count)
            guard let a = String.Index(utf16.index(utf16.startIndex, offsetBy: lo), within: text),
                  let b = String.Index(utf16.index(utf16.startIndex, offsetBy: hi), within: text),
                  let range = Range(a..<b, in: out) else { continue }
            out[range].font = bold
        }
        return out
    }
}

/// PhoneGroupHeader (02 §9.6): 14/700 ink-3 over a 2pt ink rule; the count after it at 400.
struct GroupHeader: View {
    let title: String
    var count: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: Tokens.Space.s2) {
                Text(title).dFont(.small, weight: 700)
                if let count { Text(count).dFont(.small) }
            }
            .foregroundStyle(Tokens.Colors.ink3)
            Rectangle().fill(Tokens.Colors.ink).frame(height: 2)
        }
        .padding(.top, Tokens.Space.s4)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

/// A full-width navigation row (16/700, chevron) with its rule.
struct PhoneRow: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                Text(title).dFont(.bodyStrong).foregroundStyle(Tokens.Colors.ink)
                Spacer(minLength: Tokens.Space.s2)
                Icon("chevron-right").foregroundStyle(Tokens.Colors.ink3)
            }
            .padding(.vertical, Tokens.Space.s3)
            .frame(minHeight: Tokens.Size.phoneRowMin)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowButtonStyle())
        .overlay(alignment: .bottom) { Rule() }
    }
}

/// A row's pressed state: the leaf-2 fill, no scale (02 §2.3).
struct RowButtonStyle: ButtonStyle {
    var selected = false
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.background(configuration.isPressed || selected ? Tokens.Colors.leaf2 : .clear)
    }
}

struct Rule: View {
    var body: some View { Rectangle().fill(Tokens.Colors.rule).frame(height: 1) }
}

/// Skeleton (02 §8.3): a still leaf-2 block in the shape of what is coming. No shimmer.
struct Skeleton: View {
    let fraction: CGFloat
    let height: CGFloat

    var body: some View {
        GeometryReader { g in
            RoundedRectangle(cornerRadius: Tokens.Radius.s).fill(Tokens.Colors.leaf2).frame(width: g.size.width * fraction)
        }
        .frame(height: height)
        .accessibilityHidden(true)
    }
}

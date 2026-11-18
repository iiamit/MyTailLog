import SwiftUI

/// D's buttons (02 §2.3, 06 §1.8). Pressed is a 14% layer of the content colour: no scale, no bounce.
/// Disabled is the whole control at 40%. Keyboard focus uses the system focus effect, never suppressed (02 §2.4).
struct DButtonStyle: ButtonStyle {
    enum Kind { case primary, secondary, quiet }
    let kind: Kind
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.section) private var section

    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: Tokens.Radius.m)
        return configuration.label
            .dFont(.bodyStrong)
            .foregroundStyle(content)
            .padding(.horizontal, Tokens.Space.s4)
            .frame(maxWidth: kind == .quiet ? nil : .infinity,
                   minHeight: kind == .quiet ? Tokens.Size.phoneTouchMin : Tokens.Size.phoneButton)
            .background(fill)
            .overlay(content.opacity(configuration.isPressed && isEnabled ? 0.14 : 0))
            .clipShape(shape)
            .overlay { if kind == .secondary { shape.strokeBorder(Tokens.Colors.controlBorder, lineWidth: 1) } }
            .contentShape(shape)
            .opacity(isEnabled ? 1 : 0.4)
    }

    private var fill: Color {
        switch kind {
        case .primary: Tokens.Colors.ink
        case .secondary: Tokens.Colors.leaf
        case .quiet: .clear
        }
    }

    private var content: Color {
        switch kind {
        case .primary: Tokens.Colors.leaf
        case .secondary: Tokens.Colors.ink
        case .quiet: section.boardInk
        }
    }
}

extension ButtonStyle where Self == DButtonStyle {
    static var primary: DButtonStyle { DButtonStyle(kind: .primary) }
    static var secondary: DButtonStyle { DButtonStyle(kind: .secondary) }
    static var quiet: DButtonStyle { DButtonStyle(kind: .quiet) }
}

/// A Lucide glyph from the asset catalog, tinted by the foreground style.
struct Icon: View {
    let name: String
    var size: CGFloat = 20
    @ScaledMetric private var scale: CGFloat = 1

    init(_ name: String, size: CGFloat = 20) {
        self.name = name
        self.size = size
    }

    var body: some View {
        Image(name).renderingMode(.template).resizable().frame(width: size * scale, height: size * scale)
            .accessibilityHidden(true)
    }
}

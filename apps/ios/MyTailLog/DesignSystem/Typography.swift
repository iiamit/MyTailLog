import SwiftUI

/// Phone type roles (01 §5) built from the bundled fonts and scaled with Dynamic Type.
/// Libre Franklin is the app's voice; Literata (`.paper`) only for text transcribed from a scanned page.
enum DType {
    case boardTitle, lede, heading, body, bodyStrong, small, caption, paper, tabLabel

    var role: TypeRole {
        switch self {
        case .boardTitle: Tokens.PhoneType.boardTitle
        case .lede: Tokens.PhoneType.lede
        case .heading: Tokens.PhoneType.heading
        case .body: Tokens.PhoneType.body
        case .bodyStrong: Tokens.PhoneType.bodyStrong
        case .small: Tokens.PhoneType.small
        case .caption: Tokens.PhoneType.caption
        case .paper: Tokens.PhoneType.paper
        case .tabLabel: Tokens.PhoneType.tabLabel
        }
    }

    /// The Dynamic Type style each role scales with (01 §5 table).
    var textStyle: UIFont.TextStyle {
        switch self {
        case .boardTitle: .largeTitle
        case .lede: .title3
        case .heading: .headline
        case .body, .bodyStrong, .paper: .body
        case .small: .subheadline
        case .caption: .footnote
        case .tabLabel: .caption2
        }
    }

    /// iOS maps body to the system `.body` size, 17pt (14-decisions A5); the tokens' 16 is the Android/web value.
    var size: CGFloat { self == .body || self == .bodyStrong ? 17 : role.size }

    /// The bundled fonts are variable and their named instances carry no PostScript names,
    /// so only each file's default face resolves by name; the weight is set on the wght axis.
    var postScriptName: String { role.family == .paper ? "Literata-Regular" : "LibreFranklin-Thin" }

    func weight(boldText: Bool = false) -> Int {
        // Bold Text: 400 → 600, 600 → 700, 700 → 800 (05 §19).
        boldText ? [400: 600, 500: 600, 600: 700, 700: 800][role.weight] ?? role.weight : role.weight
    }

    /// Scaled for the given Dynamic Type size.
    func uiFont(boldText: Bool = false, traits: UITraitCollection? = nil) -> UIFont {
        let wght = 0x7767_6874 // 'wght'
        let base = UIFont(name: postScriptName, size: size) ?? .systemFont(ofSize: size)
        let desc = base.fontDescriptor.addingAttributes(
            [UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String): [wght: weight(boldText: boldText)]])
        return UIFontMetrics(forTextStyle: textStyle)
            .scaledFont(for: UIFont(descriptor: desc, size: size), compatibleWith: traits)
    }

    /// Tabular figures everywhere (01 §5).
    func font(boldText: Bool = false, traits: UITraitCollection? = nil) -> Font {
        Font(uiFont(boldText: boldText, traits: traits)).monospacedDigit()
    }
}

private struct DFontModifier: ViewModifier {
    let type: DType
    @Environment(\.legibilityWeight) private var legibilityWeight
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize // re-render when the size changes
    func body(content: Content) -> some View {
        let traits = UITraitCollection(preferredContentSizeCategory: UIContentSizeCategory(dynamicTypeSize))
        content.font(type.font(boldText: legibilityWeight == .bold, traits: traits))
    }
}

extension View {
    func dFont(_ type: DType) -> some View { modifier(DFontModifier(type: type)) }
}

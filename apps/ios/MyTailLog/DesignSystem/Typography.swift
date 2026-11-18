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
    var textStyle: Font.TextStyle {
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

    /// PostScript name of the named instance in the bundled variable font.
    func postScriptName(boldText: Bool = false) -> String {
        var weight = role.weight
        // Bold Text: 400 → 600, 600 → 700, 700 → 800 (05 §19).
        if boldText { weight = [400: 600, 500: 600, 600: 700, 700: 800][weight] ?? weight }
        let name = [400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold"][weight] ?? "Regular"
        return "\(role.family == .paper ? "Literata" : "LibreFranklin")-\(name)"
    }

    /// Tabular figures everywhere (01 §5).
    func font(boldText: Bool = false) -> Font {
        Font.custom(postScriptName(boldText: boldText), size: size, relativeTo: textStyle).monospacedDigit()
    }
}

private struct DFontModifier: ViewModifier {
    let type: DType
    @Environment(\.legibilityWeight) private var legibilityWeight
    func body(content: Content) -> some View {
        content.font(type.font(boldText: legibilityWeight == .bold))
    }
}

extension View {
    func dFont(_ type: DType) -> some View { modifier(DFontModifier(type: type)) }
}

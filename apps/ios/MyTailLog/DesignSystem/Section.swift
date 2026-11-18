import SwiftUI

/// The binder's sections (00 §5, 02 §2.2). `setup` is the Hangar, account and sign-in board; it is not a tab.
enum Section: String, CaseIterable, Identifiable, Codable, Sendable {
    case status, books, maint, aircraft, docs, share, setup

    var id: String { rawValue }

    /// Phone: five tabs, Documents lives under Aircraft (05 §5.1, 02 §9.4).
    static let phoneTabs: [Section] = [.status, .books, .maint, .aircraft, .share]
    /// Tablet: six SectionTabs, matching the web rail (05 §5.4).
    static let tabletTabs: [Section] = [.status, .books, .maint, .aircraft, .docs, .share]

    var title: String {
        switch self {
        case .status: "Status"
        case .books: "Logbooks"
        case .maint: "Maintenance"
        case .aircraft: "Aircraft"
        case .docs: "Documents"
        case .share: "Share"
        case .setup: "Hangar"
        }
    }

    /// Label under the phone tab icon (06 §1.1).
    var tabLabel: String { self == .maint ? "Maint." : title }

    /// Lucide glyph in the asset catalog (02 §9.4).
    var icon: String {
        switch self {
        case .status: "list-checks"
        case .books: "book-open"
        case .maint: "wrench"
        case .aircraft: "plane"
        case .docs: "file-text"
        case .share: "share-2"
        case .setup: "circle-user-round"
        }
    }

    /// Board fill, its text colours and the leaf-safe ink (`board`, `on-board`, `on-board-2`, `board-ink`).
    var board: Color {
        switch self {
        case .status: Tokens.Colors.sectionStatus
        case .books: Tokens.Colors.sectionBooks
        case .maint: Tokens.Colors.sectionMaint
        case .aircraft: Tokens.Colors.sectionAircraft
        case .docs: Tokens.Colors.sectionDocs
        case .share: Tokens.Colors.sectionShare
        case .setup: Tokens.Colors.sectionSetup
        }
    }

    var onBoard: Color {
        switch self {
        case .status: Tokens.Colors.onSectionStatus
        case .books: Tokens.Colors.onSectionBooks
        case .maint: Tokens.Colors.onSectionMaint
        case .aircraft: Tokens.Colors.onSectionAircraft
        case .docs: Tokens.Colors.onSectionDocs
        case .share: Tokens.Colors.onSectionShare
        case .setup: Tokens.Colors.onSectionSetup
        }
    }

    var onBoard2: Color {
        switch self {
        case .status: Tokens.Colors.onSection2Status
        case .books: Tokens.Colors.onSection2Books
        case .maint: Tokens.Colors.onSection2Maint
        case .aircraft: Tokens.Colors.onSection2Aircraft
        case .docs: Tokens.Colors.onSection2Docs
        case .share: Tokens.Colors.onSection2Share
        case .setup: Tokens.Colors.onSection2Setup
        }
    }

    var boardInk: Color {
        switch self {
        case .status: Tokens.Colors.sectionInkStatus
        case .books: Tokens.Colors.sectionInkBooks
        case .maint: Tokens.Colors.sectionInkMaint
        case .aircraft: Tokens.Colors.sectionInkAircraft
        case .docs: Tokens.Colors.sectionInkDocs
        case .share: Tokens.Colors.sectionInkShare
        case .setup: Tokens.Colors.sectionInkSetup
        }
    }

    /// Books is the one board that takes dark text, so its bars want dark status-bar content (06 §1.1).
    var barColorScheme: ColorScheme { self == .books ? .light : .dark }

    /// What an empty section says (12 §9; `empty.nothing` where 12 has no line for the place).
    var emptyLine: String {
        switch self {
        case .status: "Nothing to show yet. Status fills in as your logbooks are read and confirmed."
        case .books: "Add your first logbook. Most owners start with the airframe log, newest volume first."
        case .docs: "Keep registration, airworthiness certificate, POH, insurance and W&B here."
        case .share: "Share records with a mechanic, a buyer or an insurer. They don't need an account."
        case .maint, .aircraft, .setup: "Nothing here yet."
        }
    }
}

extension EnvironmentValues {
    /// SectionContext (02 §2.2): set once by a board, read by its children.
    @Entry var section: Section = .setup
}

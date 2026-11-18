import SwiftUI

/// Which section is open and each section's own navigation stack (05 §5.2, 02 §9.4).
@MainActor @Observable
final class TabModel {
    var selected: Section
    var paths: [Section: NavigationPath] = [:]
    /// Bumped when an already-open tab is tapped at its root; the leaf scrolls to the top.
    private(set) var scrollToTop: [Section: Int] = [:]

    init(selected: Section = .status) {
        self.selected = selected
    }

    func path(_ section: Section) -> Binding<NavigationPath> {
        Binding { self.paths[section] ?? NavigationPath() } set: { self.paths[section] = $0 }
    }

    /// Tap a tab: switch to it, keeping every stack. Tap the open tab: pop to its root; tap again at the root: scroll to top.
    func tap(_ section: Section) {
        guard section == selected else {
            selected = section
            return
        }
        if let path = paths[section], !path.isEmpty {
            paths[section] = NavigationPath()
        } else {
            scrollToTop[section, default: 0] += 1
        }
    }
}

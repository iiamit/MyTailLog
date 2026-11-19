import SwiftUI

/// Which section is open and each section's own navigation stack (05 §5.2, 02 §9.4).
@MainActor @Observable
final class TabModel {
    var selected: Section
    var paths: [Section: NavigationPath] = [:]
    /// Bumped when an already-open tab is tapped at its root; the leaf scrolls to the top.
    private(set) var scrollToTop: [Section: Int] = [:]

    /// Set by the Add sheet's "Scan logbook pages": Logbooks opens M-SCAN-01 when it shows, and clears it.
    var scanPending = false
    func requestScan() { scanPending = true }
    /// Set by a link to Review: Logbooks opens the review flow when it shows, and clears it.
    var reviewPending = false
    /// Log a flight or Report a squawk asked for by a link, an intent or ⇧⌘F; the shell presents it.
    var addRequest: AddAction?
    /// Notifications or Reminders over the shell.
    var sheet: AccountSheet?

    /// Opens what a link asks for (05 §5.5); `nil` section keeps the open one.
    func go(_ landing: Landing) {
        let section = landing.section ?? selected
        selected = section
        switch landing.then {
        case .none: paths[section] = NavigationPath()
        case .push(let route): var p = NavigationPath(); p.append(route); paths[section] = p
        case .add(let a): addRequest = a
        case .scan: paths[section] = NavigationPath(); scanPending = true
        case .review: paths[section] = NavigationPath(); reviewPending = true
        case .sheet(let s): sheet = s
        }
    }

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

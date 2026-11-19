import SwiftUI

/// The Notifications and Reminders screens, presented over the shell from the account menu or a link (06 M-SYS-05).
enum AccountSheet: String, Identifiable {
    case inbox, reminders
    var id: Self { self }
}

/// Where an AppLink lands: a section, then what opens there. Pure, so it is unit-tested.
struct Landing: Equatable {
    enum Then: Equatable {
        case none
        case push(AnyHashable)
        case add(AddAction)
        case scan, review
        case sheet(AccountSheet)
    }
    let section: Section?
    var then: Then = .none
}

/// The tablet has no Status or Books stack routes of its own (its leaves hold the selection), so those land on the
/// section; record screens push on the detail stack as on the phone. Documents is a tablet tab, under Aircraft on the phone.
func landing(_ link: AppLink, tablet: Bool) -> Landing {
    let docs: Section = tablet ? .docs : .aircraft
    switch link.target {
    case .status: return Landing(section: .status)
    case .items: return Landing(section: .status, then: tablet ? .none : .push(StatusRoute.all))
    case .item: return Landing(section: .status, then: tablet ? .none : .push(StatusRoute.item(link.arg ?? "")))
    case .plan: return Landing(section: .status, then: .push(RecRoute.plan))
    // The server names a booking by its id; the visit screen takes the same key Plan ahead uses (visitKey).
    case .visit: return Landing(section: .status, then: .push(RecRoute.visit(link.arg ?? "")))
    case .entry: return Landing(section: .books, then: .push(BooksRoute.entry(link.arg ?? "")))
    case .review: return Landing(section: .books, then: .review)
    case .queue: return Landing(section: .books, then: .push(SyncRoute.scanQueue))
    case .scan: return Landing(section: .books, then: .scan)
    case .flight: return Landing(section: nil, then: .add(.flight))
    case .newSquawk: return Landing(section: .maint, then: .add(.squawk))
    case .squawk: return Landing(section: .maint, then: .push(RecRoute.squawk(link.arg ?? "")))
    case .ad: return Landing(section: .maint, then: .push(RecRoute.ad(link.arg ?? "")))
    case .docs: return tablet ? Landing(section: .docs) : Landing(section: .aircraft, then: .push(RecRoute.documents))
    case .doc: return Landing(section: docs, then: .push(RecRoute.doc(link.arg ?? "")))
    case .share: return Landing(section: .share)
    case .sync: return Landing(section: nil, then: .push(SyncRoute.waiting))
    case .settings, .reminders: return Landing(section: nil, then: .sheet(.reminders))
    case .inbox: return Landing(section: nil, then: .sheet(.inbox))
    }
}

/// Hardware keyboard commands at the shell (06 M-SYS-08): ⌘1…⌘6 sections, ⇧⌘F log a flight, ⌘R sync, ⌘, reminders.
/// ⌘N (Add) lives on the AddButton and the rail. The system lists them all when ⌘ is held.
struct KeyCommands: View {
    let tablet: Bool
    @Environment(TabModel.self) private var tabs
    @Environment(OfflineStore.self) private var offline: OfflineStore?

    var body: some View {
        let sections = tablet ? Section.tabletTabs : Section.phoneTabs
        ZStack {
            ForEach(Array(sections.enumerated()), id: \.element) { i, s in
                Button(s.title) { tabs.tap(s) }.keyboardShortcut(KeyEquivalent(Character("\(i + 1)")), modifiers: .command)
            }
            Button("Log a flight") { tabs.go(landing(AppLink(aircraftId: nil, target: .flight), tablet: tablet)) }
                .keyboardShortcut("f", modifiers: [.command, .shift])
            Button("Sync now") { Task { await offline?.sync() } }.keyboardShortcut("r", modifiers: .command)
            Button("Reminders") { tabs.sheet = .reminders }.keyboardShortcut(",", modifiers: .command)
        }
        .opacity(0)
        .frame(width: 0, height: 0)
        .accessibilityHidden(true)
    }
}

import SwiftUI

// Where phase 4 meets the shell: the pushed record screens on each phone stack, the tablet's two leaves, the AddButton
// and the Add sheet (06 M-FLIGHT-01).

/// Room under a top-level phone leaf's last row so the AddButton never covers it.
struct AddButtonRoom: View {
    @Environment(\.recNav) private var nav
    var body: some View { if !nav.tablet { Color.clear.frame(height: Tokens.Size.phoneAddButton + Tokens.Space.s4) } }
}

/// One phase 4 screen by its route, on the phone or in the tablet's right leaf.
struct RecordScreen: View {
    let recs: Recs
    let route: RecRoute

    var body: some View {
        switch route {
        case .squawk(let id): SquawkDetail(recs: recs, id: id)
        case .ad(let id, let record): AdDetail(recs: recs, id: id, record: record)
        case .item(let id): ItemEditor(recs: recs, id: id)
        case .findAds: FindAds(recs: recs)
        case .hours: HoursScreen(recs: recs)
        case .equipment: EquipmentScreen(recs: recs)
        case .component(let id): ComponentEditor(recs: recs, id: id)
        case .wb: WeightBalanceScreen(recs: recs)
        case .oil: OilScreen(recs: recs)
        case .details: DetailsScreen(recs: recs)
        case .documents: DocumentsScreen(recs: recs)
        case .doc(let id): DocViewer(recs: recs, id: id)
        case .plan: PlanAheadScreen(recs: recs)
        case .visit(let key): VisitScreen(recs: recs, key: key)
        case .link(let id, let made): LinkScreen(recs: recs, roomId: id, made: made)
        case .links: LinksScreen(recs: recs)
        }
    }
}

/// Phase 4's pushed screens on the open phone stack (05 §5.3); `recNav` pushes and pops that stack.
struct RecordDestinations: ViewModifier {
    @Environment(Recs.self) private var recs: Recs?
    @Environment(TabModel.self) private var tabs

    func body(content: Content) -> some View {
        // Pushed screens take their environment from the stack, not the root, so they get the same nav explicitly.
        let nav = RecNav(open: { [tabs] r in tabs.paths[tabs.selected, default: NavigationPath()].append(r) },
                         back: { [tabs] in if tabs.paths[tabs.selected]?.isEmpty == false { tabs.paths[tabs.selected]?.removeLast() } })
        return content
            .navigationDestination(for: RecRoute.self) { route in
                if let recs { RecordScreen(recs: recs, route: route).id(route).environment(\.recNav, nav) }
            }
            .environment(\.recNav, nav)
    }
}

/// Maintenance, Aircraft and Documents on the tablet (06 §9 mapping): the list in the left leaf, the detail (squawk,
/// AD, item, an aircraft page, a document) in the right one.
struct RecordsTablet: View {
    let section: Section
    let recs: Recs
    @State private var detail: RecRoute?

    var body: some View {
        let nav = RecNav(open: { detail = $0 }, back: { detail = nil }, tablet: true)
        HStack(alignment: .top, spacing: Tokens.Size.leavesGap) {
            Group {
                switch section {
                case .maint: MaintHome(recs: recs)
                case .aircraft: AircraftHome(recs: recs)
                case .share: ShareHome(recs: recs)
                default: DocumentsScreen(recs: recs, pushed: false)
                }
            }
            .frame(maxWidth: .infinity)
            Group {
                if let detail {
                    RecordScreen(recs: recs, route: detail).id(detail)
                } else {
                    TabletLeaf { Text(section.emptyDetail).dFont(.body).foregroundStyle(Tokens.Colors.ink3) }
                }
            }
            .frame(maxWidth: .infinity)
        }
        .environment(\.recNav, nav)
        .onChange(of: recs.id) { detail = nil }
    }
}

private extension Section {
    var emptyDetail: String {
        switch self {
        case .maint: "Choose a squawk, an AD or an item to see it here."
        case .aircraft: "Choose hours, equipment, weight and balance, oil or details to see them here."
        case .share: "Make a link, or open Live links, to see it here."
        default: "Choose a document to see it here."
        }
    }
}

/// What the Add sheet starts.
enum AddAction: Identifiable {
    case flight, oil, squawk, scan, document
    var id: Self { self }
}

/// The Add sheet (06 M-FLIGHT-01) in its fixed order; viewers get only "Report a squawk" (07 B-VIEWER).
struct AddSheet: View {
    let recs: Recs
    let pick: (AddAction) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Add to \(recs.tail)").dFont(.heading).foregroundStyle(Tokens.Colors.ink).accessibilityAddTraits(.isHeader)
                Spacer()
                Button("Close") { dismiss() }.dFont(.bodyStrong).foregroundStyle(Tokens.Colors.ink).frame(minHeight: 44)
            }
            .padding(.bottom, Tokens.Space.s2)
            if recs.canEdit {
                row(.aircraft, "plane-landing", "Log a flight", "Photograph the tach, or type it", .flight)
                row(.aircraft, "droplet", "Add oil", "Quarts added at the aircraft", .oil)
            }
            row(.maint, "flag", "Report a squawk", "A photo first, then a few words", .squawk)
            if recs.canEdit {
                row(.books, "camera", "Scan logbook pages", "Adds to the end of a logbook", .scan)
                row(.docs, "file-plus-2", "Add a document", "Insurance, registration, a Form 337", .document)
            }
            Note("Each colour is the tab where it will be filed.").padding(.top, Tokens.Space.s2)
        }
        .padding(Tokens.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Tokens.Colors.leaf)
    }

    private func row(_ section: Section, _ icon: String, _ title: String, _ sub: String, _ action: AddAction) -> some View {
        Button {
            dismiss()
            // The sheet goes first; what it starts is presented once it has.
            Task { try? await Task.sleep(for: .milliseconds(350)); pick(action) }
        } label: {
            HStack(spacing: Tokens.Space.s3) {
                SectionTile(section: section, icon: icon)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).dFont(.bodyStrong).foregroundStyle(Tokens.Colors.ink)
                    Note(sub)
                }
                Spacer(minLength: 0)
            }
            .frame(minHeight: 64)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowButtonStyle())
    }
}

/// The AddButton (02 §9: 60×60, ink, plus) and everything the Add sheet can start, for one screen.
struct AddHost: ViewModifier {
    let recs: Recs?
    /// Phone: the floating AddButton; tablet: the rail's Add row presents through `presented`.
    var showButton = true
    @Binding var presented: Bool
    @Environment(TabModel.self) private var tabs
    @State private var action: AddAction?

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .bottomTrailing) {
                if showButton, recs != nil {
                    Button { presented = true } label: {
                        Icon("plus", size: 28).foregroundStyle(Tokens.Colors.leaf)
                            .frame(width: Tokens.Size.phoneAddButton, height: Tokens.Size.phoneAddButton)
                            .background(Tokens.Colors.ink, in: RoundedRectangle(cornerRadius: 6))
                    }
                    .buttonStyle(.plain)
                    .padding(.trailing, Tokens.Space.s2 + Tokens.Space.s4)
                    .padding(.bottom, Tokens.Space.s4 + Tokens.Size.phoneTabbar)
                    .accessibilityLabel("Add")
                    .keyboardShortcut("n", modifiers: .command)
                }
            }
            .sheet(isPresented: $presented) {
                if let recs {
                    AddSheet(recs: recs) { a in
                        if a == .scan { tabs.selected = .books; tabs.requestScan() } else { action = a }
                    }
                    .presentationDetents([.medium, .large])
                    .presentationBackground(Tokens.Colors.leaf)
                }
            }
            .fullScreenCover(item: Binding { action == .flight || action == .squawk ? action : nil } set: { if $0 == nil { action = nil } }) { a in
                if let recs { if a == .flight { LogFlightFlow(recs: recs) } else { NewSquawk(recs: recs) } }
            }
            .sheet(item: Binding { action == .oil || action == .document ? action : nil } set: { if $0 == nil { action = nil } }) { a in
                if let recs { if a == .oil { AddOilSheet(recs: recs) } else { AddDocSheet(recs: recs, startType: nil) } }
            }
    }
}

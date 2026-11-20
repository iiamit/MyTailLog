import SwiftUI

/// The tail line's aircraft and sync state (06 §1.3), from the core.
struct AircraftLine: Equatable {
    var tail: String?
    var lastSync: Date?
    var syncing = false
    var offline = false
    var failed = false
    var waiting = 0
    var conflicts = 0

    var tailText: String { tail ?? "No aircraft yet" }

    /// An alarm slip state: a conflict to decide or a failed sync.
    var alarm: Bool { conflicts > 0 || failed }

    var syncText: String {
        if conflicts > 0 { return "\(conflicts) to decide" }
        if failed { return "sync failed" }
        if syncing { return "syncing" }
        if waiting > 0 { return "\(waiting) waiting" }
        if offline { return "offline" }
        guard let lastSync else { return "not synced yet" }
        let calendar = Calendar.current
        if calendar.isDateInToday(lastSync) { return "synced \(lastSync.formatted(date: .omitted, time: .shortened))" }
        if calendar.isDateInYesterday(lastSync) { return "synced yesterday \(lastSync.formatted(date: .omitted, time: .shortened))" }
        return "synced \(lastSync.formatted(.dateTime.month(.abbreviated).day()))"
    }
}

extension EnvironmentValues {
    @Entry var aircraftLine = AircraftLine()
}

/// PhoneHeader (02 §9.1) on the board colour. Top-level: the tail line, then the board title. Pushed (`back` set):
/// the back control above the screen's title. Does not collapse on scroll (02 §9.1 Decision: the colour is the place marker).
struct PhoneHeader: View {
    var title: String?
    var back: String?
    @Environment(\.section) private var section
    @Environment(\.aircraftLine) private var line
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s1) {
            if let back {
                Button { dismiss() } label: {
                    HStack(spacing: 2) {
                        Icon("chevron-left")
                        Text(back).dFont(.bodyStrong, weight: 600)
                    }
                    .foregroundStyle(section.onBoard)
                    .frame(minHeight: Tokens.Size.phoneTouchMin)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Back to \(back)")
            } else {
                AccountButton(switchesAircraft: true) {
                    HStack(spacing: Tokens.Space.s1) {
                        Text(line.tailText).dFont(.small).fontWeight(.semibold).lineLimit(1).layoutPriority(1)
                        Icon("chevron-down", size: 16)
                        Text("·").dFont(.small)
                        if line.syncing { ProgressView().controlSize(.mini).tint(section.onBoard2) }
                        if line.offline && !line.alarm && line.waiting == 0 { Icon("wifi-off", size: 14) }
                        if line.waiting > 0 && !line.alarm { Icon("cloud-upload", size: 14) }
                        Text(line.syncText).dFont(.small).lineLimit(1)
                            .foregroundStyle(line.alarm ? Tokens.Colors.onAlarm : section.onBoard2)
                            .padding(.horizontal, line.alarm ? 4 : 0)
                            .background(line.alarm ? Tokens.Colors.alarm : .clear, in: RoundedRectangle(cornerRadius: 3))
                    }
                    .foregroundStyle(section.onBoard2)
                    .frame(minHeight: Tokens.Size.phoneTouchMin)
                    .contentShape(Rectangle())
                }
                .accessibilityLabel("\(line.tailText), \(line.syncText)")
            }
            Text(title ?? section.title)
                .dFont(.boardTitle)
                .foregroundStyle(section.onBoard)
                .lineLimit(2)
                .accessibilityAddTraits(.isHeader)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, Tokens.Space.s2)
        .padding(.horizontal, Tokens.Space.s4)
        .padding(.bottom, back == nil ? Tokens.Space.s4 : Tokens.Space.s3)
    }
}

/// D hides the system bar on binder screens and draws PhoneHeader instead; this keeps the edge-swipe back (02 §9.1).
extension UINavigationController: @retroactive UIGestureRecognizerDelegate {
    override open func viewDidLoad() {
        super.viewDidLoad()
        interactivePopGestureRecognizer?.delegate = self
    }

    public func gestureRecognizerShouldBegin(_ recognizer: UIGestureRecognizer) -> Bool {
        viewControllers.count > 1
    }
}

/// PhoneLeaf (02 §9.5): the white work surface inset 8 from the edges, top corners radius.s; its content scrolls.
struct PhoneLeaf<Content: View>: View {
    @Environment(\.section) private var section
    @Environment(TabModel.self) private var tabs
    @ViewBuilder var content: Content

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: Tokens.Space.s4) { content }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, Tokens.Space.s5)
                    .padding(.horizontal, Tokens.Space.s4)
                    .padding(.bottom, Tokens.Space.s8)
                    .id("top")
            }
            .onChange(of: tabs.scrollToTop[section]) { proxy.scrollTo("top", anchor: .top) }
        }
        .background(Tokens.Colors.leaf)
        .clipShape(UnevenRoundedRectangle(topLeadingRadius: Tokens.Radius.s, topTrailingRadius: Tokens.Radius.s))
        .padding(.horizontal, Tokens.Space.s2)
    }
}

extension EnvironmentValues {
    @Entry var phoneBarAtBottom = true
}

/// PhoneTabBar (02 §9.4): five coloured tabs on the bottom or a side rail when the window is wide.
struct PhoneTabBar: View {
    var vertical = false
    @Environment(TabModel.self) private var tabs
    @Environment(StatusModel.self) private var status: StatusModel?
    @Environment(\.dynamicTypeSize) private var typeSize

    /// Labels hide at accessibility sizes; long-press shows the Large Content Viewer (05 §19).
    static let height: CGFloat = 60

    var body: some View {
        Group {
            if vertical {
                VStack(spacing: Tokens.Space.s1) { buttons }
                    .padding(.top, Tokens.Space.s2)
                    .padding(.horizontal, Tokens.Space.s1)
                    .frame(width: 82)
                    .frame(maxHeight: .infinity, alignment: .top)
                    .background(Tokens.Colors.cover, ignoresSafeAreaEdges: .leading)
            } else {
                HStack(alignment: .top, spacing: Tokens.Space.s1) { buttons }
                    .padding(.horizontal, Tokens.Space.s2)
                    .frame(height: Self.height, alignment: .top)
                    .frame(maxWidth: .infinity)
                    .background(Tokens.Colors.cover, ignoresSafeAreaEdges: .bottom)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isTabBar)
        .sensoryFeedback(.selection, trigger: tabs.selected)
    }

    private var buttons: some View {
        ForEach(Array(Section.phoneTabs.enumerated()), id: \.element) { index, section in
            tab(section, index: index)
        }
    }

    private func tab(_ section: Section, index: Int) -> some View {
        let selected = tabs.selected == section
        // 06 §1.3: Status carries an alarm badge with the overdue count.
        let overdue = section == .status ? status?.snapshot?.counts.overdue ?? 0 : 0
        let shape = UnevenRoundedRectangle(topLeadingRadius: selected || vertical ? Tokens.Radius.l : 0,
                                           bottomLeadingRadius: Tokens.Radius.l,
                                           bottomTrailingRadius: Tokens.Radius.l,
                                           topTrailingRadius: selected || vertical ? Tokens.Radius.l : 0)
        return Button { tabs.tap(section) } label: {
            VStack(spacing: 3) {
                Icon(section.icon, size: 21)
                    .overlay(alignment: .topTrailing) { if overdue > 0 { OverdueBadge(count: overdue).offset(x: 12, y: -6) } }
                if !typeSize.isAccessibilitySize {
                    Text(section.tabLabel).dFont(.tabLabel).lineLimit(1).minimumScaleFactor(0.8)
                }
            }
            .padding(.top, 6)
            .frame(maxWidth: .infinity)
            .frame(height: Self.height)
        }
        .buttonStyle(FillButtonStyle(fill: section.board, content: section.onBoard, shape: shape))
        .opacity(selected ? 1 : 0.92)
        .accessibilityLabel("\(section.title), tab \(index + 1) of \(Section.phoneTabs.count)" + (overdue > 0 ? ", \(overdue) overdue" : ""))
        .accessibilityAddTraits(selected ? [.isSelected] : [])
        .accessibilityShowsLargeContentViewer {
            Icon(section.icon, size: 21)
            Text(section.tabLabel)
        }
    }
}

/// A filled control with D's pressed layer: 14% of the content colour, no scale (02 §2.3).
struct FillButtonStyle<S: Shape>: ButtonStyle {
    let fill: Color
    let content: Color
    let shape: S

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(content)
            .background(fill)
            .overlay(content.opacity(configuration.isPressed ? 0.14 : 0))
            .clipShape(shape)
            .contentShape(shape)
    }
}

/// The overdue count on the Status tab: alarm fill, on-alarm figures (06 §1.3).
private struct OverdueBadge: View {
    let count: Int
    var body: some View {
        Text("\(count)").dFont(.tabLabel)
            .foregroundStyle(Tokens.Colors.onAlarm)
            .padding(.horizontal, 5)
            .frame(minWidth: 18, minHeight: 18)
            .background(Tokens.Colors.alarm, in: RoundedRectangle(cornerRadius: Tokens.Radius.s))
            .fixedSize()
    }
}

/// The tail line, the RailPlate and the rail's Account button. With `switchesAircraft`, a menu of the aircraft the user
/// can open, then Sign out; otherwise Sign out directly (05 §8.6, nothing-unsent path).
/// shortcut: a menu of tail numbers, not the AircraftSwitcher sheet (M-SWITCH-01). Build the sheet with the hangar
/// (M-HANGAR-01), or sooner if an account holds more aircraft than the menu shows without scrolling.
struct AccountButton<Label: View>: View {
    var switchesAircraft = false
    @ViewBuilder var label: Label
    @Environment(SessionStore.self) private var store
    @Environment(StatusModel.self) private var status: StatusModel?
    @Environment(OfflineStore.self) private var offline: OfflineStore?
    @Environment(TabModel.self) private var tabs
    @State private var confirming = false

    /// "3 changes and 2 pages" not yet on the server, or nil.
    private var unsent: String? {
        guard let offline else { return nil }
        let c = offline.items.count + offline.heldDocuments.count, p = offline.heldPages.count
        guard c + p > 0 else { return nil }
        return [c > 0 ? SyncBars.plural(c, "change") : nil, p > 0 ? SyncBars.plural(p, "page") : nil].compactMap { $0 }.joined(separator: " and ")
    }

    /// Notifications and Reminders (06 M-SYS-05), then Sign out.
    @ViewBuilder private var accountItems: some View {
        Button("Notifications") { tabs.sheet = .inbox }
        Button("Reminders") { tabs.sheet = .reminders }
        Button("Sign out") { confirming = true }
    }

    private var signOutQuestion: String {
        unsent.map { "\($0) \($0.hasPrefix("1 ") && !$0.contains(" and ") ? "hasn't" : "haven't") reached the server. Signing out deletes them from this phone." }
            ?? "Sign out of MyTailLog on this phone? The records stay on the server."
    }

    var body: some View {
        Group {
            if switchesAircraft, let status, !status.aircraft.isEmpty {
                Menu {
                    ForEach(status.aircraft) { a in
                        Button { status.select(a.id) } label: {
                            if a.id == status.currentId { SwiftUI.Label(a.tailNumber, systemImage: "checkmark") } else { Text(a.tailNumber) }
                        }
                    }
                    Divider()
                    accountItems
                } label: { label }
                .accessibilityHint("Switch aircraft, notifications, reminders or sign out")
            } else {
                Menu { accountItems } label: { label }
                    .accessibilityHint("Notifications, reminders or sign out")
            }
        }
        .buttonStyle(.plain)
        .hoverEffect()
        .confirmationDialog(signOutQuestion, isPresented: $confirming, titleVisibility: .visible) {
            if unsent == nil {
                Button("Sign out") { Task { await store.signOut() } }
            } else {
                // 05 §8.6: unsent work is never deleted without saying so.
                Button("Sync now") { Task { await offline?.sync() } }
                Button("Delete them and sign out", role: .destructive) { Task { await store.signOut() } }
            }
            Button(unsent == nil ? "Cancel" : "Keep working", role: .cancel) {}
        }
    }
}

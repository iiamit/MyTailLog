import SwiftUI

/// Signed out: M-AUTH-01. Signed in: the phone shell at compact width, the binder split view at regular width (05 §3.3).
struct RootView: View {
    let core: any CoreBridge
    @Environment(SessionStore.self) private var store
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.scenePhase) private var scenePhase
    @State private var tabs = TabModel()
    @State private var line = AircraftLine()

    var body: some View {
        Group {
            if store.session == nil {
                SignInView()
            } else if sizeClass == .regular {
                TabletShell()
            } else {
                PhoneShell()
            }
        }
        .environment(tabs)
        .environment(\.aircraftLine, line)
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            await store.refreshIfNeeded()
        }
        .task(id: store.session?.accessToken) {
            line = AircraftLine(tail: await core.aircraft().first?.tailNumber, lastSync: await core.lastSync())
        }
    }
}

/// 05 §5.2: a TabView keeps each tab's stack and state; its system bar is hidden and D's PhoneTabBar is drawn instead.
struct PhoneShell: View {
    @Environment(TabModel.self) private var tabs

    var body: some View {
        @Bindable var tabs = tabs
        TabView(selection: $tabs.selected) {
            ForEach(Section.phoneTabs) { section in
                Tab(section.title, image: section.icon, value: section) {
                    NavigationStack(path: tabs.path(section)) {
                        PhoneSectionScreen(section: section)
                    }
                }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) { PhoneTabBar() }
        // Documents is a tablet tab; on the phone it lives under Aircraft.
        .onAppear { if !Section.phoneTabs.contains(tabs.selected) { tabs.selected = .aircraft } }
    }
}

/// A top-level phone screen: PhoneHeader on the board colour, then the PhoneLeaf (06 §1.1).
struct PhoneSectionScreen: View {
    let section: Section

    var body: some View {
        VStack(spacing: 0) {
            PhoneHeader()
            PhoneLeaf {
                Text(section.emptyLine).dFont(.body).foregroundStyle(Tokens.Colors.ink)
            }
        }
        .background(section.board.ignoresSafeArea())
        .environment(\.section, section)
        .toolbar(.hidden, for: .navigationBar)
        .toolbarColorScheme(section.barColorScheme, for: .navigationBar)
        .toolbar(.hidden, for: .tabBar)
    }
}

/// iPad at regular width (05 §5.4): the binder Rail as the sidebar, the open section's board as the detail.
struct TabletShell: View {
    @Environment(TabModel.self) private var tabs

    var body: some View {
        NavigationSplitView {
            Rail()
                .navigationSplitViewColumnWidth(240)
                .toolbar(.hidden, for: .navigationBar)
        } detail: {
            NavigationStack(path: tabs.path(tabs.selected)) {
                TabletBoard(section: tabs.selected)
            }
            .id(tabs.selected)
        }
        .navigationSplitViewStyle(.balanced)
    }
}

/// The board: BoardHead on the section colour, then one leaf. iPad keeps the system bar, tinted to the board (02 §9.1).
struct TabletBoard: View {
    let section: Section

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s3) {
            Text(section.title)
                .font(.custom("LibreFranklin-ExtraBold", size: 30, relativeTo: .largeTitle))
                .foregroundStyle(section.onBoard)
                .accessibilityAddTraits(.isHeader)
                .frame(minHeight: Tokens.Size.boardheadMin, alignment: .bottomLeading)
            VStack(alignment: .leading) {
                Text(section.emptyLine).dFont(.body).foregroundStyle(Tokens.Colors.ink)
                Spacer(minLength: 0)
            }
            .padding(.top, 26)
            .padding(.horizontal, 30)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(Tokens.Colors.leaf, in: RoundedRectangle(cornerRadius: Tokens.Radius.s))
        }
        .padding(.horizontal, Tokens.Size.boardPad)
        .padding(.bottom, Tokens.Size.boardPad)
        .background(section.board.ignoresSafeArea())
        .environment(\.section, section)
        .toolbarBackground(section.board, for: .navigationBar)
        .toolbarBackgroundVisibility(.visible, for: .navigationBar)
        .toolbarColorScheme(section.barColorScheme, for: .navigationBar)
    }
}

/// The binder Rail (02 §3, 06 §9): RailPlate, six SectionTabs, RailFoot, on the cover.
struct Rail: View {
    @Environment(TabModel.self) private var tabs
    @Environment(\.aircraftLine) private var line

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s1) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: Tokens.Space.s1) {
                    Text(line.tailText).dFont(.heading).foregroundStyle(Tokens.Colors.onCover)
                    Icon("chevrons-up-down", size: 16).foregroundStyle(Tokens.Colors.onCover2)
                }
                Text(line.syncText.prefix(1).uppercased() + line.syncText.dropFirst())
                    .dFont(.small).foregroundStyle(Tokens.Colors.onCover2)
            }
            .padding(.bottom, Tokens.Space.s4)
            .accessibilityElement(children: .combine)

            ForEach(Section.tabletTabs) { section in
                sectionTab(section)
            }

            Spacer(minLength: Tokens.Space.s4)
            AccountButton {
                Label { Text("Account") } icon: { Icon("circle-user-round", size: 20) }
                    .dFont(.bodyStrong)
                    .foregroundStyle(Tokens.Colors.onCover)
                    .frame(minHeight: Tokens.Size.phoneTouchMin)
            }
        }
        .padding(.top, 18)
        .padding(.leading, 14)
        .padding(.bottom, Tokens.Space.s4)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Tokens.Colors.cover.ignoresSafeArea())
    }

    /// SectionTab: min 50 tall (heights by content arrive with the data); the open tab runs flush into the board.
    private func sectionTab(_ section: Section) -> some View {
        let selected = tabs.selected == section
        let shape = UnevenRoundedRectangle(topLeadingRadius: Tokens.Radius.l, bottomLeadingRadius: Tokens.Radius.l)
        return Button { tabs.tap(section) } label: {
            Text(section.title)
                .dFont(.bodyStrong)
                .padding(.horizontal, Tokens.Space.s3)
                .frame(maxWidth: .infinity, minHeight: Tokens.Size.tabMin, alignment: .leading)
        }
        .buttonStyle(FillButtonStyle(fill: section.board, content: section.onBoard, shape: shape))
        .padding(.trailing, selected ? 0 : Tokens.Space.s3)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }
}

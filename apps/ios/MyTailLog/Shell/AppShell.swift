import SwiftUI

/// Signed out: M-AUTH-01. Signed in: the phone shell at compact width, the binder split view at regular width (05 §3.3).
struct RootView: View {
    let statusAPI: StatusAPI
    @Environment(SessionStore.self) private var store
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.scenePhase) private var scenePhase
    @State private var tabs = TabModel()
    /// One Status model per signed-in user, so another account never sees the last one's aircraft.
    @State private var status: StatusModel?
    /// The open aircraft's logbooks; a new one when the aircraft changes.
    @State private var books: BooksModel?

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
        .environment(status)
        .environment(books)
        .environment(\.aircraftLine, status?.line ?? AircraftLine())
        .task(id: scenePhase) {
            guard scenePhase == .active else { return }
            await store.refreshIfNeeded()
        }
        .task(id: store.session?.userId) {
            status = store.session?.userId.map(makeStatus)
        }
        .task(id: status?.current?.id) {
            books = status?.current.map(makeBooks)
        }
    }

    private func makeBooks(_ aircraft: AircraftAccess) -> BooksModel {
        let store = store
        return BooksModel(aircraft: aircraft, api: statusAPI, token: { try await store.currentSession().accessToken })
    }

    private func makeStatus(userId: String) -> StatusModel {
        let api = statusAPI, store = store
        return StatusModel(
            loadAircraft: {
                let session = try await store.currentSession()
                return try await api.aircraft(token: session.accessToken, userId: userId, email: session.email)
            },
            loadStatus: { id in try await api.status(token: store.currentSession().accessToken, aircraftId: id) })
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

/// A top-level phone screen: Status's home, or the section's empty leaf (06 §1.1).
struct PhoneSectionScreen: View {
    let section: Section
    @Environment(StatusModel.self) private var status: StatusModel?
    @Environment(BooksModel.self) private var books: BooksModel?

    var body: some View {
        PhoneBoard(section: section) {
            if section == .status, let status {
                StatusHome(model: status)
            } else if section == .books, let books {
                BooksHome(model: books).id(books.aircraft.id)
            } else {
                PhoneLeaf {
                    Text(section.emptyLine).dFont(.body).foregroundStyle(Tokens.Colors.ink)
                }
            }
        }
    }
}

/// A phone board: PhoneHeader on the board colour, then the screen's leaf; `back` makes it a pushed screen.
struct PhoneBoard<Content: View>: View {
    let section: Section
    var title: String?
    var back: String?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(spacing: 0) {
            PhoneHeader(title: title, back: back)
            content
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
    @Environment(StatusModel.self) private var status: StatusModel?
    @Environment(BooksModel.self) private var books: BooksModel?

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s3) {
            Text(section.title)
                .font(.custom("LibreFranklin-ExtraBold", size: 30, relativeTo: .largeTitle))
                .foregroundStyle(section.onBoard)
                .accessibilityAddTraits(.isHeader)
                .frame(minHeight: Tokens.Size.boardheadMin, alignment: .bottomLeading)
            if section == .status, let status {
                StatusTablet(model: status)
            } else if section == .books, let books {
                BooksTablet(model: books).id(books.aircraft.id)
            } else {
                TabletLeaf {
                    Text(section.emptyLine).dFont(.body).foregroundStyle(Tokens.Colors.ink)
                }
            }
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
            AccountButton(switchesAircraft: true) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: Tokens.Space.s1) {
                        Text(line.tailText).dFont(.heading).foregroundStyle(Tokens.Colors.onCover)
                        Icon("chevrons-up-down", size: 16).foregroundStyle(Tokens.Colors.onCover2)
                    }
                    Text(line.syncText.prefix(1).uppercased() + line.syncText.dropFirst())
                        .dFont(.small).foregroundStyle(Tokens.Colors.onCover2)
                }
                .contentShape(Rectangle())
            }
            .accessibilityLabel("\(line.tailText), \(line.syncText)")
            .padding(.bottom, Tokens.Space.s4)

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

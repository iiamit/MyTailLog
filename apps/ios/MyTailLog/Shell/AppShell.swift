import SwiftUI
import WidgetKit

/// Signed out: M-AUTH-01. Signed in: tabs, a compact side rail, or the binder as the window grows.
enum ShellLayout: Equatable {
    case tabs, rail, duo, binder

    static func forWindow(width: CGFloat, height: CGFloat, sizeClass: UserInterfaceSizeClass?) -> Self {
        if sizeClass == .regular && width >= 900 { return .binder }
        if width >= 800 && height >= 500 { return .duo }
        return width >= 600 ? .rail : .tabs
    }
}

struct RootView: View {
    let statusAPI: StatusAPI
    @Environment(SessionStore.self) private var store
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.scenePhase) private var scenePhase
    @State private var tabs = TabModel()
    @State private var windowLayout: ShellLayout = .tabs
    /// One Status model per signed-in user, so another account never sees the last one's aircraft.
    @State private var status: StatusModel?
    /// The open aircraft's logbooks; a new one when the aircraft changes.
    @State private var books: BooksModel?
    /// The signed-in user's offline store (05 §6): mirror, outbox, held pages.
    @State private var offline: OfflineStore?
    /// The open aircraft's records (phase 4): Maintenance, Aircraft, Documents.
    @State private var recs: Recs?

    var body: some View {
        GeometryReader { window in
            let layout = ShellLayout.forWindow(width: window.size.width, height: window.size.height, sizeClass: sizeClass)
            Group {
                if store.session == nil {
                    SignInView()
                } else if layout == .binder {
                    TabletShell()
                        .environment(\.horizontalSizeClass, .regular)
                } else if layout == .duo {
                    DuoShell(fullWidth: window.size.width + window.safeAreaInsets.trailing,
                             fullHeight: window.size.height + window.safeAreaInsets.bottom,
                             leftLeafWidth: (window.size.width + window.safeAreaInsets.trailing) / 2
                                 - 82 - Tokens.Size.boardPad - Tokens.Space.s4 / 2)
                        .environment(\.horizontalSizeClass, .regular)
                        .ignoresSafeArea(edges: [.trailing, .bottom])
                } else {
                    PhoneShell(verticalTabs: layout == .rail, bottomInset: window.safeAreaInsets.bottom,
                               rightInset: layout == .tabs ? window.safeAreaInsets.trailing : 0,
                               safeWidth: window.size.width)
                }
            }
            .background { if store.session != nil { KeyCommands(tablet: layout == .binder || layout == .duo) } }
            .onChange(of: layout, initial: true) { _, newValue in windowLayout = newValue }
        }
        // Notifications and Reminders (06 M-SYS-05) over either shell.
        .sheet(item: Bindable(tabs).sheet) { s in
            AccountSheetView(sheet: s, api: notifyAPI, tails: tails) { LinkInbox.shared.pending = $0 }
        }
        // Log a flight and Report a squawk asked for by a link, an intent or ⇧⌘F.
        .fullScreenCover(item: Bindable(tabs).addRequest) { a in
            if let recs { if a == .flight { LogFlightFlow(recs: recs) } else { NewSquawk(recs: recs) } }
        }
        .environment(tabs)
        .environment(status)
        .environment(books)
        .environment(offline)
        .environment(recs)
        .environment(\.aircraftLine, line)
        // One route table (05 §5.5): links from notifications, widgets, intents, Spotlight and Universal Links.
        .task(id: "\(String(describing: links.pending))|\(status?.aircraft.count ?? -1)") { follow() }
        .onChange(of: status?.currentId) { _, id in
            SharedSnapshots.lastOpened = id
            WidgetCenter.shared.reloadAllTimelines()
        }
        // System search (05 §14): this aircraft's confirmed entries and tracked items, after each pull.
        .task(id: "\(books?.aircraft.id ?? "")|\(books?.entries.count ?? -1)|\(status?.snapshot?.computedAt ?? "")") {
            guard let books, let snap = status?.snapshot, snap.aircraftId == books.aircraft.id else { return }
            await Spotlight.index(aircraftId: books.aircraft.id, Spotlight.records(
                aircraftId: books.aircraft.id, tail: books.aircraft.tailNumber, entries: books.entries, logbooks: books.logbooks,
                pages: books.pages, items: snap.items))
        }
        .task(id: scenePhase) {
            switch scenePhase {
            case .active:
                await store.refreshIfNeeded()
                // Foreground: push, then pull, when the last sync is over a minute old (05 §6.7).
                if let offline, (offline.lastSyncAt?.timeIntervalSinceNow ?? -.infinity) < -60 { offline.schedule(after: 0) }
            case .background:
                AppDelegate.schedule()
            default: break
            }
        }
        .task(id: store.session?.userId) {
            if let userId = store.session?.userId {
                let o = OfflineStore.open(userId: userId, apiURL: statusAPI.apiURL)
                let store = store
                o.token = { try await store.currentSession().accessToken }
                offline = o
                status = makeStatus(userId: userId, offline: o)
                o.schedule(after: 0) // launch: push, then pull
                Push.shared.api = notifyAPI
                await Push.shared.start()
            } else {
                // Signed out (05 §8.6): this user's device copy goes.
                offline?.wipe()
                offline = nil
                status = nil
                // The widgets, Spotlight and the Live Activity forget this user too.
                SharedSnapshots.clear()
                WidgetCenter.shared.reloadAllTimelines()
                ReadingLive.shared.endAll()
                await Spotlight.clear()
            }
        }
        .task(id: status?.current?.id) {
            books = status?.current.map(makeBooks)
        }
        .task(id: "\(status?.current?.id ?? "")|\(status?.current?.role == .viewer)|\(offline?.userId ?? "")") {
            recs = status?.current.flatMap { a in offline.map { makeRecs(a, $0) } }
        }
        .onChange(of: offline?.revision) {
            if let offline { books?.readMirror(offline) }
        }
    }

    private var links: LinkInbox { LinkInbox.shared }

    private var notifyAPI: NotifyAPI {
        let store = store
        return NotifyAPI(apiURL: statusAPI.apiURL, token: { try await store.currentSession().accessToken })
    }

    private var tails: [String: String] {
        Dictionary((status?.aircraft ?? []).map { ($0.id, $0.tailNumber) }, uniquingKeysWith: { a, _ in a })
    }

    /// Opens a pending link once the aircraft list is known, switching aircraft first when the link names another.
    private func follow() {
        guard let link = links.pending, store.session != nil, let status, !status.loading || !status.aircraft.isEmpty else { return }
        links.pending = nil
        if let id = link.aircraftId, id != status.currentId, status.aircraft.contains(where: { $0.id == id }) { status.select(id) }
        if link.target == .review { ReadingLive.shared.endAll() }
        tabs.go(landing(link, tablet: windowLayout == .binder || windowLayout == .duo))
    }

    /// The tail line with the sync state (06 §1.3).
    private var line: AircraftLine {
        var l = status?.line ?? AircraftLine()
        if let offline {
            l.lastSync = offline.lastSyncAt ?? l.lastSync
            l.syncing = offline.syncing
            l.offline = offline.isOffline
            l.failed = offline.failed
            l.waiting = offline.waiting.count + offline.heldPages.count + offline.heldDocuments.count
            l.conflicts = offline.conflicts.count
        }
        return l
    }

    private func makeRecs(_ aircraft: AircraftAccess, _ offline: OfflineStore) -> Recs {
        let store = store
        let api = RecordsAPI(apiURL: statusAPI.apiURL, token: { try await store.currentSession().accessToken },
                             supabase: (statusAPI.supabaseURL, statusAPI.apiKey))
        return Recs(offline: offline, api: api, aircraft: aircraft, status: status)
    }

    private func makeBooks(_ aircraft: AircraftAccess) -> BooksModel {
        let store = store
        return BooksModel(aircraft: aircraft, api: statusAPI, offline: offline, token: { try await store.currentSession().accessToken })
    }

    /// Online first, the phone's copy when the server can't be reached (05 §6.1; the snapshot stays the authority).
    private func makeStatus(userId: String, offline: OfflineStore) -> StatusModel {
        let api = statusAPI, store = store
        return StatusModel(
            loadAircraft: {
                do {
                    let session = try await store.currentSession()
                    let list = try await api.aircraft(token: session.accessToken, userId: userId, email: session.email)
                    await offline.saveAircraft(list)
                    SharedSnapshots.saveAircraft(list.map { .init(id: $0.id, tail: $0.tailNumber) })
                    return list
                } catch {
                    let cached = await offline.cachedAircraft()
                    if cached.isEmpty { throw error }
                    return cached
                }
            },
            loadStatus: { id in
                do {
                    let data = try await api.statusData(token: store.currentSession().accessToken, aircraftId: id)
                    let snap = try JSONDecoder().decode(StatusSnapshot.self, from: data)
                    await offline.saveStatus(data, aircraftId: id)
                    // The widgets' copy (05 §11.2): written after every load; the server's body is confirmed data only.
                    SharedSnapshots.saveStatus(data, aircraftId: id)
                    WidgetCenter.shared.reloadAllTimelines()
                    return snap
                } catch {
                    guard let cached = await offline.cachedStatus(id) else { throw error }
                    return cached
                }
            })
    }
}

/// 05 §5.2: a TabView keeps each tab's stack and state; its system bar is hidden and D's PhoneTabBar is drawn instead.
struct PhoneShell: View {
    var verticalTabs = false
    var bottomInset: CGFloat = 0
    var rightInset: CGFloat = 0
    var safeWidth: CGFloat = 0
    @Environment(TabModel.self) private var tabs
    @Environment(Recs.self) private var recs: Recs?
    @State private var adding = false

    var body: some View {
        @Bindable var tabs = tabs
        HStack(spacing: 0) {
            if verticalTabs { PhoneTabBar(vertical: true) }
            TabView(selection: $tabs.selected) {
                ForEach(Section.phoneTabs) { section in
                    Tab(section.title, image: section.icon, value: section) {
                        NavigationStack(path: tabs.path(section)) {
                            PhoneSectionScreen(section: section).modifier(SyncDestinations()).modifier(RecordDestinations())
                                .ignoresSafeArea(.container, edges: rightInset > 0 ? .trailing : [])
                        }
                    }
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if !verticalTabs {
                    VStack(spacing: 0) {
                        tabs.selected.board.frame(height: Tokens.Space.s1)
                        HStack(spacing: 0) {
                            PhoneTabBar().frame(width: rightInset > 0 ? safeWidth : nil)
                            if rightInset > 0, recs != nil {
                                Button { adding = true } label: {
                                    Icon("plus", size: 28)
                                        .foregroundStyle(tabs.selected.onBoard)
                                        .frame(width: rightInset, height: PhoneTabBar.height)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("Add")
                                .keyboardShortcut("n", modifiers: .command)
                                .background(tabs.selected.board)
                            } else if rightInset > 0 {
                                tabs.selected.board.frame(width: rightInset)
                            }
                        }
                        .padding(.bottom, -bottomInset)
                    }
                }
            }
            .frame(width: rightInset > 0 ? safeWidth + rightInset : nil)
        }
        .modifier(AddHost(recs: recs, showButton: false, presented: $adding))
        .environment(\.duoCover, rightInset > 0)
        .environment(\.duoCoverTrailingInset, rightInset)
        .environment(\.phoneBarAtBottom, !verticalTabs)
        .ignoresSafeArea(edges: rightInset > 0 ? .trailing : [])
        // Documents is a tablet tab; on the phone it lives under Aircraft.
        .onAppear { if !Section.phoneTabs.contains(tabs.selected) { tabs.selected = .aircraft } }
    }
}

/// A top-level phone screen: Status's home, or the section's empty leaf (06 §1.1).
struct PhoneSectionScreen: View {
    let section: Section
    @Environment(StatusModel.self) private var status: StatusModel?
    @Environment(BooksModel.self) private var books: BooksModel?
    @Environment(Recs.self) private var recs: Recs?
    @Environment(\.duoCover) private var duoCover
    @State private var adding = false

    var body: some View {
        PhoneBoard(section: section) {
            if section == .status, let status {
                StatusHome(model: status)
            } else if section == .books, let books {
                BooksHome(model: books).id(books.aircraft.id)
            } else if section == .maint, let recs {
                MaintHome(recs: recs).id(recs.id)
            } else if section == .aircraft, let recs {
                AircraftHome(recs: recs).id(recs.id)
            } else if section == .share, let recs {
                ShareHome(recs: recs).id(recs.id)
            } else {
                PhoneLeaf {
                    Text(section.emptyLine).dFont(.body).foregroundStyle(Tokens.Colors.ink)
                }
            }
        }
        // The record leaves carry their own toast; Status and Logbooks show what the Add sheet saved here.
        .safeAreaInset(edge: .bottom) { if let recs, section == .status || section == .books { ToastBar(recs: recs) } }
        // 02 §9: the AddButton on the top-level screens of Status, Logbooks, Maint. and Aircraft.
        .modifier(AddHost(recs: section == .share ? nil : recs, showButton: !duoCover, presented: $adding))
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
            if back == nil { SyncBars() }
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
                TabletBoard(section: tabs.selected).modifier(SyncDestinations()).modifier(RecordDestinations())
            }
            .id(tabs.selected)
        }
        .navigationSplitViewStyle(.balanced)
    }
}

/// Duo's inner screen has room for two leaves but not the iPad's full text sidebar.
struct DuoShell: View {
    let fullWidth: CGFloat
    let fullHeight: CGFloat
    let leftLeafWidth: CGFloat
    @Environment(TabModel.self) private var tabs
    @Environment(\.aircraftLine) private var line
    @Environment(Recs.self) private var recs: Recs?
    @State private var adding = false

    var body: some View {
        HStack(spacing: 0) {
            VStack(spacing: 0) {
                AccountButton(switchesAircraft: true) {
                    Text(line.tailText).dFont(.small, weight: 700)
                        .lineLimit(1).minimumScaleFactor(0.7)
                        .foregroundStyle(Tokens.Colors.onCover)
                        .frame(width: 74, height: 48)
                }
                PhoneTabBar(vertical: true)
                if recs != nil {
                    Button { adding = true } label: {
                        Icon("plus", size: 22).foregroundStyle(Tokens.Colors.onCover)
                            .frame(width: 74, height: 48)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Add")
                    .keyboardShortcut("n", modifiers: .command)
                }
                AccountButton {
                    Icon("circle-user-round", size: 22).foregroundStyle(Tokens.Colors.onCover)
                        .frame(width: 74, height: 48)
                }
                .accessibilityLabel("Account")
            }
            .frame(width: 82)
            .background(Tokens.Colors.cover.ignoresSafeArea())
            NavigationStack(path: tabs.path(tabs.selected)) {
                TabletBoard(section: tabs.selected).modifier(SyncDestinations()).modifier(RecordDestinations())
                    .ignoresSafeArea(.container, edges: .trailing)
            }
            .id(tabs.selected)
            .frame(width: fullWidth - 82, height: fullHeight)
        }
        .frame(width: fullWidth, alignment: .leading)
        .background(Tokens.Colors.cover.ignoresSafeArea())
        .modifier(AddHost(recs: recs, showButton: false, presented: $adding))
        .environment(\.duoLeftLeafWidth, leftLeafWidth)
        .onAppear { if !Section.phoneTabs.contains(tabs.selected) { tabs.selected = .aircraft } }
    }
}

/// The board: BoardHead on the section colour, then one leaf. iPad keeps the system bar, tinted to the board (02 §9.1).
struct TabletBoard: View {
    let section: Section
    @Environment(StatusModel.self) private var status: StatusModel?
    @Environment(BooksModel.self) private var books: BooksModel?
    @Environment(Recs.self) private var recs: Recs?
    @Environment(\.duoLeftLeafWidth) private var duoLeftLeafWidth

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s3) {
            Text(section.title)
                .font(.custom("LibreFranklin-ExtraBold", size: 30, relativeTo: .largeTitle))
                .foregroundStyle(section.onBoard)
                .accessibilityAddTraits(.isHeader)
                .frame(minHeight: duoLeftLeafWidth == nil ? Tokens.Size.boardheadMin : 40, alignment: .bottomLeading)
            if section == .status, let status {
                StatusTablet(model: status)
            } else if section == .books, let books {
                BooksTablet(model: books).id(books.aircraft.id)
            } else if [.maint, .aircraft, .docs, .share].contains(section), let recs {
                RecordsTablet(section: section, recs: recs).id(recs.id)
            } else {
                TabletLeaf {
                    Text(section.emptyLine).dFont(.body).foregroundStyle(Tokens.Colors.ink)
                }
            }
        }
        .padding(.horizontal, Tokens.Size.boardPad)
        .padding(.bottom, duoLeftLeafWidth == nil ? Tokens.Size.boardPad : Tokens.Space.s1)
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
    @Environment(Recs.self) private var recs: Recs?
    @State private var adding = false

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
            if recs != nil {
                // RailFoot's Add (06 §9: M-FLIGHT-01 from the rail; ⌘N).
                Button { adding = true } label: {
                    Label { Text("Add") } icon: { Icon("plus", size: 20) }
                        .dFont(.bodyStrong).foregroundStyle(Tokens.Colors.onCover)
                        .frame(minHeight: Tokens.Size.phoneTouchMin)
                }
                .buttonStyle(.plain)
                .keyboardShortcut("n", modifiers: .command)
            }
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
        .modifier(AddHost(recs: recs, showButton: false, presented: $adding))
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
        .hoverEffect(.highlight)
        .padding(.trailing, selected ? 0 : Tokens.Space.s3)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
    }
}

import CoreSpotlight
import SwiftUI

@main
struct MyTailLogApp: App {
    /// Background uploads and BGTasks (05 §9).
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var store: SessionStore
    private let statusAPI = StatusAPI.fromBundle()

    init() {
        _store = State(initialValue: SessionStore.shared)
    }

    var body: some Scene {
        WindowGroup {
            // Light and dark follow the system (14-decisions C8); the Settings override arrives with Settings.
            Group {
                #if DEBUG
                if let mode = ProcessInfo.processInfo.environment["MTL_UI_TEST_IDENTITY"] {
                    IdentityUITestScreen(viewer: mode == "viewer")
                } else if let mode = ProcessInfo.processInfo.environment["MTL_UI_TEST_OWNER"] {
                    OwnerWorkspaceUITestScreen(mode: mode)
                } else if let mode = ProcessInfo.processInfo.environment["MTL_UI_TEST_ADD"] {
                    AddUITestScreen(viewer: mode == "viewer")
                } else {
                    RootView(statusAPI: statusAPI)
                }
                #else
                RootView(statusAPI: statusAPI)
                #endif
            }
                .environment(store)
                // App links (05 §5.5: widgets, the Live Activity, Universal Links) go to the shell; email links and OAuth
                // returns (05 §8.4) to sign-in.
                .onOpenURL { url in
                    if let link = AppLinks.parse(url.absoluteString) { LinkInbox.shared.pending = link } else { Task { await store.open(url) } }
                }
                // A Spotlight result (05 §14): its identifier is the item's app link.
                .onContinueUserActivity(CSSearchableItemActionType) { activity in
                    LinkInbox.shared.pending = AppLinks.parse(activity.userInfo?[CSSearchableItemActivityIdentifier] as? String)
                }
                #if DEBUG
                .task {
                    if let v = ProcessInfo.processInfo.environment["MTL_DEMO_READING"] { ReadingLive.shared.demo(done: v == "done") }
                }
                #endif
        }
    }
}

#if DEBUG
/// An isolated simulator fixture for UI tests; it uses the real AddHost and never signs in or calls the server.
private struct AddUITestScreen: View {
    @State private var tabs = TabModel()
    @State private var presented = false
    private let recs: Recs

    init(viewer: Bool) {
        let base = URL(string: "https://mfb-test.mytaillog.com")!
        let offline = OfflineStore(userId: "ui-test", apiURL: base, root: FileManager.default.temporaryDirectory)
        recs = Recs(offline: offline, api: RecordsAPI(apiURL: base, token: { throw URLError(.userAuthenticationRequired) }),
                    aircraft: AircraftAccess(id: "ui-test", tailNumber: "N123AB", isDemo: false, role: viewer ? .viewer : .owner), status: nil)
    }

    var body: some View {
        VStack {
            Button("Add") { presented = true }
            if tabs.scanPending { Text("Scan requested") }
        }
        .modifier(AddHost(recs: recs, showButton: false, presented: $presented))
        .environment(tabs)
    }
}
#endif

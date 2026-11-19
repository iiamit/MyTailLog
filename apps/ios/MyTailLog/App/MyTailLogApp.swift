import CoreSpotlight
import SwiftUI

@main
struct MyTailLogApp: App {
    /// Background uploads and BGTasks (05 §9).
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    /// Swap for the KMP-backed bridge when the XCFramework lands (Core/CoreBridge.swift).
    @State private var store: SessionStore
    private let statusAPI = StatusAPI.fromBundle()

    init() {
        _store = State(initialValue: SessionStore(auth: .fromBundle(), core: InMemoryCore()))
    }

    var body: some Scene {
        WindowGroup {
            // Light and dark follow the system (14-decisions C8); the Settings override arrives with Settings.
            RootView(statusAPI: statusAPI).environment(store)
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

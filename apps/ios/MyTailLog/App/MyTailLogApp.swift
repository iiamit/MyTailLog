import SwiftUI

@main
struct MyTailLogApp: App {
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
                // Email links (Universal Links) and OAuth returns (05 §8.4).
                .onOpenURL { url in Task { await store.open(url) } }
        }
    }
}

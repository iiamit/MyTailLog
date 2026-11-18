import SwiftUI

@main
struct MyTailLogApp: App {
    /// Swap for the KMP-backed bridge when the XCFramework lands (Core/CoreBridge.swift).
    private let core: any CoreBridge
    @State private var store: SessionStore

    init() {
        let core = InMemoryCore()
        self.core = core
        _store = State(initialValue: SessionStore(auth: .fromBundle(), core: core))
    }

    var body: some Scene {
        WindowGroup {
            // Light and dark follow the system (14-decisions C8); the Settings override arrives with Settings.
            RootView(core: core).environment(store)
        }
    }
}

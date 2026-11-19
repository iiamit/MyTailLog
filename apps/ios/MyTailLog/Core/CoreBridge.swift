import Foundation

/// Integration seam for the Kotlin Multiplatform core (`apps/core`, shipped as an XCFramework; 05 §4.2).
/// The app talks to the core only through this protocol. When the XCFramework lands, add a `KMPCore`
/// conforming type that wraps it (SKIE turns its `suspend` functions into `async`) and pass it to
/// `MyTailLogApp` in place of `InMemoryCore`. Views never import Kotlin types directly.
protocol CoreBridge: Sendable {
    /// The platform owns auth; the core gets the Supabase access token for its API calls (05 §8.1).
    func setAccessToken(_ token: String?) async
    /// Aircraft the signed-in user can open, from the device copy.
    func aircraft() async -> [AircraftSummary]
    /// When the device copy last finished a sync; nil before the first one.
    func lastSync() async -> Date?
    /// Sign-out: wipe the device copy, outbox and files (05 §8.6).
    func wipe() async
}

struct AircraftSummary: Identifiable, Hashable, Sendable {
    let id: String
    let tailNumber: String
}

/// Stand-in until the XCFramework is wired: holds nothing, never syncs.
actor InMemoryCore: CoreBridge {
    private var token: String?
    private var rows: [AircraftSummary]

    init(aircraft: [AircraftSummary] = []) {
        rows = aircraft
    }

    func setAccessToken(_ token: String?) { self.token = token }
    func aircraft() -> [AircraftSummary] { rows }
    func lastSync() -> Date? { nil }
    func wipe() {
        rows = []
        token = nil
    }
}

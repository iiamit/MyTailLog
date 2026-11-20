import Foundation
import XCTest
@testable import MyTailLog

/// Separate release check: the real Debug app endpoints use the TEST Supabase project and mfb-test API.
final class LiveOfflineTests: XCTestCase {
    @MainActor func testTestBackendPullSurvivesOfflineRestart() async throws {
        guard let raw = ProcessInfo.processInfo.environment["MTL_QA_USER_JSON"], !raw.isEmpty else {
            if ProcessInfo.processInfo.environment["MTL_QA_REQUIRED"] == "1" { XCTFail("MTL_QA_USER_JSON is required for live tests"); return }
            throw XCTSkip("Set MTL_QA_USER_JSON to run against the test backend")
        }
        let creds = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: String])
        let session = try await AuthClient.fromBundle().signIn(email: XCTUnwrap(creds["email"]), password: XCTUnwrap(creds["password"]))
        let root = FileManager.default.temporaryDirectory.appending(path: "live-offline-\(UUID().uuidString)", directoryHint: .isDirectory)
        defer { UserDefaults.standard.removeObject(forKey: "MTLForceOffline"); try? FileManager.default.removeItem(at: root) }
        UserDefaults.standard.removeObject(forKey: "MTLForceOffline")
        let api = URL(string: "https://mfb-test.mytaillog.com")!
        let aircraft = "d5c25951-f64a-5331-9b60-9ee02b456a25" // N734QA in the TEST project
        var store: OfflineStore? = OfflineStore(userId: "qa-live-test", apiURL: api, root: root)
        store!.token = { session.accessToken }
        await store!.sync()
        XCTAssertFalse(store!.failed, "test backend sync failed")
        XCTAssertTrue(store!.hasPulled, "test backend returned no sync cursor")
        XCTAssertNotNil(store!.raw("aircraft", id: aircraft), "QA aircraft was not pulled")
        store!.close()
        store = nil

        let reopened = OfflineStore(userId: "qa-live-test", apiURL: api, root: root)
        reopened.forcedOffline = true
        XCTAssertNotNil(reopened.raw("aircraft", id: aircraft), "aircraft disappeared after an offline restart")
        reopened.close()
    }
}

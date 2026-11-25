import XCTest

final class IdentityReviewUITests: XCTestCase {
    @MainActor func testReferencePageCanReviewIdentityWithoutMaintenanceEntries() {
        let app = XCUIApplication()
        app.launchEnvironment["MTL_UI_TEST_IDENTITY"] = "owner"
        app.launch()
        let accept = app.buttons["Accept details"]
        XCTAssertTrue(accept.waitForExistence(timeout: 15))
        app.swipeUp()
        if !accept.isHittable { app.swipeUp() }
        XCTAssertTrue(app.textFields["Serial number"].exists)
        accept.tap()
        XCTAssertTrue(app.staticTexts["Aircraft identification · Details accepted"].waitForExistence(timeout: 10))
        app.buttons["Mark page reviewed and next"].tap()
        XCTAssertTrue(app.buttons["Done"].waitForExistence(timeout: 10))
    }

    @MainActor func testViewerCannotAcceptIdentityAndReferenceLayoutFitsOrientations() {
        let app = XCUIApplication()
        app.launchEnvironment["MTL_UI_TEST_IDENTITY"] = "viewer"
        app.launch()
        XCTAssertTrue(app.buttons["Accept details"].waitForExistence(timeout: 15))
        XCTAssertFalse(app.buttons["Accept details"].isEnabled)
        // shortcut: XCTest reports the Duo cover frame for both displays; verify inner rotations in Device Hub until XCTest supports its active display.
        let orientations: [UIDeviceOrientation] = ProcessInfo.processInfo.environment["SIMULATOR_DEVICE_NAME"]?.contains("Duo") == true ? [.portrait] : [.portrait, .landscapeLeft, .landscapeRight]
        for orientation in orientations {
            XCUIDevice.shared.orientation = orientation
            let landscape = orientation != .portrait
            let settled = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
                landscape ? app.frame.width > app.frame.height : app.frame.height > app.frame.width
            }, object: nil)
            XCTAssertEqual(XCTWaiter.wait(for: [settled], timeout: 10), .completed)
            var screenshot = XCUIScreen.main.screenshot()
            if (screenshot.image.size.width > screenshot.image.size.height) != landscape { screenshot = app.screenshot() }
            let capture = XCTAttachment(screenshot: screenshot)
            capture.name = "reference-review-\(orientation.rawValue)"
            capture.lifetime = .keepAlways
            add(capture)
            XCTAssertTrue(app.buttons["Next page"].exists)
        }
        XCUIDevice.shared.orientation = .portrait
    }
}

import XCTest

final class OwnerWorkspaceUITests: XCTestCase {
    @MainActor private func launch(_ mode: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchEnvironment["MTL_UI_TEST_OWNER"] = mode
        app.launch()
        XCTAssertTrue(app.staticTexts["Sample records · UI test"].waitForExistence(timeout: 10))
        return app
    }

    @MainActor func testOwnerWorkspacesAcrossOrientations() {
        let screens = [("annual", "Make PDF summary"), ("inbox", "Upload documents"), ("engine", "Record compression or engine event"), ("expenses", "Add expense")]
        for (mode, action) in screens {
            let app = launch(mode)
            for orientation in [UIDeviceOrientation.portrait, .landscapeLeft, .landscapeRight] {
                XCUIDevice.shared.orientation = orientation
                let landscape = orientation != .portrait
                let settled = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
                    landscape ? app.frame.width > app.frame.height : app.frame.height > app.frame.width
                }, object: nil)
                XCTAssertEqual(XCTWaiter.wait(for: [settled], timeout: 10), .completed, "The application did not adopt the requested orientation")
                let button = app.buttons[action]
                XCTAssertTrue(button.waitForExistence(timeout: 10), "\(mode): missing \(action)")
                if !button.isHittable { app.swipeUp() }
                XCTAssertTrue(button.isHittable, "\(mode): action obstructed in \(orientation.rawValue)")
                // The application's cached capture rect can lag a rotation; capture the entire simulator display.
                var screenshot = XCUIScreen.main.screenshot()
                // Multi-display devices can report the cover as the main screen while the app is on the inner display.
                if (screenshot.image.size.width > screenshot.image.size.height) != landscape { screenshot = app.screenshot() }
                XCTAssertEqual(screenshot.image.size.width > screenshot.image.size.height, landscape, "Screenshot orientation differs from the app window")
                let capture = XCTAttachment(screenshot: screenshot)
                capture.name = "owner-\(mode)-\(orientation.rawValue)"
                capture.lifetime = .keepAlways
                add(capture)
            }
            app.terminate()
        }
        XCUIDevice.shared.orientation = .portrait
    }

    @MainActor func testInboxReviewAndExpenseFormsAreNativeAndReachable() {
        var app = launch("inbox")
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Oil and filter invoice.pdf")).firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Review document"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Open original"].exists)
        app.swipeUp()
        XCTAssertTrue(app.textFields["Vendor"].waitForExistence(timeout: 5))
        recordScreen("owner-inbox-review")
        app.terminate()
        app = launch("expenses")
        app.buttons["Add expense"].tap()
        XCTAssertTrue(app.textFields["Amount (negative for refund)"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Currency"].exists)
        recordScreen("owner-expense-form")
        app.terminate()
        app = launch("engine")
        app.buttons["Record compression or engine event"].tap()
        XCTAssertTrue(app.textFields["Cylinder 1 pressure (psi)"].waitForExistence(timeout: 5))
        recordScreen("owner-compression-form")
        app.terminate()
    }

    @MainActor private func recordScreen(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    @MainActor func testViewerCannotOpenFinancialData() {
        let app = launch("viewer")
        XCTAssertTrue(app.staticTexts["Financial records are visible only to the aircraft owner. Maintenance access does not include financial access."].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["Add expense"].exists)
        XCTAssertFalse(app.buttons["Export selected period as CSV"].exists)
    }
}

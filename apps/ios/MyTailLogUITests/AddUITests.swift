import XCTest

final class AddUITests: XCTestCase {
    @MainActor
    private func launch(_ mode: String = "owner") -> XCUIApplication {
        let app = XCUIApplication()
        app.launchEnvironment["MTL_UI_TEST_ADD"] = mode
        app.launch()
        XCTAssertTrue(app.buttons["Add"].waitForExistence(timeout: 10))
        return app
    }

    @MainActor func testEveryOwnerActionOpensItsDestination() {
        let app = launch()
        defer { app.terminate() }
        let actions = [
            ("Log a flight", "Tach"),
            ("Add oil", "Quarts"),
            ("Report a squawk", "New squawk"),
            ("Scan logbook pages", "Scan requested"),
            ("Add a document", "Choose a file"),
            ("Upload documents", "Choose files"),
        ]
        for (label, destination) in actions {
            app.buttons["Add"].tap()
            let action = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", label)).firstMatch
            XCTAssertTrue(action.waitForExistence(timeout: 5))
            action.tap()
            let opened = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", destination)).firstMatch
            XCTAssertTrue(opened.waitForExistence(timeout: 10), "\(label) did not open \(destination)")
            if label == "Scan logbook pages" {
                app.buttons["Reset scan request"].tap()
                XCTAssertFalse(app.staticTexts["Scan requested"].exists)
            } else {
                let cancel = app.buttons["Cancel"].firstMatch
                XCTAssertTrue(cancel.waitForExistence(timeout: 5))
                cancel.tap()
            }
            XCTAssertTrue(opened.waitForNonExistence(timeout: 5), "\(label) left its destination open")
            XCTAssertTrue(app.buttons["Add"].isHittable, "\(label) did not return to the start")
        }
    }

    @MainActor func testViewerCanOnlyReportSquawk() {
        let app = launch("viewer")
        app.buttons["Add"].tap()
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Report a squawk")).firstMatch.waitForExistence(timeout: 5))
        for label in ["Log a flight", "Add oil", "Scan logbook pages", "Add a document", "Upload documents"] {
            XCTAssertFalse(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", label)).firstMatch.exists)
        }
    }

    @MainActor func testSignedOutLaunchShowsLogin() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.staticTexts["MyTailLog"].waitForExistence(timeout: 10))
    }

    @MainActor func testLandscapeKeepsAddSheetReachable() {
        let app = launch()
        XCUIDevice.shared.orientation = .landscapeLeft
        defer { XCUIDevice.shared.orientation = .portrait }
        XCTAssertTrue(app.buttons["Add"].waitForExistence(timeout: 10))
        app.buttons["Add"].tap()
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Log a flight")).firstMatch.waitForExistence(timeout: 10))
    }
}

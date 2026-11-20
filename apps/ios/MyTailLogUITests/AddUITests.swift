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
        let actions = [
            ("Log a flight", "Type it"),
            ("Add oil", "Quarts"),
            ("Report a squawk", "New squawk"),
            ("Scan logbook pages", "Scan requested"),
            ("Add a document", "Choose a file"),
        ]
        for (label, destination) in actions {
            let app = launch()
            app.buttons["Add"].tap()
            let action = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", label)).firstMatch
            XCTAssertTrue(action.waitForExistence(timeout: 5))
            action.tap()
            let opened = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", destination)).firstMatch
            XCTAssertTrue(opened.waitForExistence(timeout: 10), "\(label) did not open \(destination)")
            app.terminate()
        }
    }

    @MainActor func testViewerCanOnlyReportSquawk() {
        let app = launch("viewer")
        app.buttons["Add"].tap()
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Report a squawk")).firstMatch.waitForExistence(timeout: 5))
        for label in ["Log a flight", "Add oil", "Scan logbook pages", "Add a document"] {
            XCTAssertFalse(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", label)).firstMatch.exists)
        }
    }

    @MainActor func testSignedOutLaunchShowsLogin() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.staticTexts["MyTailLog"].waitForExistence(timeout: 10))
    }
}

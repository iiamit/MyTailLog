import XCTest

final class AddUITests: XCTestCase {
    private func launch(_ mode: String = "owner") -> XCUIApplication {
        let app = XCUIApplication()
        app.launchEnvironment["MTL_UI_TEST_ADD"] = mode
        app.launch()
        XCTAssertTrue(app.buttons["Add"].waitForExistence(timeout: 10))
        return app
    }

    func testEveryOwnerActionOpensItsDestination() {
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
            XCTAssertTrue(app.buttons[label].waitForExistence(timeout: 5))
            app.buttons[label].tap()
            XCTAssertTrue(app.staticTexts[destination].waitForExistence(timeout: 10), "\(label) did not open \(destination)")
            app.terminate()
        }
    }

    func testViewerCanOnlyReportSquawk() {
        let app = launch("viewer")
        app.buttons["Add"].tap()
        XCTAssertTrue(app.buttons["Report a squawk"].waitForExistence(timeout: 5))
        for label in ["Log a flight", "Add oil", "Scan logbook pages", "Add a document"] {
            XCTAssertFalse(app.buttons[label].exists)
        }
    }

    func testSignedOutLaunchShowsLogin() {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.staticTexts["MyTailLog"].waitForExistence(timeout: 10))
    }
}

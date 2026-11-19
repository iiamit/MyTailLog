import Foundation
import SwiftUI
import Testing
@testable import MyTailLog

private final class Marker {}

/// The N734DM snapshot (computed 2026-11-18), optionally with extra items, as the server would send them.
private func snapshot(adding extra: [[String: Any]] = []) throws -> StatusSnapshot {
    let url = try #require(Bundle(for: Marker.self).url(forResource: "status-n734dm", withExtension: "json"))
    var o = try #require(try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    o["items"] = (o["items"] as? [[String: Any]] ?? []) + extra
    return try JSONDecoder().decode(StatusSnapshot.self, from: JSONSerialization.data(withJSONObject: o))
}

/// An item whose only completion was read by AI and not yet confirmed: the server sends it as "no record".
nonisolated(unsafe) private let unconfirmed: [String: Any] = [
    "key": "mx:ai-only", "source": "mx", "label": "Fire extinguisher", "rule": "annual", "advisory": false, "ifrOnly": false,
    "status": "no_record", "calendar": ["dueDate": "2026-11-25", "daysLeft": 7, "calendarMonthRule": false],
    "lastDone": ["trust": "ai_read"], "waitingEntryId": "entry-ai",
]

private let now = Day.instant("2026-11-18T23:00:00Z")!

struct AppLinkTests {
    @Test func parsesUniversalLinksForAnAircraft() {
        #expect(AppLinks.parse("https://mytaillog.com/app/a/A1") == AppLink(aircraftId: "A1", target: .status))
        #expect(AppLinks.parse("https://mytaillog.com/app/a/A1/due") == AppLink(aircraftId: "A1", target: .items))
        #expect(AppLinks.parse("https://mytaillog.com/app/a/A1/item/mx:9") == AppLink(aircraftId: "A1", target: .item, arg: "mx:9"))
        #expect(AppLinks.parse("https://mytaillog.com/app/a/A1/plan?date=2026-12-01") == AppLink(aircraftId: "A1", target: .plan))
        #expect(AppLinks.parse("https://mytaillog.com/app/a/A1/entry/E1") == AppLink(aircraftId: "A1", target: .entry, arg: "E1"))
        #expect(AppLinks.parse("https://mytaillog.com/app/a/A1/squawk/new")?.target == .newSquawk)
        #expect(AppLinks.parse("https://mytaillog.com/app/a/A1/squawk/S1") == AppLink(aircraftId: "A1", target: .squawk, arg: "S1"))
        #expect(AppLinks.parse("https://mytaillog.com/app/a/A1/doc/D1") == AppLink(aircraftId: "A1", target: .doc, arg: "D1"))
        #expect(AppLinks.parse("https://mytaillog.com/app/a/A1/review/P1")?.target == .review)
        #expect(AppLinks.parse("https://www.mytaillog.com/app/a/A1/queue")?.target == .queue)
    }

    @Test func parsesTheServersDeepLinks() {
        // lib/notifications.ts, the action route and the reading queue (same vocabulary as the web's appLinkToWeb).
        #expect(AppLinks.parse("mytaillog://aircraft/A1/status") == AppLink(aircraftId: "A1", target: .status))
        #expect(AppLinks.parse("mytaillog://aircraft/A1/status/item/mx:9") == AppLink(aircraftId: "A1", target: .item, arg: "mx:9"))
        #expect(AppLinks.parse("mytaillog://aircraft/A1/status/visit/V1") == AppLink(aircraftId: "A1", target: .visit, arg: "V1"))
        #expect(AppLinks.parse("mytaillog://aircraft/A1/status/plan")?.target == .plan)
        #expect(AppLinks.parse("mytaillog://aircraft/A1/logbooks/review?batch=B1") == AppLink(aircraftId: "A1", target: .review))
        #expect(AppLinks.parse("mytaillog://aircraft/A1/maint/squawk/S1") == AppLink(aircraftId: "A1", target: .squawk, arg: "S1"))
        #expect(AppLinks.parse("mytaillog://aircraft/A1/books/entry/E1") == AppLink(aircraftId: "A1", target: .entry, arg: "E1"))
    }

    @Test func accountLinksAndUnknownPaths() {
        #expect(AppLinks.parse("https://mytaillog.com/app/settings/notifications") == AppLink(aircraftId: nil, target: .reminders))
        #expect(AppLinks.parse("https://mytaillog.com/app/notifications")?.target == .inbox)
        #expect(AppLinks.parse("https://mytaillog.com/app/flight") == AppLink(aircraftId: nil, target: .flight))
        #expect(AppLinks.parse("https://mytaillog.com/app/a/A1/somewhere/new") == AppLink(aircraftId: "A1", target: .status))
    }

    @Test func leavesSignInAndForeignLinksAlone() {
        #expect(AppLinks.parse("https://mytaillog.com/app/auth/callback?code=x") == nil)
        #expect(AppLinks.parse("com.mytaillog.app://auth/callback?code=x") == nil)
        #expect(AppLinks.parse("https://evil.example/app/a/A1") == nil)
        #expect(AppLinks.parse("https://mytaillog.com/r/room") == nil)
        #expect(AppLinks.parse(nil) == nil)
        #expect(AppLinks.parse("") == nil)
    }

    @Test func buildsTheHttpsForm() {
        #expect(AppLinks.url("A1", "item/mx:9").absoluteString == "https://mytaillog.com/app/a/A1/item/mx:9")
        #expect(AppLinks.url(nil).absoluteString == "https://mytaillog.com/app")
        #expect(AppLinks.parse(AppLinks.url("A1", "review").absoluteString) == AppLink(aircraftId: "A1", target: .review))
    }

    @Test func threadsByAircraft() {
        #expect(AppLinks.thread("mytaillog://aircraft/A1/status") == "aircraft-A1")
        #expect(AppLinks.thread(nil) == "account")
    }
}

@MainActor
struct LandingTests {
    @Test func phonePushesTheRouteOnItsTab() {
        #expect(landing(AppLink(aircraftId: nil, target: .items), tablet: false) == Landing(section: .status, then: .push(StatusRoute.all)))
        #expect(landing(AppLink(aircraftId: nil, target: .item, arg: "k"), tablet: false) == Landing(section: .status, then: .push(StatusRoute.item("k"))))
        #expect(landing(AppLink(aircraftId: nil, target: .docs), tablet: false) == Landing(section: .aircraft, then: .push(RecRoute.documents)))
        #expect(landing(AppLink(aircraftId: nil, target: .squawk, arg: "S"), tablet: false) == Landing(section: .maint, then: .push(RecRoute.squawk("S"))))
        #expect(landing(AppLink(aircraftId: nil, target: .entry, arg: "E"), tablet: false) == Landing(section: .books, then: .push(BooksRoute.entry("E"))))
    }

    @Test func tabletLandsOnTheSectionWhereLeavesHoldTheSelection() {
        #expect(landing(AppLink(aircraftId: nil, target: .item, arg: "k"), tablet: true) == Landing(section: .status))
        #expect(landing(AppLink(aircraftId: nil, target: .docs), tablet: true) == Landing(section: .docs))
        #expect(landing(AppLink(aircraftId: nil, target: .plan), tablet: true) == Landing(section: .status, then: .push(RecRoute.plan)))
    }

    @Test func flightSheetsAndReview() {
        #expect(landing(AppLink(aircraftId: nil, target: .flight), tablet: false) == Landing(section: nil, then: .add(.flight)))
        #expect(landing(AppLink(aircraftId: nil, target: .inbox), tablet: true) == Landing(section: nil, then: .sheet(.inbox)))
        #expect(landing(AppLink(aircraftId: nil, target: .review), tablet: false) == Landing(section: .books, then: .review))
    }

    @Test func goOpensTheSectionAndItsRoute() {
        let tabs = TabModel()
        tabs.go(landing(AppLink(aircraftId: nil, target: .squawk, arg: "S"), tablet: false))
        #expect(tabs.selected == .maint)
        #expect(tabs.paths[.maint]?.count == 1)
        tabs.go(landing(AppLink(aircraftId: nil, target: .reminders), tablet: false))
        #expect(tabs.selected == .maint)
        #expect(tabs.sheet == .reminders)
        tabs.go(landing(AppLink(aircraftId: nil, target: .flight), tablet: false))
        #expect(tabs.addRequest == .flight)
        tabs.go(landing(AppLink(aircraftId: nil, target: .review), tablet: false))
        #expect(tabs.selected == .books && tabs.reviewPending)
    }
}

struct WidgetModelTests {
    @Test func listsLapsedFirstThenWhatComesDueInSixtyDays() throws {
        let v = WidgetText.view(tail: "N734DM", snapshot: try snapshot(), today: "2026-11-18", now: now)
        #expect(v.rows.map(\.lead) == ["Transponder check", "Annual", "ELT inspection", "Pitot-static check", "Oil change"])
        #expect(v.rows[0].rest == "lapsed May 31")
        #expect(v.rows[3].rest == "due Nov 30, IFR only")
        #expect(v.rows[3].value == "12 days")
        #expect(v.rows[4].rest == "in 9.7 h")
        #expect(v.asOf == nil)
        #expect(v.summary.hasPrefix("N734DM, next 60 days: Transponder check lapsed May 31. Annual"))
        #expect(v.line?.rings.count == 4)
    }

    @Test func dayCountsMoveAtMidnightAndOldRecordsSaySo() throws {
        let later = now.addingTimeInterval(3 * 86_400)
        let v = WidgetText.view(tail: "N734DM", snapshot: try snapshot(), today: "2026-11-21", now: later)
        #expect(v.rows.first { $0.lead == "Pitot-static check" }?.value == "9 days")
        #expect(v.asOf == "as of Nov 18")
    }

    @Test func unconfirmedEntriesNeverShow() throws {
        let v = WidgetText.view(tail: "N734DM", snapshot: try snapshot(adding: [unconfirmed]), today: "2026-11-18", now: now)
        #expect(!v.rows.contains { $0.lead == "Fire extinguisher" })
        #expect(!v.summary.contains("Fire extinguisher"))
    }

    @Test func noAircraftAsksToOpenTheApp() {
        let v = WidgetText.view(tail: nil, snapshot: nil, today: "2026-11-18", now: now)
        #expect(v.tail == nil && v.rows.isEmpty)
        #expect(v.summary == "Open MyTailLog to choose an aircraft.")
    }

    @Test func whatsDueSaysTheVerdict() throws {
        let a = whatsDue(tail: "N734DM", snapshot: try snapshot(adding: [unconfirmed]), today: "2026-11-18", now: now)
        #expect(a.dialog == "N734DM: 3 items are overdue.")
        #expect(a.rows.count == 3)
        #expect(whatsDue(tail: nil, snapshot: nil, today: "2026-11-18", now: now).dialog == WidgetText.noAircraft)
    }

    @Test func spokenTailsMatch() {
        #expect(spokenTail("November seven three four Delta Mike") == "N734DM")
        #expect(spokenTail("niner tree") == "93")
        #expect(matchTail("seven three four delta mike", ["N734DM", "N4321J"]) == ["N734DM"])
        #expect(matchTail("n4321j", ["N734DM", "N4321J"]) == ["N4321J"])
        #expect(matchTail("", ["N734DM"]).isEmpty)
    }
}

struct ReadingActivityTests {
    private func batch(expected: Int = 4, uploaded: Int = 4, queued: Int = 0, reading: Int = 0, waiting: Int = 0, read: Int = 0,
                       look: Int = 0) -> ReadingQueue.Batch {
        ReadingQueue.Batch(id: "b", logbook: nil, logbookId: "l", createdAt: "", expected: expected, uploaded: uploaded, queued: queued,
                           reading: reading, waitingAllowance: waiting, read: read, failed: 0, needsLook: look, waitingDecision: 0,
                           completedAt: nil)
    }

    @Test func walksThePhases() {
        #expect(readingState(held: 2, uploading: 0, logbook: "Airframe", offline: true, batches: [])?.text
                == "2 pages on this phone · They upload when you have signal.")
        let up = readingState(held: 2, uploading: 1, logbook: "Airframe vol. 1", offline: false, batches: [])
        #expect(up?.text == "Uploading 1 of 2 · Airframe vol. 1")
        #expect(up?.compact == "1/2")
        let reading = readingState(held: 0, uploading: 0, logbook: "", offline: false, batches: [batch(queued: 1, reading: 1, read: 2)])
        #expect(reading?.text == "Reading 4 pages · 2 of 4 read · a minute or two")
        #expect(reading?.phase == .reading)
        #expect(readingState(held: 0, uploading: 0, logbook: "", offline: false, batches: [batch(waiting: 4)])?.text
                == "4 pages wait for tomorrow's reading allowance.")
        let done = readingState(held: 0, uploading: 0, logbook: "", offline: false, batches: [batch(expected: 6, uploaded: 6, read: 6, look: 2)])
        #expect(done?.text == "6 pages are read. 2 need a look.")
        #expect(done?.phase == .read)
        #expect(readingState(held: 0, uploading: 0, logbook: "", offline: false, batches: []) == nil)
    }
}

struct NotificationTests {
    private func item(_ id: String, aircraft: String?, at: String, link: String? = nil) -> InboxItem {
        InboxItem(id: id, aircraftId: aircraft, title: id, body: nil, deepLink: link, actions: nil, createdAt: at, readAt: nil)
    }

    @Test func groupsByAircraftNewestFirstAccountLast() {
        let groups = inboxGroups([
            item("1", aircraft: "A", at: "2026-11-17T10:00:00Z"),
            item("2", aircraft: nil, at: "2026-11-18T10:00:00Z"),
            item("3", aircraft: "B", at: "2026-11-16T10:00:00Z"),
            item("4", aircraft: "A", at: "2026-11-18T09:00:00Z"),
            item("5", aircraft: nil, at: "2026-11-15T10:00:00Z", link: "mytaillog://aircraft/B/status"),
        ], tails: ["A": "N734QA", "B": "N4321J"])
        #expect(groups.map(\.title) == ["N734QA", "N4321J", "Account"])
        #expect(groups[0].items.map(\.id) == ["4", "1"])
        #expect(groups[1].items.map(\.id) == ["3", "5"])
    }

    @Test func saysWhenAndTheTestResult() {
        #expect(inboxWhen("2026-11-18T22:50:00Z", now: now) == "10 min ago")
        #expect(inboxWhen("2026-11-18T20:00:00Z", now: now) == "3 h ago")
        #expect(inboxWhen("2026-11-16T12:00:00Z", now: now, zone: TimeZone(identifier: "UTC")!) == "Nov 16")
        #expect(testResultText(devices: 1, email: true) == "Reached 1 device and your email.")
        #expect(testResultText(devices: 2, email: false) == "Reached 2 devices.")
        #expect(testResultText(devices: 0, email: false).hasPrefix("Nothing was reached"))
    }

    @Test func decodesTheInbox() throws {
        let json = #"{"items":[{"id":"n1","aircraftId":"A","kind":"lapse","title":"N734QA: Annual lapsed","body":"b","deepLink":"mytaillog://aircraft/A/status","actions":[{"id":"plan_visit","label":"Plan the visit"}],"payload":{},"createdAt":"2026-11-18T10:00:00Z","readAt":null}]}"#
        struct Body: Decodable { let items: [InboxItem] }
        let items = try JSONDecoder().decode(Body.self, from: Data(json.utf8)).items
        #expect(items.first?.actions?.first?.label == "Plan the visit")
        #expect(items.first?.read == false)
    }
}

struct SpotlightTests {
    private func entry(_ id: String, trust: String, text: String) throws -> EntryRow {
        let json = #"{"id":"\#(id)","page_id":"p1","logbook_id":"l1","entry_date":"2005-09-14","tach":2803,"description":"\#(text)","ad_refs":["2011-10-09"],"owner_confirmed":\#(trust != "ai_read"),"trust":"\#(trust)","updated_at":""}"#
        return try JSONDecoder().decode(EntryRow.self, from: Data(json.utf8))
    }

    @Test func indexesConfirmedEntriesAndTrackedItemsOnly() throws {
        let entries = [try entry("e1", trust: "confirmed", text: "Engine overhaul. Removed and replaced."),
                       try entry("e2", trust: "ai_read", text: "Read by AI only"),
                       try entry("e3", trust: "signed", text: "Annual inspection")]
        let book = try JSONDecoder().decode(LogbookRow.self, from: Data(#"{"id":"l1","type":"engine","title":null}"#.utf8))
        let records = Spotlight.records(aircraftId: "A", tail: "N734DM", entries: entries, logbooks: [book], pages: [],
                                        items: try snapshot(adding: [unconfirmed]).items)
        #expect(!records.contains { $0.title == "Read by AI only" })
        #expect(!records.contains { $0.title == "Fire extinguisher" })
        let first = try #require(records.first)
        #expect(first.title == "Engine overhaul")
        #expect(first.detail == "Engine · Sep 14, 2005 · tach 2,803.0")
        #expect(first.keywords.contains("2011-10-09"))
        #expect(first.url.absoluteString == "https://mytaillog.com/app/a/A/entry/e1")
        #expect(records.contains { $0.title == "Annual inspection" })
        #expect(records.filter { $0.id.hasPrefix("item-") }.count == 7)
    }
}

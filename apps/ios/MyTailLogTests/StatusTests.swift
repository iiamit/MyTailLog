import Foundation
import Testing
@testable import MyTailLog

private final class FixtureMarker {}

/// The real snapshot for demo aircraft N734DM (shared with Android: apps/android/app/src/test/resources).
private func fixture() throws -> StatusSnapshot {
    let url = try #require(Bundle(for: FixtureMarker.self).url(forResource: "status-n734dm", withExtension: "json"))
    return try JSONDecoder().decode(StatusSnapshot.self, from: Data(contentsOf: url))
}

private func item(_ snap: StatusSnapshot, _ label: String) -> DueItem {
    snap.items.first { $0.label == label }!
}

struct StatusDecodingTests {
    @Test func decodesTheServerSnapshot() throws {
        let snap = try fixture()
        #expect(snap.verdict.text == "3 items are overdue.")
        #expect(snap.verdict.emphasis == [[0, 19]])
        #expect(snap.verdict.lines.count == 1)
        #expect(snap.items.count == 7)
        #expect(snap.computedAt == "2026-11-18T22:54:40.168Z")
        #expect(snap.counts.overdue == 3)
        #expect(snap.lineAhead.rings.count == 4)
        #expect(snap.lineAhead.undated.count == 3)
        #expect(snap.meters["tach"]?.stitched == 4212.4)
        #expect(item(snap, "Oil change").hours?.projectedDate == nil)
        #expect(item(snap, "Annual").lastDone?.pageLabel == nil)
    }

    @Test func readsTheUserIdFromTheAccessToken() {
        let payload = Data(#"{"sub":"user-1","email":"a@b.c"}"#.utf8).base64EncodedString()
            .replacingOccurrences(of: "=", with: "").replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
        let session = Session(accessToken: "h.\(payload).s", refreshToken: "r", expiresAt: .now, email: nil)
        #expect(session.userId == "user-1")
        #expect(Session(accessToken: "garbage", refreshToken: "r", expiresAt: .now, email: nil).userId == nil)
    }

    @Test func rolesComeFromOwnershipSharesAndTheDemoFlag() {
        typealias Row = StatusAPI.AircraftRow
        let rows = [Row(id: "a", tail_number: "N1", owner_id: "me", is_demo: false),
                    Row(id: "b", tail_number: "N2", owner_id: "x", is_demo: nil),
                    Row(id: "c", tail_number: "N3", owner_id: "x", is_demo: false),
                    Row(id: "d", tail_number: "N734DM", owner_id: "me", is_demo: true)]
        let shares = [StatusAPI.ShareRow(aircraft_id: "b", role: "editor"), StatusAPI.ShareRow(aircraft_id: "c", role: "viewer")]
        let roles = StatusAPI.access(rows, shares: shares, userId: "me").map(\.role)
        #expect(roles == [.owner, .editor, .viewer, .viewer])
    }
}

struct StatusTextTests {
    @Test func groupsByHorizonWorstFirst() throws {
        let snap = try fixture()
        #expect(snap.grouped.map(\.group) == [.overdue, .near, .later])
        #expect(snap.grouped.map(\.items.count) == [3, 2, 2])
        #expect(snap.shownOnHome == 6)
        #expect(item(snap, "AD 2011-10-09").group(today: snap.today) == .later)
    }

    @Test func rowWordingMatchesAndroid() throws {
        let snap = try fixture()
        #expect(item(snap, "Annual").overdueText == "lapsed 110 days ago")
        #expect(item(snap, "Annual").rowValue == nil)
        #expect(item(snap, "Pitot-static check").rowValue == "12 days")
        #expect(item(snap, "Oil change").rowValue == "9.7 h")
        #expect(item(snap, "Oil change").limits(today: snap.today) == [LimitText(kind: .hours, text: "4,222.1 tach", about: nil, first: false)])
        #expect(item(snap, "Pitot-static check").qualifiers == ["IFR only"])
        #expect(item(snap, "Oil change").qualifiers == ["advisory"])
        #expect(item(snap, "Annual").spoken(today: snap.today) == "Annual, overdue, lapsed 110 days ago, due Jul 31, 2026, Airframe")
        #expect(item(snap, "Oil change").spoken(today: snap.today) == "Oil change, due soon, 9.7 h left, due 4,222.1 tach, advisory, Engine")
        #expect(item(snap, "Pitot-static check").spoken(today: snap.today)
            == "Pitot-static check, due soon, in 12 days, due Nov 30, 2026, IFR only, Avionics")
        #expect(statusWord("no_record") == "No record")
        #expect(bookName("prop") == "Propeller")
    }

    @Test func itemDetailWording() throws {
        let snap = try fixture()
        #expect(item(snap, "Annual").calendarDue == "end of July 2026 (Jul 31) · lapsed 110 days ago")
        #expect(item(snap, "Pitot-static check").calendarDue == "end of November 2026 (Nov 30) · 12 days")
        #expect(item(snap, "Oil change").hoursDue == "4,222.1 tach · 9.7 h left")
        #expect(item(snap, "Oil change").projection(rate: snap.rate, today: snap.today) == "9.7 h left, no recent flying to date it")
        #expect(item(snap, "Annual").lastDoneText == "Jul 20, 2025 at 4,168.3 tach")
        #expect(item(snap, "Transponder check").lastDoneText == "May 1, 2024")
        #expect(trustWords(trustLevel("confirmed", signer: nil), signer: nil) == "Confirmed by you")
        #expect(trustWords(trustLevel("confirmed", signer: "D. Alvarez"), signer: "D. Alvarez") == "Signed by D. Alvarez")
        #expect(trustLevel("ai_read", signer: "x") == .aiRead)
    }

    @Test func lineAheadSummaryTicksAndUndated() throws {
        let snap = try fixture()
        #expect(snap.lineSummary == "Line ahead, next 12 months. Transponder check, overdue. Annual, overdue. ELT inspection, overdue. "
            + "Pitot-static check, due soon, Nov 30, 2026.")
        #expect(snap.undatedLines.first == "Not on the line: Oil change, needs a date")
        #expect(LineGeometry.ticks(snap.lineAhead).map(\.text) == ["Today", "May", "Nov 2027"])
        #expect(LineGeometry.x(snap.lineAhead.from, snap.lineAhead) == LineGeometry.past)
        #expect(LineGeometry.x(snap.lineAhead.to, snap.lineAhead) == 1)
        #expect(LineGeometry.row("prop") == 2)
        #expect(LineGeometry.row("other") == nil)
    }

    @Test func freshnessOnlyAfterSixHours() throws {
        let snap = try fixture()
        let at = try #require(Day.instant(snap.computedAt))
        let utc = TimeZone(identifier: "UTC")!
        #expect(snap.freshness(now: at.addingTimeInterval(3600), zone: utc) == nil)
        #expect(snap.freshness(now: at.addingTimeInterval(7 * 3600), zone: utc) == "From records synced Nov 18, 10:54 PM.")
        #expect(snap.meterLine == "Tach 4,212.4, read Jul 10, 2026.")
    }
}

@MainActor
struct StatusModelTests {
    private func aircraft(_ id: String, _ role: AircraftRole, demo: Bool = false) -> AircraftAccess {
        AircraftAccess(id: id, tailNumber: id.uppercased(), isDemo: demo, role: role)
    }

    @Test func defaultsToTheUsersOwnAircraftThenTheDemoLast() {
        let demo = aircraft("demo", .viewer, demo: true)
        #expect(StatusModel.defaultAircraft([demo, aircraft("shared", .viewer), aircraft("mine", .owner)]) == "mine")
        #expect(StatusModel.defaultAircraft([demo, aircraft("shared", .editor)]) == "shared")
        #expect(StatusModel.defaultAircraft([demo]) == "demo")
        #expect(StatusModel.defaultAircraft([]) == nil)
    }

    @Test func loadsKeepsTheSnapshotOnFailureAndCachesPerAircraft() async throws {
        let snap = try fixture()
        let fail = Flag()
        let list = [aircraft(snap.aircraftId, .viewer, demo: true), aircraft("other", .owner)]
        let model = StatusModel(loadAircraft: { list }, loadStatus: { _ in
            if await fail.value { throw URLError(.notConnectedToInternet) }
            return snap
        })
        await model.refresh()
        #expect(model.currentId == "other") // own aircraft before the demo
        #expect(model.snapshot != nil && !model.loading && !model.failed)

        model.select(snap.aircraftId)
        await model.refresh()
        #expect(model.current?.role == .viewer)

        await fail.set(true)
        await model.refresh()
        #expect(model.failed)
        #expect(model.snapshot == snap) // stays on screen
        model.select("other")
        #expect(model.snapshot == snap) // from the cache at once
    }

    @Test func noAircraftIsTheEmptyState() async {
        let model = StatusModel(loadAircraft: { [] }, loadStatus: { _ in throw URLError(.badURL) })
        await model.refresh()
        #expect(model.noAircraft)
        #expect(model.line.tailText == "No aircraft yet")
    }
}

private actor Flag {
    var value = false
    func set(_ v: Bool) { value = v }
}

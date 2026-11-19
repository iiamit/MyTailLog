import CoreImage
import Foundation
import Testing
@testable import MyTailLog

// Phase 5's words and geometry: the plan horizon, the statement, visits, record room rows and the QR. Port of
// Android's PlanShareTextTest.kt.

private final class FixtureMarker {}

private func statusData() throws -> Data {
    let url = try #require(Bundle(for: FixtureMarker.self).url(forResource: "status-n734dm", withExtension: "json"))
    return try Data(contentsOf: url)
}

private func visitsJSON(_ keys: [String], week: String = "2026-11-23") -> String {
    let items = keys.map { #"{"key":"\#($0)","earlyBy":null,"status":"overdue","done":false}"# }.joined(separator: ",")
    return #"{"suggested":[{"id":null,"suggestionKey":"abcdef0123456789","status":"suggested","weekOf":"\#(week)","visitDate":null,"place":"KDEMO","providerIds":[],"items":[\#(items)],"clearsBeforeLapse":0,"atRisk":[]}],"planned":[]}"#
}

struct PlanTextTests {
    @Test func firstSixMonthsAreDrawnAtDoubleScale() {
        let s = PlanScale(today: "2026-11-18")
        #expect(s.x(s.today) == 0)
        #expect(s.x(s.end) == 1)
        // Six months of 24 get 2/(2+3) of the width.
        #expect(abs(s.x(addMonths(6, s.today)) - 0.4) < 0.01)
        // Every week round-trips through the scrubber.
        var d = Day.adding(1, to: s.today)
        while d <= s.end { #expect(s.date(s.x(d)) == d); d = Day.adding(7, to: d) }
        #expect(s.date(-1) == Day.adding(1, to: s.today))
        #expect(s.ticks.last?.text == "Nov 2028")
    }

    @Test func statementCountsWhatLapsesAndTheVisitsThatCoverIt() throws {
        let data = try statusData()
        let snap = try JSONDecoder().decode(StatusSnapshot.self, from: data)
        let p = try #require(planDate(status: data, visits: nil, date: "2027-03-01", hoursPerWeek: nil))
        let n = p.lapsedBy.count
        #expect(n > 1)
        let s = planStatement(p, today: snap.today)
        #expect(s.text.hasPrefix("By Mar 1, 2027"))
        #expect(s.text.hasSuffix("\(word(n)) items lapse unless they are done."))
        let ns = s.text as NSString
        #expect(ns.substring(with: NSRange(location: s.emphasis[0][0], length: s.emphasis[0][1] - s.emphasis[0][0])) == "Mar 1, 2027")

        let raw = visitsJSON(p.lapsedBy.map(\.key))
        let covered = try #require(planDate(status: data, visits: raw, date: "2027-03-01", hoursPerWeek: nil))
        #expect(planStatement(covered, today: snap.today).text.hasSuffix("unless the visit happens."))
        let visits = try JSONDecoder().decode(Visits.self, from: Data(raw.utf8)).all
        #expect(coveringVisit(covered.lapsedBy.first?.coveredByVisit, visits) == visits.first)
        #expect(planDate(status: Data("{}".utf8), visits: nil, date: "2027-03-01", hoursPerWeek: nil) == nil)
    }

    @Test func visitsInWords() throws {
        let snap = try JSONDecoder().decode(StatusSnapshot.self, from: statusData())
        let items = Array(snap.items.prefix(2))
        let v = VisitView(id: nil, suggestionKey: "s", status: "suggested", weekOf: "2026-12-07", visitDate: nil, providerIds: [],
                          items: [VisitItem(key: items[0].key, status: "overdue", done: false), VisitItem(key: items[1].key, status: "due_soon", done: false)])
        let lower = items[0].label.prefix(1).lowercased() + items[0].label.dropFirst()
        #expect(visitStatement(v, snap.items) == "One visit, two items: one before it comes due, and the \(lower) that has lapsed.")
        #expect(visitKey(v) == "s:s")
        #expect(mondayOf("2026-12-10") == "2026-12-07")
        #expect(mondayOf("2026-12-07") == "2026-12-07")
        #expect(mondayOf("2026-12-13") == "2026-12-07")
        let msg = visitMessage(tail: "N734DM", owner: nil, v, snap.items, url: "https://x/m/abc")
        #expect(msg.contains("- \(items[0].label)") && msg.hasSuffix("https://x/m/abc\n"))
        #expect(visitStatusWord("planned") == "Planned")
    }

    @Test func remindMeAWeekBeforeOrFriday() {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let wed = Day.date("2026-11-18") // a Wednesday
        #expect(remindAt(planDate: "2027-03-01", now: wed, calendar: cal).label == "Remind me Feb 22")
        let soon = remindAt(planDate: "2026-11-20", now: wed, calendar: cal)
        #expect(soon.label == "Remind me Friday")
        #expect(Day.string(soon.at) == "2026-11-20")
        // On a Friday, next week's.
        #expect(Day.string(remindAt(planDate: "2026-11-21", now: Day.date("2026-11-20"), calendar: cal).at) == "2026-11-27")
        #expect(jsNumber(4256) == "4256" && jsNumber(4256.5) == "4256.5")
    }
}

struct ShareTextTests {
    private let json = Data("""
    [{"id":"r1","label":"Pre-buy for J. Okafor","audience":"buyer","cover":"map","mapWindow":"whole_life",
      "includes":{"summary":true,"dossier":true,"logbookIds":["a","b"],"scans":true,"documentIds":["d"],"squawks":false,"reporters":false,"gapsNote":true},
      "url":"https://mytaillog.com/r/abc","createdAt":"2026-11-18T10:00:00Z","expiresAt":"2026-12-18T10:00:00Z","revokedAt":null,"active":true,"opens":3,"lastOpenedAt":"2026-11-17T09:00:00Z"}]
    """.utf8)
    private let utc = TimeZone(identifier: "UTC")!

    @Test func roomsReadTheServerRow() throws {
        let r = try #require(parseRooms(json).first)
        let now = try #require(Day.instant("2026-11-18T12:00:00Z"))
        #expect(roomLine(r, now: now, zone: utc) == "Expires Dec 18 · opened 3 times · last Nov 17")
        #expect(roomExpiry(r, now: now, zone: utc) == "Dec 18, 2026, in 30 days")
        #expect(roomHolds(r) == "2 logbooks with their scans, 1 document and the maintenance summary")
        #expect(shortUrl(r.url!) == "mytaillog.com/r/abc")
        var revoked = r
        revoked.revokedAt = "2026-11-18T11:00:00Z"
        revoked.active = false
        #expect(roomExpiry(revoked, now: now, zone: utc) == "revoked Nov 18")
        #expect(isRoomList(json) && !isRoomList(Data(#"{"error":"x"}"#.utf8)))
        #expect(parseRooms(Data(#"{"error":"x"}"#.utf8)).isEmpty)
        let open = try #require(parseOpens(Data(#"[{"openedAt":"2026-11-17T09:41:00Z","lastAt":"2026-11-17T09:50:00Z","sections":["status","logbooks"]}]"#.utf8)).first)
        #expect(openLine(open, zone: utc) == "Nov 17, 9:41 AM · Status, Logbooks")
    }

    @Test func aNewRoomSaysWhatItHolds() {
        let d = RoomDraft.of(.insurer, tail: "N734DM", logbooks: ["a"], documents: ["d"])
        let b = d.body
        #expect(b["audience"] as? String == "insurer")
        #expect(b["mapWindow"] as? String == "last_5_years")
        #expect(b["expiresInDays"] as? Int == 14)
        #expect((b["logbookIds"] as? [String])?.isEmpty == true)
        #expect(b["documentIds"] as? [String] == ["d"])
        #expect(d.label == "N734DM, for my insurer")
        var empty = d
        empty.summary = false
        empty.documentIds = []
        #expect(!empty.holdsSomething)
        #expect(RoomDraft.of(.people, tail: "N1", logbooks: [], documents: []).body["audience"] as? String == "other")
    }

    @Test func theQrEncodesExactlyTheShownLink() throws {
        let url = "https://mytaillog.com/r/Abc_DEF-0123456789abcdefghijklmnopqrstuvwxyzAB"
        let img = try #require(qrImage(url)?.cgImage)
        let ci = CIImage(cgImage: img).transformed(by: CGAffineTransform(scaleX: 8, y: 8))
        let padded = ci.composited(over: CIImage(color: .white).cropped(to: ci.extent.insetBy(dx: -32, dy: -32)))
        let detector = try #require(CIDetector(ofType: CIDetectorTypeQRCode, context: nil, options: [CIDetectorAccuracy: CIDetectorAccuracyHigh]))
        let found = detector.features(in: padded).compactMap { ($0 as? CIQRCodeFeature)?.messageString }
        #expect(found == [url])
    }
}

import Foundation
import Testing
@testable import MyTailLog

/// Wording and arithmetic of Maintenance, Aircraft, Documents and the flight's "what it moved" (06, 12): the same cases
/// as Android's MaintTextTest so both phones say the same thing.
struct MaintTextTests {
    let today = "2026-11-19"

    private func item(_ key: String, _ status: String, hours: DueItem.Hours? = nil, label: String? = nil) -> DueItem {
        DueItem(key: key, source: "maintenance", label: label ?? key, rule: "", line: nil, advisory: false, ifrOnly: false, status: status,
                calendar: nil, hours: hours, first: nil, lastDone: nil, waitingEntryId: nil)
    }

    @Test func adSentencesSayWhetherItRecursItsLastComplianceOrWhyNot() {
        #expect(adSentence(status: "complied", recurring: true, intervalHours: 100, intervalMonths: nil, compliedDate: "2026-07-14", compliedHours: 4168.3,
                           nextDate: nil, nextHours: 4268.3, reason: nil, tach: 4212.4)
                == "Recurring, every 100 hours. Complied Jul 14, 2026 at 4168.3; next at tach 4268.3, 55.9 h.")
        #expect(adSentence(status: "complied", recurring: false, intervalHours: nil, intervalMonths: nil, compliedDate: "2019-03-02", compliedHours: nil,
                           nextDate: nil, nextHours: nil, reason: nil, tach: 4212.4) == "One-time. Complied Mar 2, 2019.")
        #expect(adSentence(status: "not_applicable", recurring: false, intervalHours: nil, intervalMonths: nil, compliedDate: nil, compliedHours: nil,
                           nextDate: nil, nextHours: nil, reason: "a different pump part number is installed", tach: nil)
                == "Reason: a different pump part number is installed.")
        #expect(adSentence(status: "open", recurring: false, intervalHours: nil, intervalMonths: nil, compliedDate: nil, compliedHours: nil,
                           nextDate: nil, nextHours: nil, reason: nil, tach: nil) == "One-time. No compliance recorded yet.")
    }

    @Test func adStatusSettlesOneTimeAndNotApplicableAndTakesTheRestFromTheDueList() {
        #expect(adStatus("not_applicable", recurring: false, due: nil).1 == "Not applicable")
        #expect(adStatus("complied", recurring: false, due: nil).1 == "Complied")
        let soon = adStatus("complied", recurring: true, due: item("ad:1", "due_soon"))
        #expect(soon.0 == .dueSoon && soon.1 == "Due soon")
        #expect(["Not applicable", "Complied", "Current", "Overdue", "Due soon"].sorted { adRank($0) < adRank($1) }
                == ["Overdue", "Due soon", "Current", "Complied", "Not applicable"])
    }

    @Test func itemRulesAndTheEditorPreviewShowBothLimitsAndWhichComesFirst() {
        #expect(itemRule(regulatory: true, months: 12, hours: nil, calendarMonth: true) == "Required · every 12 calendar months")
        #expect(itemRule(regulatory: false, months: nil, hours: 50, calendarMonth: false) == "Advisory · every 50 hours")
        // The annual runs to the end of the month.
        #expect(nextDue(kind: "annual", lastDate: "2026-07-14", lastHours: nil, months: 12, hours: nil).date == "2027-07-31")
        #expect(nextDue(kind: "oil_change", lastDate: "2026-07-14", lastHours: nil, months: 4, hours: nil).date == "2026-11-14")
        #expect(nextDuePreview(kind: "annual", lastDate: "2026-07-14", lastHours: 4168.3, months: 12, hours: 100, meter: "tach", now: 4212.4,
                               hoursPerDay: 0.6, today: today)
                == "Next due works out to Jul 31, 2027, or tach 4268.3, the hours first, about Feb 20, 2027.")
        #expect(nextDuePreview(kind: "oil_change", lastDate: nil, lastHours: 4212.4, months: nil, hours: 50, meter: "tach", now: 4212.4,
                               hoursPerDay: nil, today: today) == "Next due works out to tach 4262.4.")
        #expect(nextDuePreview(kind: "other", lastDate: nil, lastHours: nil, months: 12, hours: nil, meter: "tach", now: nil, hoursPerDay: nil, today: today) == nil)
    }

    @Test func squawkWordsNeverRestOnColourAlone() {
        #expect(squawkMeta(severity: "medium", reportedAt: "2026-11-09T10:00:00Z", reporter: "Dana Morgan", photos: 1, today: today)
                == "Watch · 10 days ago · Dana · 1 photo")
        #expect(squawkReported(reportedAt: "2026-10-21T10:00:00Z", reporter: "Dana Morgan", photos: 2, today: today) == "Reported Oct 21 by Dana · 2 photos")
        #expect(severityWord("high") == "Ground")
        #expect(severityMark("high") == .overdue) // a slip, the word beside it
        #expect(severityWord("anything else") == "Low")
    }

    @Test func oilBurnAndWeightAndBalance() throws {
        #expect(abs(try #require(hoursPerQuart([(4100, 1), (4109.2, 1)])) - 9.2) < 1e-9)
        #expect(burnIntervals([(4100, 1), (4109, 1), (4118, 2)]) == [9, 4.5])
        #expect(hoursPerQuart([(4100, 1)]) == nil)
        #expect(abs(try #require(moment(1447.80, 39.61)) - 57_347.36) < 0.01)
        let rev = Rec(row: ["id": .string("w"), "revision_date": .string("2019-05-01")])
        let pump = Rec(row: ["id": .string("c"), "name": .string("Rapco vacuum pump"), "install_date": .string("2021-03-02"), "is_installed": .bool(true)])
        #expect(staleSince(rev, [pump]) == "Rapco vacuum pump (2021)")
    }

    @Test func aFlightListsEveryHoursItemItMovedWithBeforeAndAfter() {
        let oil = item("mx:oil", "current", hours: DueItem.Hours(meter: "tach", dueAt: 4221.9, remaining: 9.5, projectedDate: nil, projectionBasis: "rate"),
                       label: "Oil and filter")
        let moved = movedBy([oil, item("mx:annual", "current", label: "Annual inspection")], meter: "tach", before: 4212.4, after: 4214.8)
        #expect(moved.count == 1)
        #expect(abs(moved[0].before - 9.5) < 1e-9 && abs(moved[0].after - 7.1) < 1e-9 && moved[0].label == "Oil and filter")
        #expect(flightLabel(last: 4212.4, now: 4214.8) == "Flight, tach 4212.4 to 4214.8")
    }

    @Test func readsTheFederalRegisterAndTheTimeChecks() throws {
        let fr = #"{"count":1,"results":[{"title":"Airworthiness Directives; Lycoming Engines","effective_on":"2026-06-01","html_url":"https://fr/x","abstract":"We are adopting…","docket_ids":["FAA-2025-1","AD 2026-11-04"]}]}"#
        let ad = try #require(RecordsAPI.parseFoundAds(Data(fr.utf8)).first)
        #expect(ad.adNumber == "2026-11-04" && ad.effectiveOn == "2026-06-01")
        let tc = #"[{"component":"prop","entryId":"e1","pageRef":{"pageId":"p","label":"Propeller p. 12"},"written":936.5,"calculated":963.5,"result":"apart","difference":27.0,"digitSwap":true,"dismissed":false}]"#
        let check = try #require(RecordsAPI.parseTimeChecks(Data(tc.utf8)).first)
        #expect(check.pageLabel == "Propeller p. 12" && check.apart && check.digitSwap)
    }

    @Test func documentsCarryAboardAndReadings() {
        #expect(carryAboard == ["airworthiness_cert", "registration", "poh_afm", "weight_balance"])
        #expect(docMeta(mime: "application/pdf", createdAt: "2026-01-05T10:00:00Z") == "PDF · added Jan 2026")
        #expect(readingSource("myflightbook") == "from MyFlightBook")
        #expect(editableReading("tach_photo") && !editableReading("myflightbook"))
    }
}

/// The outbox laid over the mirror (06 §1.4): what a waiting change shows before the server has it.
struct OverlayTests {
    private func waiting(_ id: String, _ type: String, _ table: String, _ row: String, _ payload: [String: AnyJSON], status: String = "pending",
                         error: String? = nil) -> OutboxItem {
        OutboxItem(id: id, aircraftId: "a", type: type, label: type, createdAt: 0, attempts: 0, nextTryAt: nil, status: status, error: error,
                   targetTable: table, targetId: row, dependsOn: nil, payload: payload)
    }

    @Test func createsAppearUpdatesSetTheirColumnsAndDeletesDisappear() {
        let server: [Row] = [["id": .string("s1"), "description": .string("Nav light"), "severity": .string("low"), "status": .string("open")],
                             ["id": .string("s2"), "description": .string("Brake"), "severity": .string("medium"), "status": .string("open")]]
        let out = overlay("squawk", rows: server, waiting: [
            waiting("m1", "squawk.create", "squawk", "s3", ["description": .string("Oil leak"), "severity": .string("high"), "reportedAt": .string("2026-11-19")]),
            waiting("m2", "squawk.resolve", "squawk", "s1", ["resolvedAt": .string("2026-11-19")]),
            waiting("m3", "squawk.delete", "squawk", "s2", [:]),
            waiting("m4", "oil.create", "oil_addition", "o1", ["quarts": .number(1)]),
        ])
        #expect(out.map(\.id) == ["s1", "s3"])
        #expect(out[0].s("status") == "resolved" && out[0].pending && out[0].s("description") == "Nav light")
        #expect(out[1].s("severity") == "high" && out[1].s("status") == "open" && out[1].pending)
    }

    @Test func aRefusedChangeIsShownOnItsRowAndNotApplied() {
        let out = overlay("squawk", rows: [["id": .string("s1"), "status": .string("open")]], waiting: [
            waiting("m1", "squawk.resolve", "squawk", "s1", [:], status: "refused", error: "You don't have edit access to N734QA."),
        ])
        #expect(out[0].s("status") == "open" && out[0].refused == "You don't have edit access to N734QA." && !out[0].pending)
    }

    @Test func aChangeWithNothingToShowMakesNoRow() {
        #expect(overlay("maintenance_item", rows: [], waiting: [waiting("m1", "mx.seedStandard", "maintenance_item", "x", [:])]).isEmpty)
    }

    @Test func rowsReadTheirValuesAsTheServerSentThem() {
        let r = Rec(row: ["year": .number(1978), "tach": .string("4212.4"), "recurring": .bool(true), "blank": .string("")])
        #expect(r.s("year") == "1978" && r.d("tach") == 4212.4 && r.b("recurring") && r.s("blank") == nil)
        #expect(payload(["a": 1, "b": nil])["b"] is NSNull)
    }

    @Test func aDocumentsFileJobDecodesWithoutPageFields() throws {
        let json = #"{"type":"insurance","title":"Policy","fileName":"policy.pdf","mimeType":"application/pdf","trackExpiry":true}"#
        let meta = try JSONDecoder().decode(FileMeta.self, from: Data(json.utf8))
        #expect(meta.type == "insurance" && meta.trackExpiry == true && meta.pageId == "" && !meta.isHandwritten)
    }
}

/// Records written on the phone with the real KMP core, offline: they show at once and a local-only delete leaves nothing.
@MainActor
@Suite(.serialized)
struct RecordStoreTests {
    let aircraft = "d5c25951-f64a-5331-9b60-9ee02b456a25"

    @Test func aSquawkWithAPhotoShowsOfflineAndDeletingItBeforeUploadLeavesNothing() throws {
        let root = FileManager.default.temporaryDirectory.appending(path: "records-\(UUID().uuidString)", directoryHint: .isDirectory)
        defer { UserDefaults.standard.removeObject(forKey: "MTLForceOffline"); try? FileManager.default.removeItem(at: root) }
        let s = OfflineStore(userId: "u1", apiURL: URL(string: "https://example.invalid")!, root: root)
        s.forcedOffline = true
        let access = AircraftAccess(id: aircraft, tailNumber: "N734QA", isDemo: false, role: .owner)
        let recs = Recs(offline: s, api: RecordsAPI(apiURL: s.apiURL, token: { "" }), aircraft: access, status: nil)

        let id = newId()
        #expect(recs.change("squawk.create", "squawk", id, "Squawk: Oil leak", ["id": id, "description": "Oil leak", "severity": "high",
                                                                                 "reportedAt": "2026-11-19T10:00:00Z"]) == id)
        addSquawkPhoto(recs, squawkId: id, jpeg: Data([0xFF, 0xD8, 0xFF, 0xD9]))
        #expect(recs.records("squawk").map(\.id) == [id])
        #expect(recs.records("squawk").first?.pending == true)
        #expect(recs.records("squawk_photo").count == 1)
        #expect(s.recordFiles.count == 1)
        // The photo's row waits on its file; the file on its squawk.
        #expect(s.items.first { $0.type == "squawkPhoto.create" }?.dependsOn == s.recordFiles.first?.id)

        recs.delete("squawk.delete", "squawk", id, "Delete squawk", ["squawkId": id])
        #expect(recs.records("squawk").isEmpty)
        #expect(s.items.isEmpty)
        #expect(s.recordFiles.isEmpty)
        s.close()
    }

    @Test func anEditOfAServerRowCarriesItsBase() throws {
        let root = FileManager.default.temporaryDirectory.appending(path: "records-\(UUID().uuidString)", directoryHint: .isDirectory)
        defer { UserDefaults.standard.removeObject(forKey: "MTLForceOffline"); try? FileManager.default.removeItem(at: root) }
        let s = OfflineStore(userId: "u1", apiURL: URL(string: "https://example.invalid")!, root: root)
        s.forcedOffline = true
        #expect(s.needsBase("squawk.resolve", ["squawkId": "x"]))
        #expect(!s.needsBase("squawk.create", ["id": "x"]))
        #expect(s.needsBase("mx.upsert", ["id": "x", "item": [:]]) && !s.needsBase("mx.upsert", ["item": [:]]))
        s.close()
    }
}

import Foundation
import Testing
@testable import MyTailLog

private final class Marker {}

private func fixture<T: Decodable>(_ name: String, as: T.Type = T.self) throws -> T {
    let url = try #require(Bundle(for: Marker.self).url(forResource: name, withExtension: "json"))
    return try JSONDecoder().decode(T.self, from: Data(contentsOf: url))
}

/// packages/shared/fixtures, read in place (the simulator sees the host's files).
private func shared(_ name: String) throws -> [[String: Any]] {
    let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        .appending(path: "../../../packages/shared/fixtures/\(name).json").standardized
    let root = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
    return try #require(root?["cases"] as? [[String: Any]])
}

private struct Review: Decodable {
    let logbooks: [LogbookRow]
    let pages: [PageRow]
    let entries: [EntryRow]
}

/// Path of the first difference, or nil. Expected keys only; a missing actual key counts as null; numbers within `tol`.
private func diff(_ expected: Any, _ actual: Any?, _ path: String = "", tol: Double) -> String? {
    switch expected {
    case let e as [String: Any]:
        guard let a = actual as? [String: Any] else { return path }
        for (k, v) in e.sorted(by: { $0.key < $1.key }) { if let d = diff(v, a[k] ?? NSNull(), "\(path).\(k)", tol: tol) { return d } }
        return nil
    case let e as [Any]:
        guard let a = actual as? [Any], a.count == e.count else { return "\(path) (length \(e.count) != \((actual as? [Any])?.count ?? -1))" }
        for i in e.indices { if let d = diff(e[i], a[i], "\(path)[\(i)]", tol: tol) { return d } }
        return nil
    case is NSNull:
        return actual == nil || actual is NSNull ? nil : "\(path) (null != \(actual!))"
    case let e as String:
        return (actual as? String) == e ? nil : "\(path) (\(e) != \(String(describing: actual)))"
    case let e as NSNumber:
        guard let a = actual as? NSNumber else { return "\(path) (\(e) != null)" }
        if CFGetTypeID(e) == CFBooleanGetTypeID() { return e.boolValue == a.boolValue ? nil : path }
        return abs(e.doubleValue - a.doubleValue) <= tol + 1e-9 ? nil : "\(path) (\(e) != \(a))"
    default:
        return path
    }
}

/// 13 §5 phase 2: the layout the app draws (the KMP core's, through the bridge) matches map-layout.ts within 0.5 units.
struct MapLayoutFixtureTests {
    @Test(arguments: ["map-layout", "map-layout-stress"])
    func everyLayoutFixtureMatchesWithinHalfAUnit(file: String) throws {
        var total = 0
        var failures: [String] = []
        for c in try shared(file) {
            let input = try #require(c["input"] as? [String: Any])
            let model = try JSONDecoder().decode(MapData.self, from: JSONSerialization.data(withJSONObject: input["model"]!))
            let options: [Any] = (input["options"] as? [Any]) ?? [input["options"]!]
            let expected: [Any] = (c["expected"] as? [Any]) ?? [c["expected"]!]
            for (o, ex) in zip(options, expected) {
                let opts = try JSONDecoder().decode(MapLayoutOptions.self, from: JSONSerialization.data(withJSONObject: o))
                let actual = try JSONSerialization.jsonObject(with: JSONEncoder().encode(model.layout(opts)))
                if let d = diff(ex, actual, tol: 0.5) { failures.append("\(c["name"] ?? ""): \(d)") }
                total += 1
            }
        }
        #expect(failures.isEmpty, "\(failures.count) of \(total) differ:\n\(failures.joined(separator: "\n"))")
        #expect(total >= (file == "map-layout" ? 27 : 1))
    }
}

struct MapScreenTests {
    @Test func decodesTheServerMap() throws {
        let map: MapData = try fixture("map-n734dm")
        #expect(map.lines.map(\.logbook) == ["airframe", "engine", "prop", "avionics"])
        #expect(map.stops.count == 17)
        #expect(map.interchanges.count == 3)
        #expect(map.gaps.count == 4)
        #expect(map.eras.count == 1)
        #expect(map.range.scaleBreak == "2025-11-19")
    }

    /// M-BOOKS-01 acceptance: every stop is reachable with VoiceOver without touching the canvas; newest at the top.
    @Test(arguments: [375.0, 430.0])
    func everyStopIsAnAccessibilityElementNewestFirst(width: Double) throws {
        let map: MapData = try fixture("map-n734dm")
        let layout = map.layout(MapLayoutOptions(size: "phone", renderedWidth: width))
        let elements = mapElements(layout, map) { _ in nil }
        let reachable = Set(layout.stops.flatMap(\.ids)).union(map.interchanges.flatMap(\.stopIds))
        #expect(reachable == Set(map.stops.map(\.id)))
        #expect(elements.filter { $0.kind == .visit }.count == 3)
        #expect(elements.filter { $0.kind == .gap }.count == 4)
        #expect(elements.map(\.y) == elements.map(\.y).sorted())
        // Read-by-AI stops say so when focused.
        let aiStop = try #require(map.stops.first { $0.trust == "ai_read" && !map.interchanges.flatMap(\.stopIds).contains($0.id) })
        let drawn = try #require(layout.stops.first { $0.ids.contains(aiStop.id) })
        let named = try #require(elements.first { $0.kind == .stop && $0.key == drawn.id })
        #expect(named.name.contains("read by AI"))
    }

    /// 10 §14: no label overlaps another label at phone widths (13pt labels, the layout's own boxes).
    @Test(arguments: [375.0, 430.0])
    func labelsNeverOverlap(width: Double) throws {
        let map: MapData = try fixture("map-n734dm")
        let layout = map.layout(MapLayoutOptions(size: "phone", renderedWidth: width))
        let fs = layout.fontSize
        let boxes = layout.labels.map { CGRect(x: $0.x, y: $0.y - 0.8 * fs, width: Double($0.text.count) * fs * 0.56, height: fs) }
        for i in boxes.indices { for j in boxes.indices where j > i { #expect(!boxes[i].intersects(boxes[j])) } }
        #expect(!layout.labels.isEmpty)
    }

    @Test func oneBookKeepsOnlyThatLine() throws {
        let map: MapData = try fixture("map-n734dm")
        let engine = try #require(map.lines.first { $0.logbook == "engine" })
        let one = map.only(lineId: engine.lineId)
        #expect(one.lines.count == 1)
        #expect(one.stops.allSatisfy { $0.lineId == engine.lineId })
        #expect(one.interchanges.isEmpty)
        let layout = one.layout(MapLayoutOptions(size: "phone", renderedWidth: 375, allEras: true))
        #expect(layout.lanes.count == 1)
        #expect(!layout.eras.isEmpty)
    }

    @Test func aTapReachesEverythingWithinHalfATarget() {
        let a = MapElement(kind: .stop, key: "a", x: 0, y: 0, w: 10, h: 10, name: "A")
        let b = MapElement(kind: .ring, key: "b", x: 0, y: 30, w: 10, h: 10, name: "B")
        let c = MapElement(kind: .stop, key: "c", x: 200, y: 0, w: 10, h: 10, name: "C")
        #expect(hits([a, b, c], at: (5, 20), reach: 21).map(\.key) == ["a", "b"])
        #expect(hits([a, b, c], at: (5, 5), reach: 21).first?.key == "a")
        #expect(hits([a, b, c], at: (100, 100), reach: 21).isEmpty)
    }

    @Test func gapEvidenceDecodesAndTitles() throws {
        let ev: GapEvidence = try fixture("gap-evidence-n734dm")
        #expect(ev.otherBooks.count == 3)
        #expect(ev.neighbourPages?.before?.label == "Airframe p. 1")
        let map: MapData = try fixture("map-n734dm")
        #expect(gapTitle(map.gaps[0]) == "No airframe pages, 1978 to 1998")
        #expect(gapTitle(map.gaps[3]) == "No propeller pages exist for 2010 to 2025 (you marked this)")
    }

    @Test func gapAnswerSendsSetStatusWithItsBase() throws {
        let m = gapMutation(aircraftId: "ac", gapId: "g1", answer: .noPagesExist, note: "  Lost in a move. ", base: "2026-01-01T00:00:00Z")
        #expect(m.type == "gap.setStatus")
        #expect(m.base == "2026-01-01T00:00:00Z")
        #expect(m.payload["status"] == .value(.string("no_pages_exist")))
        #expect(m.payload["note"] == .value(.string("Lost in a move.")))
        #expect(gapMutation(aircraftId: "ac", gapId: "g1", answer: .askedPreviousOwner, note: " ", base: nil).payload["note"] == .value(.null))
    }
}

struct ReviewTests {
    private func review() throws -> Review { try fixture("review-n734dm") }

    @Test func theQueueIsReadPagesWithUnconfirmedEntriesInLaneOrder() throws {
        let r = try review()
        let queue = reviewQueue(pages: r.pages, entries: r.entries, logbooks: r.logbooks)
        #expect(queue.map { pageLabel($0, logbooks: r.logbooks) } == ["Airframe p. 6", "Engine p. 3"])
        #expect(r.pages.filter { beingRead.contains($0.extraction_status) }.count == 2)
    }

    /// M-REVIEW-01 acceptance: the least certain field is always first.
    @Test func leastCertainFieldFirst() throws {
        let r = try review()
        let page = try #require(r.pages.first { $0.id.hasPrefix("c598b3a6") })
        let es = entries(on: page, r.entries)
        #expect(es.count == 2)
        #expect(es[0].reviewFields.first?.label == "Date")
        #expect(es[0].reviewFields.first?.doubtful == true)
        #expect(es[1].reviewFields.first?.label == "Tach")
        #expect(es[0].reviewFields.first?.box != nil)
        #expect(es[0].reviewFields.filter(\.doubtful).count == 1)
    }

    /// M-REVIEW-02: every doubtful field needs an outcome before the page confirms; a clean page needs none.
    @Test func confirmWaitsForEveryDoubt() throws {
        let r = try review()
        let doubtful = entries(on: try #require(r.pages.first { $0.id.hasPrefix("c598b3a6") }), r.entries)
        #expect(!canConfirm(doubtful, outcomes: [:]))
        #expect(!canConfirm(doubtful, outcomes: [doubtful[0].id: ["entry_date": .looksRight]]))
        #expect(canConfirm(doubtful, outcomes: [doubtful[0].id: ["entry_date": .looksRight], doubtful[1].id: ["tach": .notOnPage]]))
        let clean = entries(on: try #require(r.pages.first { $0.id.hasPrefix("1b53b906") }), r.entries)
        #expect(canConfirm(clean, outcomes: [:]))
    }

    @Test func confirmingSendsUpdatesForEditsAndConfirmsForTheRest() throws {
        let r = try review()
        let page = try #require(r.pages.first { $0.id.hasPrefix("c598b3a6") })
        let es = entries(on: page, r.entries)
        let ms = confirmMutations(aircraftId: "ac", page: page, entries: es, outcomes: [
            es[0].id: ["entry_date": .looksRight],
            es[1].id: ["tach": .edited("4219.9"), "signature_name": .notOnPage],
        ])
        #expect(ms.map(\.type) == ["entry.confirm", "entry.update", "page.review"])
        #expect(ms[0].base == es[0].updated_at)
        #expect(ms[0].payload["confirmed"] == .value(.bool(true)))
        #expect(ms[1].payload["fields"] == .object(["tach": .number(4219.9), "signature_name": .null]))
        #expect(ms[2].payload["status"] == .value(.string("confirmed")))
        #expect(ms[2].base == page.updated_at)
    }

    /// M-REVIEW-03 acceptance: Undo reverts the confirmation and all its entries, edits first.
    @Test func undoPutsBackEditsThenUnconfirms() throws {
        let r = try review()
        let page = try #require(r.pages.first { $0.id.hasPrefix("c598b3a6") })
        let es = entries(on: page, r.entries)
        let outcomes: [String: [String: FieldOutcome]] = [es[1].id: ["tach": .edited("4219.9")]]
        let stamps = [es[0].id: "t0", es[1].id: "t1", page.id: "tp"]
        let edits = undoEditsMutations(aircraftId: "ac", before: es, stamps: stamps, outcomes: outcomes)
        #expect(edits.count == 1)
        #expect(edits[0].payload["fields"] == .object(["tach": .number(4219.6)]))
        #expect(edits[0].base == "t1")
        let un = undoConfirmMutations(aircraftId: "ac", page: page, before: es, stamps: stamps)
        #expect(un.map(\.type) == ["entry.confirm", "entry.confirm", "page.review"])
        #expect(un[0].payload["confirmed"] == .value(.bool(false)))
        #expect(un[2].payload["status"] == .value(.string("unreviewed")))
        #expect(un[2].base == "tp")
    }

    @Test func editsThatCantBeReadAreRefused() {
        let tach = ReviewField(key: "tach", label: "Tach", kind: .number, value: "1.0", confidence: 0.5, box: nil)
        let date = ReviewField(key: "entry_date", label: "Date", kind: .date, value: nil, confidence: 0.5, box: nil)
        #expect(columnValue(tach, .edited("12a")) == nil)
        #expect(columnValue(tach, .edited(" 1874.6 ")) == .number(1874.6))
        #expect(columnValue(date, .edited("1992-4-18")) == nil)
        #expect(columnValue(date, .edited("1992-04-18")) == .string("1992-04-18"))
        #expect(columnValue(tach, .looksRight) == nil)
        #expect(columnValue(tach, .notOnPage) == .null)
    }

    /// Viewers get the app's words, not the server's (06 §1.5).
    @Test func refusalsReadInTheAppsVoice() {
        #expect(pushProblem([PushResult(id: "1", status: "ok", error: nil, row: nil)]) == nil)
        #expect(pushProblem([PushResult(id: "1", status: "error", error: "You don't have edit access to this aircraft.", row: nil)])
            == "You can view this aircraft. The owner can make changes.")
        #expect(pushProblem([PushResult(id: "1", status: "conflict", error: nil, row: nil)])?.hasPrefix("Someone changed") == true)
    }

    @Test func mutationsEncodeAsThePushEndpointExpects() throws {
        let m = Mutation(id: "m1", type: "entry.update", aircraftId: "ac",
                         payload: ["entryId": .value(.string("e1")), "fields": .object(["tach": .number(1.5)])], base: "b")
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(m)) as? [String: Any]
        #expect(json?["type"] as? String == "entry.update")
        #expect((json?["payload"] as? [String: Any])?["entryId"] as? String == "e1")
        #expect(((json?["payload"] as? [String: Any])?["fields"] as? [String: Any])?["tach"] as? Double == 1.5)
        #expect(json?["base"] as? String == "b")
    }
}

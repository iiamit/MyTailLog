import Foundation
import Testing
@testable import MyTailLog

/// The offline store over the real KMP core (mirror.db + outbox.db in a temp folder). The transport is switched off,
/// so nothing reaches the network: these are the airplane-mode rules of 07 B-OFFLINE and the kill-during-upload rule.
@MainActor
@Suite(.serialized)
struct OfflineStoreTests {
    let aircraft = "d5c25951-f64a-5331-9b60-9ee02b456a25"
    let logbook = "11111111-2222-4333-8444-555555555555"

    private func store(_ root: URL) -> OfflineStore {
        let s = OfflineStore(userId: "u1", apiURL: URL(string: "https://example.invalid")!, root: root)
        s.forcedOffline = true
        return s
    }

    private func tempRoot() -> URL {
        FileManager.default.temporaryDirectory.appending(path: "offline-\(UUID().uuidString)", directoryHint: .isDirectory)
    }

    @Test func offlineWritesQueueAndSurviveARelaunch() async throws {
        let root = tempRoot()
        defer { UserDefaults.standard.removeObject(forKey: "MTLForceOffline"); try? FileManager.default.removeItem(at: root) }
        var s: OfflineStore? = store(root)
        try s!.enqueue(type: "reading.create", aircraftId: aircraft, payload: ["id": "r1", "date": "2026-11-18", "tach": 4214.8],
                       label: "Flight, tach 4212.4 to 4214.8")
        await s!.sync() // offline: nothing sent, nothing lost
        #expect(s!.waiting.map(\.label) == ["Flight, tach 4212.4 to 4214.8"])
        #expect(SyncBars.text(s!) == "1 change on this phone. They upload when you have signal.")
        s!.close()
        s = nil
        let again = store(root)
        #expect(again.waiting.count == 1)
        #expect(again.waiting.first?.payload["tach"] == .number(4214.8))
        again.close()
    }

    @Test func inboxOriginalQueueRetainsStableIdentityAcrossRestart() throws {
        let root = tempRoot()
        defer { UserDefaults.standard.removeObject(forKey: "MTLForceOffline"); try? FileManager.default.removeItem(at: root) }
        let first = store(root)
        let original = Data("original PDF bytes".utf8)
        let id = try first.addRecordFile(kind: OfflineStore.inboxDocument, aircraftId: aircraft,
            url: first.dir.appending(path: "Outbox/inbox/original.pdf"), bytes: original,
            meta: FileMeta(fileName: "Annual.pdf", mimeType: "application/pdf"))
        #expect(first.heldDocuments.count == 1)
        #expect(first.recordFiles.count == 1)
        first.close()
        let restored = store(root)
        let job = try #require(restored.recordFiles.first)
        #expect(job.id == id)
        #expect(job.meta.fileName == "Annual.pdf")
        #expect(try Data(contentsOf: restored.fileURL(job)) == original)
        restored.close()
    }

    @Test func onlineOnlyTypesAreNeverQueued() throws {
        let root = tempRoot()
        defer { UserDefaults.standard.removeObject(forKey: "MTLForceOffline"); try? FileManager.default.removeItem(at: root) }
        let s = store(root)
        #expect(throws: (any Error).self) {
            try s.enqueue(type: "page.extract", aircraftId: aircraft, payload: ["pageId": "p"], label: "Read")
        }
        #expect(s.items.isEmpty)
        s.close()
    }

    @Test func aHeldPageRegistersOnlyAfterUploadAndItsBatch() throws {
        let root = tempRoot()
        defer { UserDefaults.standard.removeObject(forKey: "MTLForceOffline"); try? FileManager.default.removeItem(at: root) }
        let s = store(root)
        let session = ScanSession(store: s, aircraftId: aircraft, logbook: LogbookRow(id: logbook, type: "airframe", title: nil),
                                  handwritten: true, placement: { y in LandsIn.line(year: y, logbook: "Airframe", gaps: [], pages: []) })
        let page = try #require(PageProcessor.process(Samples.page()))
        #expect(session.hold(page))
        #expect(session.pages.count == 1)
        #expect(session.landsIn == "Lands in 1984")
        // Both files are on disk before the next capture, and nothing is queued to the server yet.
        #expect(s.files.count == 2)
        #expect(s.files.allSatisfy { FileManager.default.fileExists(atPath: s.fileURL($0).path()) })
        #expect(s.items.isEmpty)
        #expect(s.heldPages.count == 1)

        // The page uploads before Done: it waits for its batch.
        let job = try #require(s.files.first { $0.kind == "page" })
        s.pageUploaded(job)
        #expect(s.items.isEmpty)
        session.finish()
        #expect(Set(s.items.map(\.type)) == ["batch.create", "page.register"])
        let register = try #require(s.items.first { $0.type == "page.register" })
        // The registration waits for its batch (the image is already up).
        #expect(register.id == job.meta.pageId && register.dependsOn == session.batchId)
        #expect(register.payload["storagePath"] == .string("\(aircraft)/\(logbook)/\(job.meta.pageId).jpg"))
        #expect(register.payload["batchId"] == .string(session.batchId))
        #expect(s.items.first { $0.type == "batch.create" }?.payload["expectedPages"] == .number(1))
        s.close()
    }

    @Test func aSessionKilledBeforeDoneIsClosedOnTheNextLaunch() async throws {
        let root = tempRoot()
        defer { UserDefaults.standard.removeObject(forKey: "MTLForceOffline"); try? FileManager.default.removeItem(at: root) }
        var s: OfflineStore? = store(root)
        let session = ScanSession(store: s!, aircraftId: aircraft, logbook: LogbookRow(id: logbook, type: "airframe", title: nil),
                                  handwritten: false, placement: { _ in nil })
        let page = try #require(PageProcessor.process(Samples.page()))
        session.hold(page)
        session.hold(page)
        // Killed mid-upload: the job was "uploading" and the camera never got Done.
        let job = try #require(s!.files.first { $0.kind == "page" })
        s!.setFile(job.id, "uploading", progress: 0.4)
        s!.close()
        s = nil

        let again = store(root)
        await again.sync() // launch: recovery runs even offline
        #expect(again.items.map(\.type) == ["batch.create"])
        #expect(again.items.first?.payload["expectedPages"] == .number(2))
        #expect(again.heldPages.count == 2) // no page lost
        // The uploader finds no live task for it and puts it back in line.
        try await Task.sleep(for: .milliseconds(300))
        #expect(again.files.first { $0.id == job.id }?.status == "held")
        again.close()
    }

    @Test func discardingARegistrationTakesItsFiles() throws {
        let root = tempRoot()
        defer { UserDefaults.standard.removeObject(forKey: "MTLForceOffline"); try? FileManager.default.removeItem(at: root) }
        let s = store(root)
        let session = ScanSession(store: s, aircraftId: aircraft, logbook: LogbookRow(id: logbook, type: "airframe", title: nil),
                                  handwritten: true, placement: { _ in nil })
        session.hold(try #require(PageProcessor.process(Samples.page())))
        let job = try #require(s.files.first { $0.kind == "page" })
        s.pageUploaded(job)
        session.finish()
        s.discard(job.meta.pageId)
        #expect(s.items.map(\.type) == ["batch.create"])
        #expect(!s.files.contains { $0.kind == "page" })
        #expect(!FileManager.default.fileExists(atPath: s.fileURL(job).path()))
        s.close()
    }
    @Test func referenceIdentityDecisionSurvivesOfflineRestart() throws {
        let root = tempRoot()
        defer { UserDefaults.standard.removeObject(forKey: "MTLForceOffline"); try? FileManager.default.removeItem(at: root) }
        let first = store(root)
        let decision: [String: Any] = ["action": "accept", "suggestionId": String(repeating: "a", count: 24), "fields": ["serial_number": "000123"], "targetId": "11190000-0000-4000-a000-000000000004", "installed": false]
        try first.enqueue(type: "page.details", aircraftId: aircraft, payload: ["pageId": "p1", "decision": decision], label: "Review aircraft details", target: ("page", "p1"), base: "2026-11-25T12:00:00Z")
        first.close()
        let again = store(root)
        let item = try #require(again.waiting.first)
        #expect(item.type == "page.details")
        #expect(item.targetId == "p1")
        #expect(item.payload["decision"] == .object(["action": .string("accept"), "suggestionId": .string(String(repeating: "a", count: 24)), "fields": .object(["serial_number": .string("000123")]), "targetId": .string("11190000-0000-4000-a000-000000000004"), "installed": .bool(false)]))
        #expect(again.rawRows("component", aircraftId: aircraft).isEmpty)
        again.close()
    }

}

struct OfflineRulesTests {
    private func job(_ id: String, batch: String?, kind: String = "page") -> FileJob {
        FileJob(id: id, kind: kind, aircraftId: "a", localPath: "\(id).jpg", bytes: 1, status: "held", progress: 0, attempts: 0, error: nil, createdAt: 0,
                meta: FileMeta(pageId: "p-\(id)", logbookId: "l", batchId: batch, phash: nil, capturedAt: "", isHandwritten: true))
    }

    @Test func orphanBatchesAreThoseNeitherQueuedNorOnTheServer() {
        let files = [job("1", batch: "b1"), job("2", batch: "b1"), job("3", batch: "b2"), job("4", batch: "b3"), job("5", batch: "b1", kind: "page_thumb")]
        let out = orphanBatches(files: files, queued: ["b2"], onServer: ["b3"])
        #expect(out.map(\.batchId) == ["b1"])
        #expect(out.first?.pages == 2)
    }

    @Test func uploadBackoffFollowsB_UPLOAD() {
        #expect((1...6).map(UploadBackoff.delay(afterAttempts:)) == [30, 120, 600, 3600, 21600, 21600])
        #expect(UploadBackoff.maxAttempts == 5)
    }

    @Test func refusedUploadsAreHouseCopyNeverTheServersText() {
        #expect(UploadBackoff.refusal(status: 500) == "Couldn't prepare the upload. It will try again.")
        #expect(UploadBackoff.refusal(status: 503) == "Couldn't prepare the upload. It will try again.")
        #expect(UploadBackoff.refusal(status: 413) == "Too large to upload. Retake at a lower size or upload from a computer.")
        #expect(UploadBackoff.refusal(status: 400) == "Not uploaded: the server refused this page.")
        #expect([400, 401, 403, 404, 408, 413, 429, 500, 503].allSatisfy { !UploadBackoff.refusal(status: $0).contains("http") })
    }

    @Test func syncLineStates() {
        var l = AircraftLine(tail: "N734QA", lastSync: nil)
        #expect(l.syncText == "not synced yet")
        l.offline = true
        #expect(l.syncText == "offline")
        l.waiting = 3
        #expect(l.syncText == "3 waiting")
        l.syncing = true
        #expect(l.syncText == "syncing")
        l.conflicts = 1
        #expect(l.syncText == "1 to decide" && l.alarm)
    }

    @Test func conflictDiffCellsReadForPeople() {
        #expect(AnyJSON.string("Resolved").display == "Resolved")
        #expect(AnyJSON.null.display == "None")
        #expect(AnyJSON.number(4214.8).display == "4214.8")
        #expect(AnyJSON.number(3).display == "3")
        #expect(FieldDiffRow(field: "next_due_date", base: .null, mine: .null, theirs: .null, clash: false, changedByMe: false, changedByThem: false).label == "Next due date")
    }


}

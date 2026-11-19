import UIKit

/// One scanning session into one logbook (M-SCAN-01 → M-SCAN-02 → M-SCAN-03; 09 `scan_batch`). Each page is written
/// to Outbox/pages and given its file jobs before the next capture is accepted (M-SCAN-02 acceptance), so a kill
/// loses at most the shot being taken. Done (or the next launch) closes the batch with `batch.create`.
@MainActor @Observable
final class ScanSession {
    struct Held: Identifiable, Equatable {
        let id: String
        let thumb: UIImage
        let year: Int?
    }

    let aircraftId: String
    let logbook: LogbookRow
    let handwritten: Bool
    let batchId = UUID().uuidString.lowercased()
    private(set) var pages: [Held] = []
    /// The lands-in line for the last page with a legible date (05 §15.1); nil hides it.
    private(set) var landsIn: String?
    private(set) var problem: String?
    private let store: OfflineStore
    private let placement: (Int?) -> String?

    /// `placement` turns a year into the lands-in line for this book (map gaps, page dates).
    init(store: OfflineStore, aircraftId: String, logbook: LogbookRow, handwritten: Bool, placement: @escaping (Int?) -> String?) {
        self.store = store
        self.aircraftId = aircraftId
        self.logbook = logbook
        self.handwritten = handwritten
        self.placement = placement
        store.openBatch = batchId
    }

    /// "Airframe vol. 1 · 5 taken".
    var title: String { "\(logbook.name) · \(pages.count) taken" }

    /// Writes the page and its thumbnail and queues both uploads. False (with `problem`) when the phone couldn't save it.
    @discardableResult
    func hold(_ page: ProcessedPage) -> Bool {
        let pageId = UUID().uuidString.lowercased()
        let dir = store.pagesDir
        let pageURL = dir.appending(path: "\(pageId).jpg"), thumbURL = dir.appending(path: "\(pageId)_thumb.jpg")
        let meta = FileMeta(pageId: pageId, logbookId: logbook.id, batchId: batchId, phash: page.phash,
                            capturedAt: Date().formatted(.iso8601), isHandwritten: handwritten, year: page.year)
        do {
            try page.thumb.write(to: thumbURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            try page.jpeg.write(to: pageURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            try store.addFile(id: UUID().uuidString.lowercased(), kind: "page_thumb", aircraftId: aircraftId, path: thumbURL, bytes: page.thumb.count, meta: meta)
            try store.addFile(id: UUID().uuidString.lowercased(), kind: "page", aircraftId: aircraftId, path: pageURL, bytes: page.jpeg.count, meta: meta)
        } catch {
            try? FileManager.default.removeItem(at: pageURL)
            try? FileManager.default.removeItem(at: thumbURL)
            problem = "Your phone is almost full. Pages may not save."
            return false
        }
        problem = nil
        pages.append(Held(id: pageId, thumb: UIImage(data: page.thumb) ?? UIImage(), year: page.year))
        if let line = placement(page.year) { landsIn = line }
        Task { await store.uploader?.drain() }
        return true
    }

    /// Delete one page of this session (the review strip's Delete).
    func delete(_ pageId: String) {
        for job in store.files where job.meta.pageId == pageId { store.removeFileJob(job) }
        store.reload()
        pages.removeAll { $0.id == pageId }
    }

    /// Done / "Keep them": close the batch so the pages register and get read.
    func finish() {
        store.openBatch = nil
        store.closeBatch(batchId: batchId, logbookId: logbook.id, aircraftId: aircraftId, pages: pages.count, handwritten: handwritten)
    }

    /// "Delete them": nothing of this session stays on the phone.
    func discardAll() {
        for p in pages { delete(p.id) }
        store.openBatch = nil
    }
}

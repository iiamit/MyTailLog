import Foundation
import Network
@preconcurrency import MyTailLogCore

/// The phone's offline store for one signed-in user (05 §6): mirror.db and outbox.db through the KMP core, the page
/// files waiting to upload, and when sync runs (05 §6.7). Views read its published lists; `revision` moves after every
/// pull so screens reading the mirror reload.
@MainActor @Observable
final class OfflineStore {
    let userId: String
    let dir: URL
    private(set) var items: [OutboxItem] = []
    private(set) var files: [FileJob] = []
    private(set) var activity: [ActivityRow] = []
    private(set) var online = true
    private(set) var syncing = false
    private(set) var failed = false
    private(set) var lastSyncAt: Date?
    /// Bumped after each pull that applied changes, and after local writes.
    private(set) var revision = 0

    /// Debug transport switch for the airplane-mode scripts in the simulator (07 B-OFFLINE): launch with
    /// `-MTLForceOffline YES` and nothing reaches the network; flip it from M-SYS-01 in Debug builds.
    var forcedOffline = UserDefaults.standard.bool(forKey: "MTLForceOffline") {
        didSet { UserDefaults.standard.set(forcedOffline, forKey: "MTLForceOffline"); if !forcedOffline { schedule(after: 0) } }
    }
    var isOffline: Bool { forcedOffline || !online }

    /// The access token for API calls; the app sets it from SessionStore (05 §8.1).
    var token: @Sendable () async throws -> String = { throw URLError(.userAuthenticationRequired) }
    let apiURL: URL

    private let core: OfflineCore
    private(set) var uploader: Uploader!
    private let monitor = NWPathMonitor()
    private var pending: Task<Void, Never>?

    /// The store of the signed-in user, so the background URLSession and BGTasks reach the same one (05 §9).
    private(set) static var current: OfflineStore?

    static func open(userId: String, apiURL: URL) -> OfflineStore {
        if let c = current, c.userId == userId { return c }
        current?.close()
        let s = OfflineStore(userId: userId, apiURL: apiURL)
        current = s
        return s
    }

    init(userId: String, apiURL: URL, root: URL? = nil) {
        self.userId = userId
        self.apiURL = apiURL
        let base = root ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        dir = base.appending(path: "users/\(userId)", directoryHint: .isDirectory)
        Self.prepare(dir)
        core = OfflineCore(dir: dir.path(percentEncoded: false), baseUrl: apiURL.absoluteString)
        lastSyncAt = UserDefaults.standard.object(forKey: "lastSync.\(userId)") as? Date
        uploader = Uploader(store: self)
        reload()
        monitor.pathUpdateHandler = { [weak self] path in
            let up = path.status == .satisfied
            Task { @MainActor in
                guard let self, self.online != up else { return }
                self.online = up
                // Connectivity regained: push, then pull (05 §6.7).
                if up { self.schedule(after: 0) }
            }
        }
        monitor.start(queue: .global(qos: .utility))
    }

    /// Per-user folders; pages wait in Outbox/pages, readable after first unlock and included in backup (05 §7.1).
    private static func prepare(_ dir: URL) {
        let fm = FileManager.default
        let pages = dir.appending(path: "Outbox/pages", directoryHint: .isDirectory)
        try? fm.createDirectory(at: pages, withIntermediateDirectories: true,
                                attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
        try? fm.createDirectory(at: dir.appending(path: "Cache"), withIntermediateDirectories: true)
        // mirror.db is rebuildable: kept out of the device backup (05 §6.2).
        var mirror = dir.appending(path: "mirror.db")
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        if fm.fileExists(atPath: mirror.path()) { try? mirror.setResourceValues(values) }
    }

    /// Closed stores ignore late callbacks (the path monitor, a debounced sync).
    private var closed = false

    func close() {
        guard !closed else { return }
        closed = true
        uploader?.invalidate()
        uploader = nil
        monitor.cancel()
        pending?.cancel()
        core.close()
    }

    /// Sign-out (05 §8.6): the database files, the held pages and the cache go.
    func wipe() {
        uploader?.cancelAll()
        close()
        try? FileManager.default.removeItem(at: dir)
        UserDefaults.standard.removeObject(forKey: "lastSync.\(userId)")
        if Self.current === self { Self.current = nil }
    }

    // MARK: Reads

    var waiting: [OutboxItem] { items.filter { $0.status != "conflict" && $0.status != "refused" } }
    var conflicts: [OutboxItem] { items.filter { $0.status == "conflict" } }
    var refused: [OutboxItem] { items.filter { $0.status == "refused" } }
    /// Page files not yet on the server (thumbnails ride along with their page).
    var heldPages: [FileJob] { files.filter { $0.kind == "page" && $0.status != "registered" } }

    func reload() {
        guard !closed else { return }
        items = decode(core.outboxJson()) ?? []
        files = decode(core.filesJson()) ?? []
        activity = decode(core.activityJson(limit: 200)) ?? []
    }

    /// Every mirror row of `table` for one aircraft, decoded from `_raw` (the server's own row shape).
    func rows<T: Decodable>(_ table: String, aircraftId: String, as: T.Type = T.self) -> [T] {
        let raw = core.rowsJson(table: table, aircraftId: aircraftId)
        // One bad row must not hide the rest.
        guard let array = try? JSONDecoder().decode([AnyJSON].self, from: Data(raw.utf8)) else { return [] }
        return array.compactMap { row in (try? JSONEncoder().encode(row)).flatMap { try? JSONDecoder().decode(T.self, from: $0) } }
    }

    func aircraftRows<T: Decodable>(as: T.Type = T.self) -> [T] { decode(core.aircraftJson()) ?? [] }
    func raw(_ table: String, id: String) -> String? { core.rawJson(table: table, id: id) }
    var hasPulled: Bool { core.cursor() > 0 }

    func diff(_ id: String) -> [FieldDiffRow] { decode(core.diffJson(mutationId: id)) ?? [] }

    private func decode<T: Decodable>(_ s: String) -> T? { try? JSONDecoder().decode(T.self, from: Data(s.utf8)) }

    // MARK: Writes

    /// Queue one change (05 §6.4) and push it soon. Throws the core's refusal (unknown or online-only type, no base).
    func enqueue(id: String = UUID().uuidString.lowercased(), type: String, aircraftId: String, payload: [String: Any],
                 label: String, target: (table: String, id: String)? = nil, base: String? = nil, baseRow: String? = nil,
                 dependsOn: String? = nil) throws {
        let json = String(decoding: try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]), as: UTF8.self)
        try core.enqueue(id: id, type: type, aircraftId: aircraftId, payload: json, label: label,
                         targetTable: target?.table, targetId: target?.id, base: base, baseRow: baseRow, dependsOn: dependsOn)
        reload()
        revision += 1
        schedule(after: 1.5)
    }

    /// Discard a waiting or refused change (M-SYS-01). A page's registration takes its held files with it.
    func discard(_ id: String) {
        _ = core.discard(mutationId: id)
        for f in files where f.meta.pageId == id { removeFileJob(f) }
        reload()
        revision += 1
    }

    func resolve(_ id: String, _ choice: String) async -> String? {
        do {
            try await core.resolve(mutationId: id, choice: choice)
            reload()
            revision += 1
            schedule(after: 0)
            return nil
        } catch {
            return "That didn't work. Try again."
        }
    }

    // MARK: Files (05 §7.2)

    func addFile(id: String, kind: String, aircraftId: String, path: URL, bytes: Int, meta: FileMeta) throws {
        let json = String(decoding: try JSONEncoder().encode(meta), as: UTF8.self)
        _ = core.addFile(id: id, kind: kind, aircraftId: aircraftId, localPath: path.lastPathComponent, bytes: Int64(bytes),
                         sha256: nil, meta: json, createdAt: Int64(Date().timeIntervalSince1970 * 1000))
        reload()
    }

    func setFile(_ id: String, _ status: String, progress: Double = 0, error: String? = nil, attempt: Bool = false) {
        _ = core.setFileStatus(id: id, status: status, progress: progress, error: error, attemptDelta: attempt ? 1 : 0)
        reload()
    }

    /// Paths are stored relative to Outbox/pages so a restored backup (new container path) still finds them.
    func fileURL(_ job: FileJob) -> URL { pagesDir.appending(path: job.localPath) }
    var pagesDir: URL { dir.appending(path: "Outbox/pages", directoryHint: .isDirectory) }

    func removeFileJob(_ job: FileJob) {
        uploader?.cancel(job.id)
        _ = core.removeFile(id: job.id)
        try? FileManager.default.removeItem(at: fileURL(job))
    }

    /// A page's image reached storage: queue `page.register` once its batch is queued (05 §7.2 step 3).
    func pageUploaded(_ job: FileJob) {
        guard job.kind == "page" else {
            _ = core.removeFile(id: job.id) // the thumbnail is on the server; its file stays for the queue until the page goes
            reload()
            return
        }
        setFile(job.id, "uploaded", progress: 1)
        registerUploaded()
    }

    /// `page.register` for every uploaded page whose batch `batch.create` is queued or on the server.
    func registerUploaded() {
        let queued = Set(items.map(\.id))
        for job in files where job.kind == "page" && job.status == "uploaded" {
            if let b = job.meta.batchId, !queued.contains(b), raw("scan_batch", id: b) == nil { continue }
            if !queued.contains(job.meta.pageId), raw("page", id: job.meta.pageId) == nil {
                var payload: [String: Any] = [
                    "id": job.meta.pageId, "logbookId": job.meta.logbookId,
                    "storagePath": "\(job.aircraftId)/\(job.meta.logbookId)/\(job.meta.pageId).jpg",
                    "capturedAt": job.meta.capturedAt, "isHandwritten": job.meta.isHandwritten,
                ]
                if let b = job.meta.batchId { payload["batchId"] = b }
                if let p = job.meta.phash { payload["phash"] = p }
                do {
                    try enqueue(id: job.meta.pageId, type: "page.register", aircraftId: job.aircraftId, payload: payload,
                                label: "Page photo", target: ("page", job.meta.pageId), dependsOn: job.id)
                } catch {
                    continue
                }
            }
            setFile(job.id, "registered", progress: 1)
        }
    }

    /// Close a scanning session: one `batch.create` for its pages, then register what already uploaded.
    func closeBatch(batchId: String, logbookId: String, aircraftId: String, pages: Int, handwritten: Bool) {
        guard pages > 0 else { return }
        try? enqueue(id: batchId, type: "batch.create", aircraftId: aircraftId,
                     payload: ["id": batchId, "logbookId": logbookId, "source": "phone_camera", "expectedPages": pages, "isHandwritten": handwritten],
                     label: pages == 1 ? "1 page scanned" : "\(pages) pages scanned", target: ("scan_batch", batchId))
        registerUploaded()
    }

    /// Housekeeping after a sync: registered pages whose registration landed leave the phone; sessions the app died
    /// during are closed (05 §6.1: server acceptance is the only thing that removes work).
    private func settleFiles() {
        let queued = Set(items.map(\.id))
        for job in files where job.kind == "page" && job.status == "registered" && !queued.contains(job.meta.pageId) {
            removeFileJob(job)
            try? FileManager.default.removeItem(at: pagesDir.appending(path: "\(job.meta.pageId)_thumb.jpg"))
        }
        reload()
    }

    func recoverSessions(except open: String?) {
        let onServer = Set(files.compactMap(\.meta.batchId).filter { raw("scan_batch", id: $0) != nil })
        for b in orphanBatches(files: files, queued: Set(items.map(\.id)), onServer: onServer) where b.batchId != open {
            closeBatch(batchId: b.batchId, logbookId: b.logbookId, aircraftId: b.aircraftId, pages: b.pages, handwritten: b.handwritten)
        }
        registerUploaded()
    }

    // MARK: Sync (05 §6.7)

    /// The open camera session's batch, never closed by recovery while the camera is up.
    var openBatch: String?

    func schedule(after seconds: Double) {
        pending?.cancel()
        pending = Task { [weak self] in
            if seconds > 0 { try? await Task.sleep(for: .seconds(seconds)) }
            guard !Task.isCancelled else { return }
            await self?.sync()
        }
    }

    /// Files first, then push, then pull (07 B-OFFLINE). Offline it only refreshes what the screens show.
    func sync() async {
        guard !closed else { return }
        reload()
        recoverSessions(except: openBatch)
        guard !isOffline, !syncing else { return }
        syncing = true
        defer { syncing = false }
        do {
            core.accessToken = try await token()
            await uploader?.drain()
            let before = core.cursor()
            let report = try await core.sync()
            reload()
            settleFiles()
            failed = false
            if !report.offline {
                lastSyncAt = Date()
                UserDefaults.standard.set(lastSyncAt, forKey: "lastSync.\(userId)")
            }
            if core.cursor() != before || report.ok > 0 || report.conflicts > 0 || report.refused > 0 { revision += 1 }
        } catch {
            reload()
            // A network failure is "offline", not a failed sync; a server or auth refusal is.
            failed = !(error as NSError).isNetwork
        }
    }
}

private extension NSError {
    var isNetwork: Bool {
        domain == NSURLErrorDomain || (userInfo[NSUnderlyingErrorKey] as? NSError)?.domain == NSURLErrorDomain
            || localizedDescription.localizedCaseInsensitiveContains("network") || localizedDescription.localizedCaseInsensitiveContains("offline")
    }
}

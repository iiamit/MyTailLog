import Foundation

/// Uploads held page files straight to storage (05 §7.2): ask the app for a signed URL, then a file-based task on a
/// background URLSession so it carries on while the app is suspended. A job is "uploading" only while its task
/// lives; on launch any orphaned "uploading" job goes back to held and starts again, and the server answers
/// `alreadyUploaded` for an object that did land (a kill after the bytes arrived loses nothing and doubles nothing).
@MainActor
final class Uploader {
    static let sessionId = "com.mytaillog.uploads"
    /// Strong on purpose: OfflineStore.close() drops its uploader, which ends the cycle.
    private let store: OfflineStore
    private var live: [String: URLSessionTask] = [:]
    private var nextTry: [String: Date] = [:]
    /// Jobs asking for their signed URL: a second drain (a sync, a capture) must not start them twice.
    private var starting: Set<String> = []
    /// The system's completion for `handleEventsForBackgroundURLSession` (05 §9).
    static var backgroundCompletion: (() -> Void)?

    /// One background session per process: the system allows one live session per identifier, and a relaunch
    /// re-attaches to it. Its events go to the open store's uploader.
    private static weak var active: Uploader?
    private static let session: URLSession = {
        let config = URLSessionConfiguration.background(withIdentifier: sessionId)
        config.sessionSendsLaunchEvents = true
        config.isDiscretionary = false
        let delegate = Delegate()
        delegate.onDone = { id, status, error in
            Task { @MainActor in Uploader.active?.finished(id, status: status, error: error) }
        }
        delegate.onProgress = { id, p in
            Task { @MainActor in Uploader.active?.progress(id, p) }
        }
        delegate.onEventsDone = {
            Task { @MainActor in Uploader.backgroundCompletion?(); Uploader.backgroundCompletion = nil }
        }
        return URLSession(configuration: config, delegate: delegate, delegateQueue: nil)
    }()
    private var session: URLSession { Self.session }

    init(store: OfflineStore) {
        self.store = store
        Self.active = self
        Task { await adoptRunningTasks() }
    }

    /// Re-attach to tasks the system kept running across a relaunch; reset jobs whose task is gone.
    private func adoptRunningTasks() async {
        let tasks = await session.allTasks
        guard store.uploader === self else { return } // the store closed meanwhile
        for t in tasks { if let id = t.taskDescription { live[id] = t } }
        for job in store.files where job.status == "uploading" && live[job.id] == nil { store.setFile(job.id, "held") }
    }

    /// The store closed: this uploader stops taking events (running tasks finish and are re-adopted on reopen).
    func invalidate() { if Self.active === self { Self.active = nil } }

    func cancel(_ id: String) { live.removeValue(forKey: id)?.cancel() }
    func cancelAll() { live.values.forEach { $0.cancel() }; live = [:] }

    /// "Try again" (M-SYS-01): a failed upload goes back in line now.
    func retry(_ job: FileJob) {
        nextTry[job.id] = nil
        store.setFile(job.id, "held")
        Task { await drain() }
    }

    /// Start every held file that is due (oldest first, thumbnails before their page).
    /// Returns whether a squawk photo or document reached the server (its waiting change can now be pushed).
    @discardableResult
    func drain() async -> Bool {
        guard store.uploader === self, !store.isOffline else { return false }
        var sentRecord = false
        for job in store.files where job.status == "held" && live[job.id] == nil && !starting.contains(job.id) {
            if let at = nextTry[job.id], at > Date() { continue }
            // The list was read before earlier awaits; another drain may have moved this job on.
            guard store.uploader === self, store.files.first(where: { $0.id == job.id })?.status == "held", live[job.id] == nil, !starting.contains(job.id) else { continue }
            starting.insert(job.id)
            if job.kind == OfflineStore.squawkPhoto || job.kind == OfflineStore.document {
                if await sendRecord(job) { sentRecord = true }
            } else {
                await start(job)
            }
            starting.remove(job.id)
        }
        return sentRecord
    }

    private func start(_ job: FileJob) async {
        let url = store.apiURL.appending(path: "api/aircraft/\(job.aircraftId)/uploads")
        var request = URLRequest(url: url, timeoutInterval: 30)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = ["kind": job.kind, "pageId": job.meta.pageId, "logbookId": job.meta.logbookId,
                                   "bytes": job.bytes, "contentType": "image/jpeg"]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        struct Answer: Decodable {
            let uploadUrl: String?; let method: String?; let headers: [String: String]?; let alreadyUploaded: Bool?; let error: String?
        }
        do {
            request.setValue("Bearer \(try await store.token())", forHTTPHeaderField: "Authorization")
            let (data, response) = try await URLSession.shared.data(for: request)
            guard store.uploader === self else { return } // closed (sign-out, kill) while asking
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let answer = try? JSONDecoder().decode(Answer.self, from: data)
            guard (200..<300).contains(status), let answer else {
                // House copy from the status (07 B-UPLOAD), never the server's text; 5xx retries.
                failed(job, UploadBackoff.refusal(status: status))
                return
            }
            if answer.alreadyUploaded == true {
                store.pageUploaded(job)
                return
            }
            guard let put = answer.uploadUrl.flatMap(URL.init(string:)) else { failed(job, "Not uploaded: no upload address."); return }
            var upload = URLRequest(url: put)
            upload.httpMethod = answer.method ?? "PUT"
            for (k, v) in answer.headers ?? [:] { upload.setValue(v, forHTTPHeaderField: k) }
            let task = session.uploadTask(with: upload, fromFile: store.fileURL(job))
            task.taskDescription = job.id
            live[job.id] = task
            store.setFile(job.id, "uploading")
            task.resume()
        } catch {
            guard store.uploader === self else { return }
            failed(job, "Not uploaded yet: no connection.", countAttempt: false)
        }
    }

    /// Squawk photos and documents go up in-process through their routes (the blob and documents routes take the bytes
    /// themselves, so there is no signed URL to hand a background session). A photo waits until its squawk is on the server.
    private func sendRecord(_ job: FileJob) async -> Bool {
        if job.kind == OfflineStore.squawkPhoto, let squawk = job.meta.squawkId, store.items.contains(where: { $0.id == squawk }) { return false }
        guard let bytes = try? Data(contentsOf: store.fileURL(job)) else { failed(job, "Not uploaded: the file is no longer on this phone."); return false }
        let api = RecordsAPI(apiURL: store.apiURL, token: store.token)
        do {
            if job.kind == OfflineStore.squawkPhoto {
                try await api.squawkPhoto(aircraftId: job.aircraftId, squawkId: job.meta.squawkId ?? "", photoId: job.meta.photoId ?? job.id, jpeg: bytes)
            } else {
                let id = try await api.document(aircraftId: job.aircraftId, meta: job.meta, bytes: bytes)
                // The phone's copy becomes the offline copy under the server's id (documents are never purged).
                let to = store.docURL(id, fileName: job.meta.fileName)
                try? FileManager.default.createDirectory(at: to.deletingLastPathComponent(), withIntermediateDirectories: true)
                try? FileManager.default.moveItem(at: store.fileURL(job), to: to)
            }
            guard store.uploader === self else { return false }
            nextTry[job.id] = nil
            store.recordFileDone(job)
            return true
        } catch let e as RecordsAPI.Failure {
            guard store.uploader === self else { return false }
            // A refusal (4xx) won't change on retry: it is listed with its reason at once.
            failed(job, "Not uploaded: \(e.message)", countAttempt: true, permanent: (400..<500).contains(e.status))
        } catch {
            guard store.uploader === self else { return false }
            failed(job, "Not uploaded yet: no connection.", countAttempt: false)
        }
        return false
    }

    private func progress(_ id: String, _ p: Double) {
        // A row per tenth is plenty for the queue's bar; every callback would write outbox.db hundreds of times.
        guard live[id] != nil, let job = store.files.first(where: { $0.id == id }), p - job.progress >= 0.1 || p >= 1 else { return }
        store.setFile(id, "uploading", progress: p)
    }

    private func finished(_ id: String, status: Int, error: Error?) {
        live[id] = nil
        guard store.uploader === self else { return }
        guard let job = store.files.first(where: { $0.id == id }) else { return }
        // 412: the object is already there (if-generation-match 0), so an earlier try landed.
        if error == nil, (200..<300).contains(status) || status == 412 {
            nextTry[id] = nil
            store.pageUploaded(job)
            Task { await store.sync() }
        } else if (error as? URLError)?.code == .cancelled {
            return
        } else {
            failed(job, error == nil ? "Not uploaded: storage answered \(status)." : "Not uploaded yet: the connection dropped.", countAttempt: error == nil)
        }
    }

    private func failed(_ job: FileJob, _ reason: String, countAttempt: Bool = true, permanent: Bool = false) {
        let attempts = Int(job.attempts) + (countAttempt ? 1 : 0)
        nextTry[job.id] = Date().addingTimeInterval(UploadBackoff.delay(afterAttempts: max(attempts, 1)))
        store.setFile(job.id, permanent || attempts >= UploadBackoff.maxAttempts ? "failed" : "held", error: reason, attempt: countAttempt)
    }

    /// URLSession delegate callbacks arrive on its own queue; they hop to the main actor through these closures.
    private final class Delegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
        var onDone: (@Sendable (String, Int, Error?) -> Void)?
        var onProgress: (@Sendable (String, Double) -> Void)?
        var onEventsDone: (@Sendable () -> Void)?

        func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
            guard let id = task.taskDescription else { return }
            onDone?(id, (task.response as? HTTPURLResponse)?.statusCode ?? 0, error)
        }

        func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64, totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
            guard let id = task.taskDescription, totalBytesExpectedToSend > 0 else { return }
            onProgress?(id, Double(totalBytesSent) / Double(totalBytesExpectedToSend))
        }

        func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
            onEventsDone?()
        }
    }
}

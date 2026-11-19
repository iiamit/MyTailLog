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
    private let delegate = Delegate()
    private let session: URLSession
    private var live: [String: URLSessionTask] = [:]
    private var nextTry: [String: Date] = [:]
    /// The system's completion for `handleEventsForBackgroundURLSession` (05 §9).
    static var backgroundCompletion: (() -> Void)?

    init(store: OfflineStore) {
        self.store = store
        let config = URLSessionConfiguration.background(withIdentifier: Self.sessionId)
        config.sessionSendsLaunchEvents = true
        config.isDiscretionary = false
        session = URLSession(configuration: config, delegate: delegate, delegateQueue: nil)
        delegate.onDone = { [weak self] id, status, error in
            Task { @MainActor in self?.finished(id, status: status, error: error) }
        }
        delegate.onProgress = { [weak self] id, p in
            Task { @MainActor in self?.progress(id, p) }
        }
        delegate.onEventsDone = {
            Task { @MainActor in Uploader.backgroundCompletion?(); Uploader.backgroundCompletion = nil }
        }
        Task { await adoptRunningTasks() }
    }

    /// Re-attach to tasks the system kept running across a relaunch; reset jobs whose task is gone.
    private func adoptRunningTasks() async {
        let tasks = await session.allTasks
        guard store.uploader === self else { return } // the store closed meanwhile
        for t in tasks { if let id = t.taskDescription { live[id] = t } }
        for job in store.files where job.status == "uploading" && live[job.id] == nil { store.setFile(job.id, "held") }
    }

    /// Frees the background session identifier; tasks already running finish.
    func invalidate() { session.finishTasksAndInvalidate() }

    func cancel(_ id: String) { live.removeValue(forKey: id)?.cancel() }
    func cancelAll() { live.values.forEach { $0.cancel() }; live = [:] }

    /// "Try again" (M-SYS-01): a failed upload goes back in line now.
    func retry(_ job: FileJob) {
        nextTry[job.id] = nil
        store.setFile(job.id, "held")
        Task { await drain() }
    }

    /// Start every held file that is due (oldest first, thumbnails before their page).
    func drain() async {
        guard store.uploader === self, !store.isOffline else { return }
        for job in store.files where job.status == "held" && live[job.id] == nil {
            if let at = nextTry[job.id], at > Date() { continue }
            await start(job)
        }
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
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            let answer = try? JSONDecoder().decode(Answer.self, from: data)
            guard (200..<300).contains(status), let answer else {
                // 4xx is the server's reason, verbatim after "Not uploaded:" (07 B-UPLOAD); 5xx retries.
                let reason = status == 413 ? "Too large to upload. Retake at a lower size or upload from a computer."
                    : answer?.error.map { "Not uploaded: \($0)" } ?? "Not uploaded: the server didn't answer."
                failed(job, reason)
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
            failed(job, "Not uploaded yet: no connection.", countAttempt: false)
        }
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

    private func failed(_ job: FileJob, _ reason: String, countAttempt: Bool = true) {
        let attempts = Int(job.attempts) + (countAttempt ? 1 : 0)
        nextTry[job.id] = Date().addingTimeInterval(UploadBackoff.delay(afterAttempts: max(attempts, 1)))
        store.setFile(job.id, attempts >= UploadBackoff.maxAttempts ? "failed" : "held", error: reason, attempt: countAttempt)
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

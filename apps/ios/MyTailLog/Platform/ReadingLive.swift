import ActivityKit
import Foundation

/// Follows one scan session's pages in the "Pages in progress" Live Activity (05 §12): on this phone, uploading, being
/// read, read. Started from the camera's Done, in the foreground as ActivityKit requires.
/// shortcut: updated by polling the reading queue while the app runs (up to 20 minutes), not by APNs `liveactivity`
/// pushes; upgrade when the reading worker sends them (needs POST /api/push/live-activities on the server).
@MainActor
final class ReadingLive {
    static let shared = ReadingLive()
    /// Settings › Reminders "Show reading progress" (this phone only).
    static let enabledKey = "reading.live"
    static var enabled: Bool { UserDefaults.standard.object(forKey: enabledKey) as? Bool ?? true }

    private var task: Task<Void, Never>?

    func start(aircraftId: String, tail: String, logbook: String, batchId: String, offline: OfflineStore, books: BooksModel) {
        guard Self.enabled, ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        task?.cancel()
        task = Task { await follow(ReadingAttributes(aircraftId: aircraftId, tail: tail), logbook, batchId, offline, books) }
    }

    /// Opening Review ends it at once (05 §12).
    func endAll() {
        task?.cancel()
        Task { await Self.endActivities() }
    }

    #if DEBUG
    /// Simulator check only (launch with MTL_DEMO_READING=1): the camera that starts the activity isn't in the simulator.
    func demo(done: Bool) {
        let b = ReadingQueue.Batch(id: "demo", logbook: nil, logbookId: "", createdAt: "", expected: 4, uploaded: 4, queued: done ? 0 : 1,
                                   reading: done ? 0 : 1, waitingAllowance: 0, read: done ? 4 : 2, failed: 0, needsLook: done ? 1 : 0,
                                   waitingDecision: 0, completedAt: nil)
        guard let s = readingState(held: 0, uploading: 0, logbook: "", offline: false, batches: [b]),
              let a = SharedSnapshots.pick(nil) else { return }
        Task { await Self.show(ReadingAttributes(aircraftId: a.id, tail: a.tail), s) }
    }
    #endif

    nonisolated private static func endActivities() async {
        for a in Activity<ReadingAttributes>.activities { await a.end(nil, dismissalPolicy: .immediate) }
    }

    /// Starts, updates or ends this aircraft's activity; the activity itself never leaves this function.
    nonisolated private static func show(_ attrs: ReadingAttributes, _ state: ReadingAttributes.ContentState) async {
        let content = ActivityContent(state: state, staleDate: Date().addingTimeInterval(15 * 60))
        guard let activity = Activity<ReadingAttributes>.activities.first(where: { $0.attributes.aircraftId == attrs.aircraftId })
            ?? (try? Activity.request(attributes: attrs, content: content, pushType: nil)) else { return }
        if state.phase == .read {
            await activity.end(content, dismissalPolicy: .after(Date().addingTimeInterval(3600)))
        } else {
            await activity.update(content)
        }
    }

    private func follow(_ attrs: ReadingAttributes, _ logbook: String, _ batchId: String, _ offline: OfflineStore, _ books: BooksModel) async {
        var queue: ReadingQueue?
        var polled = Date.distantPast
        var last: ReadingAttributes.ContentState?
        let until = Date().addingTimeInterval(20 * 60)
        while !Task.isCancelled, Date() < until {
            let held = offline.heldPages.filter { $0.meta.batchId == batchId }
            if held.isEmpty, !offline.isOffline, Date().timeIntervalSince(polled) >= 10 {
                queue = await books.readingQueue() ?? queue
                polled = Date()
            }
            let state = readingState(held: held.count, uploading: held.filter { $0.status == "uploading" }.count, logbook: logbook,
                                     offline: offline.isOffline, batches: queue?.batches.filter { $0.id == batchId } ?? [])
            if let state, state != last {
                last = state
                await Self.show(attrs, state)
                if state.phase == .read { return }
            }
            try? await Task.sleep(for: .seconds(3))
        }
    }
}

private func pages(_ n: Int) -> String { n == 1 ? "1 page" : "\(n) pages" }

/// What the activity says (05 §12 table) for this session's pages: those still on the phone, then the server's
/// batches. Nil when there is nothing to say yet.
func readingState(held: Int, uploading: Int, logbook: String, offline: Bool, batches: [ReadingQueue.Batch]) -> ReadingAttributes.ContentState? {
    typealias S = ReadingAttributes.ContentState
    if held > 0 {
        if offline || uploading == 0 {
            return S(phase: .onPhone, text: "\(pages(held)) on this phone · They upload when you have signal.",
                     compact: "\(held) held", done: 0, total: held)
        }
        let total = held + batches.map(\.uploaded).reduce(0, +)
        let sent = total - held + 1
        return S(phase: .uploading, text: "Uploading \(sent) of \(total) · \(logbook)", compact: "\(sent)/\(total)", done: sent - 1, total: total)
    }
    guard !batches.isEmpty else { return nil }
    let total = batches.map { max($0.expected, $0.uploaded) }.reduce(0, +)
    let read = batches.map { $0.read + $0.failed }.reduce(0, +)
    let active = batches.map { $0.queued + $0.reading }.reduce(0, +)
    let waiting = batches.map(\.waitingAllowance).reduce(0, +)
    let look = batches.map(\.needsLook).reduce(0, +)
    if active > 0 {
        return S(phase: .reading, text: "Reading \(pages(total)) · \(read) of \(total) read · a minute or two",
                 compact: "\(read)/\(total)", done: read, total: total)
    }
    if waiting > 0 {
        return S(phase: .paused, text: "\(pages(waiting)) \(waiting == 1 ? "waits" : "wait") for tomorrow's reading allowance.",
                 compact: "wait", done: read, total: total)
    }
    guard read > 0 else { return nil }
    let needs = look > 0 ? " \(look) \(look == 1 ? "needs" : "need") a look." : ""
    return S(phase: .read, text: "\(pages(read)) \(read == 1 ? "is" : "are") read.\(needs)", compact: "", done: read, total: total)
}

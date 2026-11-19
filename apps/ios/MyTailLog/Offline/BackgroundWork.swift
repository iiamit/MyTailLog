import BackgroundTasks
import UIKit

/// Background work (05 §9): the upload session's relaunch events, a BGAppRefreshTask that pushes and pulls, and a
/// BGProcessingTask (network required) for queued work the app left behind: held pages and unsent changes.
final class AppDelegate: NSObject, UIApplicationDelegate {
    static let refreshId = "com.mytaillog.sync.refresh"
    static let processId = "com.mytaillog.sync.process"

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.refreshId, using: nil) { task in
            Self.run(task)
        }
        BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.processId, using: nil) { task in
            Self.run(task)
        }
        // A background relaunch for the upload session needs the signed-in user's store before any scene exists.
        MainActor.assumeIsolated { _ = Self.openStore() }
        return true
    }

    func application(_ application: UIApplication, handleEventsForBackgroundURLSession identifier: String, completionHandler: @escaping () -> Void) {
        MainActor.assumeIsolated {
            Uploader.backgroundCompletion = completionHandler
            _ = Self.openStore()
        }
    }

    @MainActor
    static func openStore() -> OfflineStore? {
        if let s = OfflineStore.current { return s }
        guard let session = SessionKeychain.load(), let userId = session.userId else { return nil }
        let store = OfflineStore.open(userId: userId, apiURL: StatusAPI.fromBundle().apiURL)
        // Until the app's SessionStore takes over: the stored token (a refresh needs the UI's auth client).
        store.token = { session.accessToken }
        return store
    }

    private static func run(_ task: BGTask) {
        schedule()
        let work = Task { @MainActor in
            await openStore()?.sync()
            task.setTaskCompleted(success: true)
        }
        task.expirationHandler = { work.cancel() }
    }

    /// Called when the app goes to the background: the refresh every 30 min at the earliest, and the processing task
    /// only when something is waiting.
    @MainActor
    static func schedule() {
        let refresh = BGAppRefreshTaskRequest(identifier: refreshId)
        refresh.earliestBeginDate = Date(timeIntervalSinceNow: 30 * 60)
        try? BGTaskScheduler.shared.submit(refresh)
        guard let s = OfflineStore.current, !s.items.isEmpty || !s.files.isEmpty else { return }
        let process = BGProcessingTaskRequest(identifier: processId)
        process.requiresNetworkConnectivity = true
        try? BGTaskScheduler.shared.submit(process)
    }
}

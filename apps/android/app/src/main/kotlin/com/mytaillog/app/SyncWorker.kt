package com.mytaillog.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import java.util.concurrent.TimeUnit

/**
 * Uploads held pages, then pushes the outbox and pulls (05 §9: UploadWorker and SyncWorker as one
 * job, so pages always go before the changes that register them). Runs only with a network; unique
 * names so repeated scheduling never duplicates it. Expedited, and a dataSync foreground job whose
 * ongoing note follows each page ("Uploading 2 of 5 pages to N734DM", 05 §12), app open or not.
 * shortcut: one queue job rather than one job per file (05 §9); fine for a scan session's pages in order.
 */
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    /** True when the note went up as a plain notification (no foreground start allowed), so this job takes it down. */
    private var posted = false

    override suspend fun doWork(): Result = coroutineScope {
        val app = applicationContext as? MyTailLogApp ?: return@coroutineScope Result.success()
        val store = app.currentOffline() ?: return@coroutineScope Result.success()
        val held = store.pageJobs()
        val tail = held.firstOrNull()?.tail
        val progress = if (held.any { !it.uploaded }) {
            launch { store.sync.map { uploadNote(it.uploading, it.pages, tail) }.distinctUntilChanged().collect { show(it) } }
        } else null
        val retry = try {
            store.syncNow()
        } finally {
            progress?.cancel()
            if (posted) NotificationManagerCompat.from(applicationContext).cancel(NOTE_ID)
        }
        if (store.isClosing) return@coroutineScope Result.success()
        // Pages that reached storage now get read: follow them in the reading-progress note (05 §12).
        val left = store.pageJobs().map { it.id }.toSet()
        held.filter { it.id !in left }.groupBy { it.aircraftId }.forEach { (id, sent) ->
            ReadingWorker.start(applicationContext, id, sent.map { it.batchId }.distinct(), sent.first().tail)
        }
        // Hourly at least, so the widgets' day counts move past midnight (05 §11.2).
        refreshWidgets(applicationContext)
        if (retry && runAttemptCount < 20) Result.retry() else Result.success()
    }

    /** Foreground keeps the upload alive; when Android refuses a foreground start (app in the background, 12+), a plain note. */
    private suspend fun show(n: UploadNote) {
        val note = build(applicationContext, n)
        if (runCatching { setForeground(info(note)) }.isSuccess) return
        if (!canNotify(applicationContext)) return
        try { NotificationManagerCompat.from(applicationContext).notify(NOTE_ID, note); posted = true } catch (_: SecurityException) {}
    }

    override suspend fun getForegroundInfo(): ForegroundInfo {
        val store = (applicationContext as MyTailLogApp).currentOffline()
        val s = store?.sync?.value
        return info(build(applicationContext, uploadNote(s?.uploading, s?.pages ?: 0, store?.pageJobs()?.firstOrNull()?.tail)))
    }

    private fun info(note: Notification) =
        ForegroundInfo(NOTE_ID, note, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)

    companion object {
        private const val NOW = "sync-now"
        private const val PERIODIC = "sync-periodic"
        private const val CHANNEL = "uploads"
        private const val NOTE_ID = 7342
        private val network = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        private fun build(context: Context, n: UploadNote): Notification {
            context.getSystemService(NotificationManager::class.java)
                .createNotificationChannel(NotificationChannel(CHANNEL, context.getString(R.string.capture_channel), NotificationManager.IMPORTANCE_LOW))
            return NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(android.R.drawable.stat_sys_upload)
                .setContentTitle(n.text)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setProgress(n.total, n.done, n.total == 0)
                .build()
        }

        /** After every write and capture, and on reconnect (05 §6.7). Appends, so nothing queued meanwhile is missed. */
        fun now(context: Context) {
            val req = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(network)
                .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(NOW, ExistingWorkPolicy.APPEND_OR_REPLACE, req)
        }

        /** Hourly push and pull (05 §9). */
        fun periodic(context: Context) {
            val req = PeriodicWorkRequestBuilder<SyncWorker>(1, TimeUnit.HOURS).setConstraints(network).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, req)
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(NOW)
            WorkManager.getInstance(context).cancelUniqueWork(PERIODIC)
        }
    }
}

/** The upload note's words and bar (05 §12): "Uploading 3 of 5 pages to N734DM", 2 of 5 done. */
data class UploadNote(val text: String, val done: Int, val total: Int)

/** [uploading] is the store's (done, total) while a page is going up; [pages] the pages still on this phone. */
fun uploadNote(uploading: Pair<Int, Int>?, pages: Int, tail: String?): UploadNote {
    val (done, total) = uploading ?: (0 to pages)
    if (total <= 0) return UploadNote("Syncing changes", 0, 0)
    val what = "Uploading ${minOf(done + 1, total)} of $total ${if (total == 1) "page" else "pages"}"
    return UploadNote(if (tail != null) "$what to $tail" else what, done.coerceIn(0, total), total)
}

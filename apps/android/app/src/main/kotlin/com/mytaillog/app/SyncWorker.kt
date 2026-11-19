package com.mytaillog.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
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
import java.util.concurrent.TimeUnit

/**
 * Uploads held pages, then pushes the outbox and pulls (05 §9: UploadWorker and SyncWorker as one
 * job, so pages always go before the changes that register them). Runs only with a network; unique
 * names so repeated scheduling never duplicates it. Expedited, and a dataSync foreground job with
 * "Uploading 2 pages to N734DM" while pages are on the phone.
 * shortcut: one queue job rather than one job per file (05 §9); fine for a scan session's pages in order.
 */
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val app = applicationContext as? MyTailLogApp ?: return Result.success()
        val store = app.currentOffline() ?: return Result.success()
        if (store.sync.value.pages > 0) runCatching { setForeground(getForegroundInfo()) }
        val held = store.pageJobs()
        val retry = store.syncNow()
        // Pages that reached storage now get read: follow them in the reading-progress note (05 §12).
        val left = store.pageJobs().map { it.id }.toSet()
        held.filter { it.id !in left }.groupBy { it.aircraftId }.forEach { (id, sent) ->
            ReadingWorker.start(applicationContext, id, sent.map { it.batchId }.distinct(), sent.first().tail)
        }
        // Hourly at least, so the widgets' day counts move past midnight (05 §11.2).
        refreshWidgets(applicationContext)
        return if (retry && runAttemptCount < 20) Result.retry() else Result.success()
    }

    override suspend fun getForegroundInfo(): ForegroundInfo {
        val app = applicationContext as MyTailLogApp
        val store = app.currentOffline()
        val n = store?.sync?.value?.pages ?: 0
        val tail = store?.pageJobs()?.firstOrNull()?.tail
        val text = uploadingText(n, tail)
        val nm = applicationContext.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, applicationContext.getString(R.string.capture_channel), NotificationManager.IMPORTANCE_LOW))
        val note = NotificationCompat.Builder(applicationContext, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_sys_upload)
            .setContentTitle(text)
            .setOngoing(true)
            .setProgress(0, 0, true)
            .build()
        return if (Build.VERSION.SDK_INT >= 29) ForegroundInfo(NOTE_ID, note, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC) else ForegroundInfo(NOTE_ID, note)
    }

    companion object {
        private const val NOW = "sync-now"
        private const val PERIODIC = "sync-periodic"
        private const val CHANNEL = "uploads"
        private const val NOTE_ID = 7342
        private val network = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

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

/** The foreground notification's words (05 §9): "Uploading 2 pages to N734DM". */
fun uploadingText(pages: Int, tail: String?): String {
    val what = if (pages <= 0) "Syncing changes" else "Uploading $pages ${if (pages == 1) "page" else "pages"}"
    return if (tail != null && pages > 0) "$what to $tail" else what
}

package com.mytaillog.app

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.google.android.gms.tasks.Tasks
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import io.ktor.client.HttpClient
import io.ktor.client.request.bearerAuth
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.util.concurrent.TimeUnit

// Notifications (05 §10, §12): channels, the reading-progress note, FCM registration and delivery, and the
// account routes they use. The server's endpoints are the web's (/api/push, /api/me/*); nothing new on the server.

object Channels {
    const val DUE = "due" // the channel_id the server's FCM messages name (api/push/fcm.ts)
    const val PAGES = "pages"
    const val READING = "reading"

    fun ensure(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannels(
            listOf(
                NotificationChannel(DUE, context.getString(R.string.channel_due), NotificationManager.IMPORTANCE_DEFAULT),
                NotificationChannel(PAGES, context.getString(R.string.channel_pages), NotificationManager.IMPORTANCE_DEFAULT),
                NotificationChannel(READING, context.getString(R.string.channel_reading), NotificationManager.IMPORTANCE_LOW),
            ),
        )
    }
}

fun canNotify(context: Context) = Build.VERSION.SDK_INT < 33 ||
    ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

/** Device pref: the notification permission was asked at a scan, so a denial is never asked again (M-SYS-04). */
const val PREF_NOTIFY_ASKED = "notify_asked_at_scan"

/** Ask at the first scan on Android 13+ when notifications aren't allowed and this phone hasn't asked there before. */
fun askNotifyAtScan(sdk: Int, granted: Boolean, asked: Boolean) = sdk >= 33 && !granted && !asked

private fun openIntent(context: Context, link: String?, request: Int): PendingIntent = PendingIntent.getActivity(
    context, request,
    Intent(Intent.ACTION_VIEW, link?.let(Uri::parse), context, MainActivity::class.java),
    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
)

/** A device-local preference (not the account's): FCM token, this phone's reminders switch, reading progress. */
fun devicePrefs(context: Context) = context.getSharedPreferences("platform", Context.MODE_PRIVATE)

// ---------------------------------------------------------------------------------------------
// Reading progress (05 §12): one ongoing note per aircraft while pages are read, then "6 pages are read."

data class ReadingNote(val text: String, val read: Int, val total: Int, val done: Boolean)

private fun pages(n: Int) = if (n == 1) "1 page" else "$n pages"

/** The note's words for the batches uploaded from this phone (05 §12 table), or null when there is nothing to say. */
fun readingNote(batches: List<BatchProgress>): ReadingNote? {
    if (batches.isEmpty()) return null
    val total = batches.sumOf { maxOf(it.expected, it.uploaded) }
    val read = batches.sumOf { it.read }
    val active = batches.sumOf { it.queued + it.reading }
    val waiting = batches.sumOf { it.waitingAllowance }
    val look = batches.sumOf { it.needsLook }
    return when {
        active > 0 -> ReadingNote("Reading ${pages(total)} · $read of $total read", read, total, false)
        waiting > 0 -> ReadingNote("${pages(waiting)} ${if (waiting == 1) "waits" else "wait"} for tomorrow's reading allowance.", read, total, false)
        read > 0 -> {
            val needs = if (look > 0) " $look ${if (look == 1) "needs" else "need"} a look." else ""
            ReadingNote("${pages(read)} ${if (read == 1) "is" else "are"} read.$needs", read, total, true)
        }
        else -> null
    }
}

/**
 * Polls GET /api/aircraft/{id}/reading-queue for the batches this phone uploaded and keeps the note current.
 * shortcut: polled every 15 s for up to 20 minutes instead of FCM data updates (05 §12); upgrade once the
 * reading worker sends "progress" pushes.
 */
class ReadingWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val app = applicationContext as? MyTailLogApp ?: return Result.success()
        val aircraftId = inputData.getString(AIRCRAFT) ?: return Result.success()
        val batches = inputData.getStringArray(BATCHES)?.toSet().orEmpty()
        val tail = inputData.getString(TAIL)
        // A denied permission is respected: no note, and no reason to poll.
        if (!devicePrefs(app).getBoolean(PREF_READING, true) || !canNotify(app)) return Result.success()
        Channels.ensure(app)
        val id = NOTE_BASE + Math.floorMod(aircraftId.hashCode(), 1000)
        var plain = false
        val until = System.currentTimeMillis() + TimeUnit.MINUTES.toMillis(20)
        try {
            while (System.currentTimeMillis() < until) {
                val queue = try { app.captureApi.readingQueue(aircraftId) } catch (e: CancellationException) { throw e } catch (_: Exception) { null }
                val note = queue?.batches?.filter { it.id in batches }?.let(::readingNote)
                if (queue != null && note == null) break
                if (note?.done == true) {
                    // Its own id: the ongoing one goes with the foreground job; this one stays until opened.
                    notify(app, id + DONE_OFFSET, build(app, id + DONE_OFFSET, aircraftId, tail, note))
                    break
                }
                if (note != null) {
                    // Foreground (dataSync) outlives WorkManager's 10-minute cap; Android may refuse it from the background.
                    val n = build(app, id, aircraftId, tail, note)
                    val fg = runCatching {
                        setForeground(ForegroundInfo(id, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC))
                    }.isSuccess
                    if (!fg) { notify(app, id, n); plain = true }
                }
                delay(15_000)
            }
        } finally {
            if (plain) NotificationManagerCompat.from(app).cancel(id)
        }
        return Result.success()
    }

    /** Expedited work needs this before Android 12; the first poll replaces it within seconds. */
    override suspend fun getForegroundInfo(): ForegroundInfo {
        Channels.ensure(applicationContext)
        val id = NOTE_BASE + Math.floorMod((inputData.getString(AIRCRAFT) ?: "").hashCode(), 1000)
        val n = NotificationCompat.Builder(applicationContext, Channels.READING)
            .setSmallIcon(R.drawable.ic_stat_book).setContentTitle(inputData.getString(TAIL)?.let { "Reading pages for $it" } ?: "Reading pages")
            .setOngoing(true).setProgress(0, 0, true).build()
        return ForegroundInfo(id, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    }

    private fun notify(context: Context, id: Int, n: android.app.Notification) {
        try { NotificationManagerCompat.from(context).notify(id, n) } catch (_: SecurityException) {}
    }

    private fun build(context: Context, id: Int, aircraftId: String, tail: String?, n: ReadingNote): android.app.Notification {
        val review = appLink(aircraftId, "review")
        val b = NotificationCompat.Builder(context, if (n.done) Channels.PAGES else Channels.READING)
            .setSmallIcon(R.drawable.ic_stat_book)
            .setContentTitle(n.text)
            .setSubText(tail)
            .setGroup(notificationGroup(review))
            .setOnlyAlertOnce(true)
        if (n.done) {
            b.setAutoCancel(true).setContentIntent(openIntent(context, review, id))
                .addAction(0, context.getString(R.string.read_review), openIntent(context, review, id + 1))
        } else {
            b.setOngoing(true).setProgress(n.total.coerceAtLeast(1), n.read, false)
                .setContentIntent(openIntent(context, appLink(aircraftId, "queue"), id))
        }
        return b.build()
    }

    companion object {
        private const val AIRCRAFT = "aircraft"
        private const val BATCHES = "batches"
        private const val TAIL = "tail"
        private const val NOTE_BASE = 8000
        private const val DONE_OFFSET = 1000
        const val PREF_READING = "reading_progress"

        /** After pages reach storage (SyncWorker): one job per aircraft, replaced by the newest upload. Expedited, so the note starts at once. */
        fun start(context: Context, aircraftId: String, batches: List<String>, tail: String?) {
            val req = OneTimeWorkRequestBuilder<ReadingWorker>()
                .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setInputData(workDataOf(AIRCRAFT to aircraftId, BATCHES to batches.toTypedArray(), TAIL to tail))
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork("reading-$aircraftId", ExistingWorkPolicy.REPLACE, req)
        }
    }
}

// ---------------------------------------------------------------------------------------------
// FCM (05 §10). Firebase is initialised by hand from BuildConfig so only messaging ships; no values, no FCM.

sealed interface PushState {
    data object Unknown : PushState
    data object Registered : PushState
    data object Off : PushState
    data object NotConfigured : PushState
    data class Failed(val reason: String) : PushState
}

object Push {
    const val PREF_ON = "push_on"
    private const val PREF_TOKEN = "push_token"
    val state = MutableStateFlow<PushState>(PushState.Unknown)

    private fun messaging(context: Context): FirebaseMessaging? {
        if (BuildConfig.FIREBASE_APP_ID.isBlank()) return null
        if (FirebaseApp.getApps(context).isEmpty()) {
            val options = FirebaseOptions.Builder()
                .setApplicationId(BuildConfig.FIREBASE_APP_ID)
                .setApiKey(BuildConfig.FIREBASE_API_KEY)
                .setProjectId(BuildConfig.FIREBASE_PROJECT_ID)
                .setGcmSenderId(BuildConfig.FIREBASE_SENDER_ID)
                .build()
            FirebaseApp.initializeApp(context, options)
        }
        return FirebaseMessaging.getInstance()
    }

    /** On sign-in and on every launch (a stale token is a reminder that silently stops arriving), unless turned off here. */
    suspend fun register(context: Context, api: NotifyApi, token: String? = null) {
        if (!devicePrefs(context).getBoolean(PREF_ON, true)) { state.value = PushState.Off; return }
        state.value = try {
            val m = messaging(context) ?: return run { state.value = PushState.NotConfigured }
            val t = token ?: withContext(Dispatchers.IO) { Tasks.await(m.token, 10, TimeUnit.SECONDS) }
            api.registerDevice(t)
            devicePrefs(context).edit().putString(PREF_TOKEN, t).apply()
            PushState.Registered
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            PushState.Failed(e.message ?: e.javaClass.simpleName)
        }
    }

    /** Sign-out and "Reminders on this phone" off: this device only (06 M-SYS-05), with the owner's own session. */
    suspend fun unregister(context: Context, api: NotifyApi) {
        val prefs = devicePrefs(context)
        prefs.getString(PREF_TOKEN, null)?.let { t -> runCatching { api.unregisterDevice(t) } }
        prefs.edit().remove(PREF_TOKEN).apply()
        runCatching { messaging(context)?.let { m -> withContext(Dispatchers.IO) { Tasks.await(m.deleteToken(), 10, TimeUnit.SECONDS) } } }
        state.value = PushState.Off
    }
}

/** A push while the app is open (the system draws the ones that arrive in the background). */
fun showPush(context: Context, title: String, body: String?, deepLink: String?) {
    if (!canNotify(context)) return
    Channels.ensure(context)
    val group = notificationGroup(deepLink)
    val id = (deepLink ?: title).hashCode()
    val note = NotificationCompat.Builder(context, Channels.DUE)
        .setSmallIcon(R.drawable.ic_stat_book)
        .setContentTitle(title)
        .setContentText(body)
        .setStyle(NotificationCompat.BigTextStyle().bigText(body))
        .setContentIntent(openIntent(context, deepLink, id))
        .setAutoCancel(true)
        .setGroup(group)
        .build()
    val summary = NotificationCompat.Builder(context, Channels.DUE)
        .setSmallIcon(R.drawable.ic_stat_book)
        .setGroup(group)
        .setGroupSummary(true)
        .setAutoCancel(true)
        .build()
    try {
        NotificationManagerCompat.from(context).notify(id, note)
        NotificationManagerCompat.from(context).notify(group.hashCode(), summary)
    } catch (_: SecurityException) {}
}

class PushService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        val app = application as MyTailLogApp
        app.scope.launch { if (app.account.accessToken() != null) Push.register(app, app.notifyApi, token) }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val title = message.notification?.title ?: message.data["title"] ?: return
        showPush(this, title, message.notification?.body ?: message.data["body"], message.data[EXTRA_DEEP_LINK])
    }
}

// ---------------------------------------------------------------------------------------------
// Account routes (09 §4.9): inbox, preferences, the test, and the device token.

data class InboxAction(val id: String, val label: String)

data class InboxItem(
    val id: String,
    val aircraftId: String?,
    val title: String,
    val body: String,
    val deepLink: String?,
    val actions: List<InboxAction>,
    val createdAt: String,
    val read: Boolean,
)

fun parseInbox(o: JsonObject): List<InboxItem> = o["items"]?.jsonArray.orEmpty().map { e ->
    val n = e.jsonObject
    fun s(k: String) = n[k]?.jsonPrimitive?.contentOrNull
    InboxItem(
        s("id")!!, s("aircraftId"), s("title") ?: "", s("body") ?: "", s("deepLink"),
        (n["actions"] as? JsonArray).orEmpty().mapNotNull { a ->
            val x = a as? JsonObject ?: return@mapNotNull null
            val id = x["id"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
            InboxAction(id, x["label"]?.jsonPrimitive?.contentOrNull ?: id)
        },
        s("createdAt") ?: "", s("readAt") != null,
    )
}

/** POST /api/me/reminders/test's answer: devices that took the push, and whether the email went. */
data class TestResult(val devices: Int, val email: Boolean)

class NotifyApi(private val http: HttpClient, private val baseUrl: String, private val accessToken: suspend () -> String) {
    private val root get() = baseUrl.trimEnd('/')

    suspend fun inbox(): List<InboxItem> = parseInbox(http.get("$root/api/me/notifications") { bearerAuth(accessToken()) }.json())

    suspend fun markRead(id: String) { post("$root/api/me/notifications/$id", buildJsonObject { put("read", true) }) }

    /** Runs a row action on the server; returns where to go next, if anywhere. */
    suspend fun act(id: String, actionId: String): String? =
        post("$root/api/me/notifications/$id/action", buildJsonObject { put("actionId", actionId) })["deepLink"]?.jsonPrimitive?.contentOrNull

    /** profile.preferences with `alerts` resolved over the defaults. */
    suspend fun preferences(): JsonObject = http.get("$root/api/me/preferences") { bearerAuth(accessToken()) }.json()

    /** Merged by the server per alerts key, so a phone change keeps the web's lead times. */
    suspend fun savePreferences(patch: JsonObject): JsonObject = http.patch("$root/api/me/preferences") {
        bearerAuth(accessToken()); contentType(ContentType.Application.Json); setBody(patch.toString())
    }.json()

    suspend fun test(): TestResult {
        val o = post("$root/api/me/reminders/test", JsonObject(emptyMap()))
        return TestResult(o["devices"]?.jsonPrimitive?.intOrNull ?: 0, o["email"]?.jsonPrimitive?.contentOrNull == "true")
    }

    suspend fun registerDevice(token: String) { post("$root/api/push", device(token)) }

    suspend fun unregisterDevice(token: String) {
        http.delete("$root/api/push") { bearerAuth(accessToken()); contentType(ContentType.Application.Json); setBody(device(token).toString()) }.json()
    }

    private fun device(token: String) = buildJsonObject { put("token", token); put("platform", "android") }

    private suspend fun post(url: String, body: JsonObject): JsonObject = http.post(url) {
        bearerAuth(accessToken()); contentType(ContentType.Application.Json); setBody(body.toString())
    }.json()

    private suspend fun HttpResponse.json(): JsonObject {
        val o = runCatching { Json.parseToJsonElement(bodyAsText()).jsonObject }.getOrNull()
        if (!status.isSuccess()) throw UploadHttpException(status.value, o?.get("error")?.jsonPrimitive?.contentOrNull ?: "The server refused it (${status.value}).")
        return o ?: JsonObject(emptyMap())
    }
}

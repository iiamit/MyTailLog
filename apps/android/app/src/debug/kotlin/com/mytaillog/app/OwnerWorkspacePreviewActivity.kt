package com.mytaillog.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import app.cash.sqldelight.driver.android.AndroidSqliteDriver
import com.mytaillog.core.api.*
import com.mytaillog.core.db.mirror.MirrorDatabase
import com.mytaillog.core.db.outbox.OutboxDatabase
import com.mytaillog.core.domain.*
import com.mytaillog.design.MyTailLogTheme
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.*
import kotlinx.coroutines.*
import java.io.File

/** Deterministic native visual QA. All HTTP uses fixtures; no account, token or live backend is used. */
class OwnerWorkspacePreviewActivity : ComponentActivity() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var store: OfflineStore? = null
    private var client: HttpClient? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val aircraftId = "11111111-1111-4111-a111-111111111111"
        val http = HttpClient(MockEngine { request ->
            val file = when {
                request.url.encodedPath.endsWith("engine-history") -> "engine-history"
                request.url.encodedPath.endsWith("annual-packet") -> "annual-packet"
                request.url.encodedPath.endsWith("inbox") -> "inbox"
                request.url.encodedPath.endsWith("expenses") -> "expenses"
                else -> null
            }
            val failure = intent.getBooleanExtra("error", false)
            respond(if (failure) "{\"error\":\"Preview: connection interrupted. Retry when connected.\"}" else file?.let { assets.open("$it.json").bufferedReader().use { it.readText() } } ?: "{}",
                if (failure) HttpStatusCode.ServiceUnavailable else HttpStatusCode.OK, headersOf(HttpHeaders.ContentType, "application/json"))
        }).also { client = it }
        val api = RecordsApi(http, "https://fixture.invalid", "https://fixture.invalid", "fixture") { "fixture" }
        val dir = File(cacheDir, "owner-workspace-preview").apply { mkdirs() }
        val offline = OfflineStore("fixture", dir,
            AndroidSqliteDriver(MirrorDatabase.Schema, this, null), AndroidSqliteDriver(OutboxDatabase.Schema, this, null),
            object : SyncApi {
                override suspend fun pull(cursor: Long, limit: Int) = PullPage(emptyList(), cursor, false)
                override suspend fun push(mutations: List<Mutation>) = emptyList<PushResult>()
                override suspend fun resolveConflict(mutationId: String, resolution: String) {}
            }, object : PageUploads {
                override suspend fun target(aircraftId: String, kind: String, pageId: String, logbookId: String, bytes: Long): UploadTarget? = null
                override suspend fun put(target: UploadTarget, bytes: ByteArray) {}
            }, api).also { store = it }
        val component = json("id" to "22222222-2222-4222-a222-222222222222", "aircraft_id" to aircraftId, "category" to "engine", "name" to "Lycoming", "serial_number" to "SN123", "is_installed" to true, "updated_at" to "2026-11-25T00:00:00Z")
        offline.mirror.upsertRow("component", component)
        offline.mirror.upsertRow("aircraft", json("id" to aircraftId, "tail_number" to "N734QA", "owner_id" to "fixture", "is_demo" to false))
        val isOffline = intent.getBooleanExtra("offline", false)
        if (isOffline) {
            File(dir, "engine-history/$aircraftId.json").apply { parentFile?.mkdirs(); writeText(assets.open("engine-history.json").bufferedReader().use { it.readText() }) }
            offline.setOnline(false)
        }
        val access = AircraftAccess(AircraftSummary(aircraftId, "N734QA", "fixture"), if (intent.getBooleanExtra("viewer", false)) AircraftRole.Viewer else AircraftRole.Owner)
        val status = StatusHost(StatusUi(listOf(access), aircraftId, loading = false), {}, {})
        val capture = CaptureHost(offline, CaptureApi(http, "https://fixture.invalid") { "fixture" }, this) { scope.launch { offline.syncNow() } }
        val route = when (intent.getStringExtra("screen")) {
            "inbox" -> Routes.DOCUMENT_INBOX
            "expenses" -> Routes.EXPENSES
            "annual" -> Routes.ANNUAL_PACKET
            else -> Routes.ENGINE_HISTORY
        }
        setContent { MyTailLogTheme { Shell(status = status, capture = capture, records = api, initialLanding = Landing(Destination.Aircraft, route)) } }
    }

    override fun onDestroy() {
        scope.cancel()
        val previous = store
        if (previous != null) CoroutineScope(Dispatchers.IO).launch { previous.close(); client?.close() }
        super.onDestroy()
    }
}

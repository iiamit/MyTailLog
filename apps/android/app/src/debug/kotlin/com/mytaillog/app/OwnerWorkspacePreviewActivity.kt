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
        if (intent.getStringExtra("screen") == "identity") { identityPreview(); return }
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


    private fun identityPreview() {
        val aircraftId = "11190000-0000-4000-a000-000000000001"
        val bookId = "11190000-0000-4000-a000-000000000002"
        val pageId = "11190000-0000-4000-a000-000000000003"
        val map = parseMap("""{"today":"2026-11-25","range":{"from":"2000-01-01","to":"2027-01-01","scaleBreak":null},"lines":[],"stops":[],"interchanges":[],"gaps":[],"eras":[],"squawks":[],"rings":[],"visits":[],"undatedEntries":0}""")
        var books = Books(map, emptyList(), listOf(PageRow(pageId, bookId, 1, contentKinds = listOf("identity"), extractionStatus = "extracted",
            identitySuggestions = listOf(IdentitySuggestion("a".repeat(24), "aircraft", "Aircraft identification", mapOf("serial_number" to "000123"), "Airframe serial number: 000123", 0.9)), updatedAt = "2026-11-25T12:00:00Z")), listOf(LogbookRow(bookId, "airframe")), emptyList(), listOf(IdentityTarget(aircraftId, "2026-11-25T12:00:00Z", tailNumber = "N119QA")))
        val image = android.graphics.Bitmap.createBitmap(800, 1100, android.graphics.Bitmap.Config.ARGB_8888)
        val canvas = android.graphics.Canvas(image)
        canvas.drawColor(android.graphics.Color.WHITE)
        val paint = android.graphics.Paint().apply { color = android.graphics.Color.BLACK; textSize = 30f; isAntiAlias = true }
        listOf("AIRCRAFT LOGBOOK", "", "Aircraft identification", "", "Registration: N119QA", "Airframe serial number: 000123", "", "Original equipment record", "", "Synthetic test page").forEachIndexed { i, text -> canvas.drawText(text, 70f, 100f + i * 55f, paint) }
        val bytes = java.io.ByteArrayOutputStream().also { image.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }.toByteArray()
        val vm = BooksViewModel(load = { books }, push = { changes ->
            changes.map { m ->
                val decision = m.payload["decision"] as? kotlinx.serialization.json.JsonObject
                val current = books.pages.single()
                books = books.copy(pages = listOf(if (m.type == "page.details") current.copy(identitySuggestions = current.identitySuggestions.map { it.copy(status = if (decision?.get("action").toString().contains("dismiss")) "dismissed" else "accepted") }, updatedAt = "2026-11-25T12:00:01Z") else current.copy(reviewStatus = "confirmed", updatedAt = "2026-11-25T12:00:02Z")))
                PushResult(m.id, PushResult.Status.Ok, json("updated_at" to books.pages.single().updatedAt))
            }
        }, loadEvidence = { _, _ -> GapEvidence(emptyList(), verdict = "") }, loadImage = { _, _ -> bytes })
        vm.show(AircraftAccess(AircraftSummary(aircraftId, "N119QA", "fixture"), if (intent.getBooleanExtra("viewer", false)) AircraftRole.Viewer else AircraftRole.Owner))
        setContent { MyTailLogTheme {
            androidx.compose.foundation.layout.BoxWithConstraints {
                ReviewScreen(vm, pageId, BooksNav(), wide = isTablet(maxWidth.value.toInt(), maxHeight.value.toInt()))
            }
        } }
    }

    override fun onDestroy() {
        scope.cancel()
        val previous = store
        if (previous != null) CoroutineScope(Dispatchers.IO).launch { previous.close(); client?.close() }
        super.onDestroy()
    }
}

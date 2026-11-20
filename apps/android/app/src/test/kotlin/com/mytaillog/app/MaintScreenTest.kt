package com.mytaillog.app

import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasScrollToNodeAction
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isSelectable
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import androidx.work.testing.WorkManagerTestInitHelper
import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import com.mytaillog.core.api.AircraftAccess
import com.mytaillog.core.api.AircraftRole
import com.mytaillog.core.api.AircraftSummary
import com.mytaillog.core.api.SyncApi
import com.mytaillog.core.db.mirror.MirrorDatabase
import com.mytaillog.core.db.outbox.OutboxDatabase
import com.mytaillog.core.domain.Mutation
import com.mytaillog.core.domain.PullPage
import com.mytaillog.core.domain.PushResult
import com.mytaillog.design.MyTailLogTheme
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respondError
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.io.IOException

/** 06 M-MAINT-01/02/03/05, M-AIRCRAFT-01, M-DOCS-01 on the phone: read from the mirror, writes into the outbox. */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
class MaintScreenTest {
    @get:Rule val compose = createComposeRule()
    @get:Rule val tmp = TemporaryFolder()

    private val snap = sampleSnapshot()
    private val id = snap.body.aircraftId
    private val owner = AircraftAccess(AircraftSummary(id, "N734QA", "u1"), AircraftRole.Owner)
    private lateinit var store: OfflineStore

    private val offline = object : SyncApi {
        override suspend fun pull(cursor: Long, limit: Int): PullPage = throw IOException("offline")
        override suspend fun push(mutations: List<Mutation>): List<PushResult> = throw IOException("offline")
        override suspend fun resolveConflict(mutationId: String, resolution: String) {}
    }

    private fun row(table: String, vararg kv: Pair<String, Any?>) = store.mirror.upsertRow(table, JsonObject(json("aircraft_id" to id, "updated_at" to "2026-11-01T00:00:00Z", *kv)))

    @Before
    fun setUp() {
        val app = RuntimeEnvironment.getApplication()
        WorkManagerTestInitHelper.initializeTestWorkManager(app)
        Class.forName("org.sqlite.JDBC")
        store = OfflineStore(
            "u1", tmp.root,
            JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY).also { MirrorDatabase.Schema.create(it) },
            JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY).also { OutboxDatabase.Schema.create(it) },
            offline, object : PageUploads {
                override suspend fun target(aircraftId: String, kind: String, pageId: String, logbookId: String, bytes: Long): UploadTarget? = null
                override suspend fun put(target: UploadTarget, bytes: ByteArray) {}
            },
        )
        store.setOnline(false)
        store.mirror.upsertRow("aircraft", buildJsonObject { put("id", id); put("tail_number", "N734QA"); put("make", "Cessna"); put("model", "172N"); put("year", 1978) })
        row("squawk", "id" to "s1", "description" to "Left brake feels soft\nWorse after a long taxi", "severity" to "medium", "status" to "open", "reported_at" to "2026-11-09T10:00:00Z", "reporter_name" to "Dana Morgan")
        row("ad_compliance", "id" to "ad1", "kind" to "ad", "reference" to "2011-10-09", "title" to "Seat rails", "recurring" to true, "interval_hours" to 100, "status" to "complied", "complied_date" to "2026-07-14", "complied_hours" to 4168.3, "next_due_hours" to 4268.3)
        row("weight_balance", "id" to "w1", "revision_date" to "2019-05-01", "empty_weight" to 1447.8, "empty_weight_arm" to 39.61, "max_gross_weight" to 2300)
        row("component", "id" to "c1", "name" to "Rapco vacuum pump", "part_number" to "RA215CC", "install_date" to "2021-03-02", "is_installed" to true)
        row("document", "id" to "d1", "type" to "registration", "title" to "Registration", "mime_type" to "application/pdf", "expires_on" to "2029-03-31", "created_at" to "2026-01-05T00:00:00Z")
    }

    private fun tab(label: String) = compose.onNode(hasText(label) and isSelectable())

    private fun show() {
        val app = RuntimeEnvironment.getApplication()
        val http = HttpClient(MockEngine { respondError(HttpStatusCode.ServiceUnavailable) })
        val capture = CaptureHost(store, CaptureApi(http, "https://x") { "" }, app)
        val records = RecordsApi(http, "https://x", "https://s", "k") { "" }
        val status = StatusHost(StatusUi(listOf(owner), id, snap, loading = false), refresh = {}, select = {})
        compose.setContent { MyTailLogTheme(dark = false) { Shell(status = status, capture = capture, records = records) } }
    }

    @Test
    fun squawksOpenFirstAndResolvingAsksForTheDateThenQueues() {
        show()
        tab("Maint.").performClick()
        compose.onNodeWithText("Squawks 1").assertExists()
        compose.onNodeWithText("Left brake feels soft").assertExists()
        val daysAgo = java.time.temporal.ChronoUnit.DAYS.between(java.time.LocalDate.parse("2026-11-09"), java.time.LocalDate.now())
        compose.onNodeWithText("Watch · $daysAgo days ago · Dana", substring = true).assertExists()
        compose.onNodeWithText("Left brake feels soft").performClick()
        compose.onNodeWithText("Open · Watch").assertExists()
        compose.onNodeWithText("Mark resolved").performClick()
        compose.onNodeWithText("When was it fixed?").assertExists()
        compose.onNodeWithText("Resolve").performClick()
        compose.waitForIdle()
        assertEquals(listOf("squawk.resolve"), store.queued().map { it.type })
        compose.onNodeWithText("Resolved · Watch").assertExists() // shown at once, from the outbox
        compose.onNodeWithText("On this phone").assertExists()
    }

    @Test
    fun aSquawkCanBeFiledWithNoPhotoAndSeverityHasNoDefault() {
        show()
        tab("Maint.").performClick()
        compose.onNodeWithText("Squawks 1").performClick()
        compose.onNode(hasContentDescription("Add", substring = true)).performClick() // on Squawks it opens the new squawk directly
        compose.onNodeWithText("Photograph it first. You can skip this.").assertExists()
        compose.onNodeWithText("Skip photo", substring = true).performClick()
        compose.onNode(hasSetTextAction()).performTextInput("Nav light lens cracked")
        assertEquals(true, compose.onNodeWithText("Add squawk").fetchSemanticsNode().config.contains(androidx.compose.ui.semantics.SemanticsProperties.Disabled))
        compose.onNodeWithText("Watch").performScrollTo().performClick()
        compose.onNodeWithText("Add squawk").performClick()
        compose.waitForIdle()
        val m = store.queued().single()
        assertEquals("squawk.create", m.type)
        assertEquals(true, m.payload.contains("\"severity\":\"medium\""))
    }

    @Test
    fun adsSayWhenTheyRecurAndAircraftShowsItsSources() {
        show()
        tab("Maint.").performClick()
        compose.onNodeWithText("ADs").performClick()
        compose.onNodeWithText("Recurring, every 100 hours. Complied Jul 14, 2026 at 4168.3", substring = true).assertExists()
        tab("Aircraft").performClick()
        compose.onNodeWithText("May be stale: Rapco vacuum pump (2021) came after this revision.").performScrollTo()
        compose.onNodeWithText("1 in the vault").performScrollTo().performClick()
        compose.onNodeWithText("3 missing", substring = true).assertExists()
        compose.onNodeWithText("Registration").assertExists()
        compose.onNodeWithText("Expires Mar 31, 2029", substring = true).assertExists()
    }
}

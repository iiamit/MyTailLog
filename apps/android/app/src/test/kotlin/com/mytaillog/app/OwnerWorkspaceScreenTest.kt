package com.mytaillog.app

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import com.mytaillog.core.api.*
import com.mytaillog.core.db.mirror.MirrorDatabase
import com.mytaillog.core.db.outbox.OutboxDatabase
import com.mytaillog.core.domain.*
import com.mytaillog.design.MyTailLogTheme
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.*
import kotlinx.serialization.json.*
import org.junit.*
import org.junit.Assert.*
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** The same native routes on phones and tablets, with deterministic server answers and no live writes. */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
class OwnerWorkspaceScreenTest {
    @get:Rule val compose = createComposeRule()
    @get:Rule val tmp = TemporaryFolder()
    private lateinit var store: OfflineStore
    private val calls = mutableListOf<String>()
    private val requestUrls = mutableListOf<String>()
    private val aircraft = "11111111-1111-4111-a111-111111111111"
    private val component = "22222222-2222-4222-a222-222222222222"
    private val route = mutableStateOf(Routes.ENGINE_HISTORY)

    @Before fun prepare() {
        Class.forName("org.sqlite.JDBC")
        store = OfflineStore("test", tmp.root,
            JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY).also { MirrorDatabase.Schema.create(it) },
            JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY).also { OutboxDatabase.Schema.create(it) },
            object : SyncApi {
                override suspend fun pull(cursor: Long, limit: Int) = PullPage(emptyList(), cursor, false)
                override suspend fun push(mutations: List<Mutation>) = emptyList<PushResult>()
                override suspend fun resolveConflict(mutationId: String, resolution: String) {}
            }, object : PageUploads {
                override suspend fun target(aircraftId: String, kind: String, pageId: String, logbookId: String, bytes: Long): UploadTarget? = null
                override suspend fun put(target: UploadTarget, bytes: ByteArray) {}
            })
    }

    private fun fixture(name: String) = javaClass.getResource("/owner-workspace/$name.json")!!.readText()

    private fun show(start: String, role: AircraftRole = AircraftRole.Owner, tablet: Boolean = false) {
        route.value = start
        val client = HttpClient(MockEngine { request ->
            val path = request.url.encodedPath
            calls += "${request.method.value} $path"
            requestUrls += request.url.toString()
            val answer = when {
                path.endsWith("engine-history") -> fixture("engine-history")
                path.endsWith("annual-packet") -> fixture("annual-packet")
                path.endsWith("inbox") -> fixture("inbox")
                path.endsWith("expenses") && request.method == HttpMethod.Get -> {
                    if (request.url.parameters["from"] == null) fixture("expenses") else {
                        val start = request.url.parameters["from"]!!
                        val end = request.url.parameters["to"]!!
                        json("canManage" to true,
                            "expenses" to JsonArray(listOf(json("id" to "period-expense", "date" to start, "currency" to "USD", "amount_minor" to 5000, "category" to "oil", "basis" to "actual", "cost_type" to "variable", "vendor" to "Period shop"))),
                            "totals" to JsonArray(listOf(json("currency" to "USD", "actual_minor" to 5000, "reserve_minor" to 0, "actual_per_hour_minor" to 500))),
                            "period" to json("from" to start, "to" to end),
                            "denominator" to json("hours" to 10, "meter" to "tach", "from" to start, "to" to end, "source" to "Reviewed boundary tach readings for the applied period.")
                        ).toString()
                    }
                }
                else -> "{}"
            }
            respond(answer, headers = headersOf(HttpHeaders.ContentType, "application/json"))
        })
        val api = RecordsApi(client, "https://test.example", "https://test.supabase.co", "public") { "test-token" }
        val access = AircraftAccess(AircraftSummary(aircraft, "N734QA", "test"), role)
        val recs = Recs(store, api, access, null, {}, { "" })
        compose.setContent { MyTailLogTheme(dark = false) {
            CompositionLocalProvider(LocalRecNav provides RecNav({ route.value = it }, { route.value = start }, tablet)) { RecordsRoute(recs, route.value) }
        } }
    }

    private fun awaitText(label: String) {
        compose.waitUntil(5000) { compose.onAllNodesWithText(label).fetchSemanticsNodes().isNotEmpty() }
    }

    @Test fun engineSelectionKeepsOverhaulPeriodsSeparateAndFullReferencesVisible() {
        show(Routes.ENGINE_HISTORY)
        awaitText("single · Lycoming · SN123 · 2026-01-01 → present")
        compose.onNodeWithText("Engine", useUnmergedTree = true).performClick()
        compose.onNodeWithText("single · Lycoming · SN123 · 2020-01-01 → 2026-01-01").performClick()
        compose.onNodeWithText("C1: 76/80 · C2: 65/70").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("2026-05-01").assertDoesNotExist()
        compose.onNodeWithText("Engine", useUnmergedTree = true).performScrollTo().performClick()
        compose.onNodeWithText("single · Lycoming · SN123 · 2026-01-01 → present").performClick()
        compose.onNodeWithText("C1: 78/80").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("2025-06-01").assertDoesNotExist()
    }

    @Test @Config(qualifiers = "w891dp-h411dp-land")
    fun landscapeAnnualEvidenceIsScrollableAndNeverSelectedByDefault() {
        show(Routes.ANNUAL_PACKET)
        awaitText("Airframe p. 12")
        compose.onNodeWithText("Airframe p. 12").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Share selected evidence ZIP").performScrollTo().assertIsNotEnabled()
        compose.onNodeWithText("Airframe p. 12").performScrollTo().performClick()
        compose.onNodeWithText("Share selected evidence ZIP").performScrollTo().assertIsEnabled()
    }

    @Test @Config(qualifiers = "w1280dp-h800dp-land")
    fun tabletInboxOpensNativeEditableInvoiceReview() {
        show(Routes.DOCUMENT_INBOX, tablet = true)
        awaitText("Annual invoice.pdf")
        compose.onNodeWithText("Annual invoice.pdf").performScrollTo().performClick()
        compose.onNodeWithText("Invoice amount").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("123.45").assertExists()
        compose.onNodeWithText("Approve routing").performScrollTo().assertIsDisplayed()
    }

    @Test fun aSourceNotYetLoadedOffersRecoveryInsteadOfABlankScreen() {
        show(Routes.of(Routes.SOURCE_ENTRY, "not-synced-yet"))
        compose.onNodeWithText("This source has not reached this phone's logbooks yet. Refresh records to load it.").assertIsDisplayed()
        compose.onNodeWithText("Refresh records").assertIsDisplayed()
    }

    @Test fun viewersNeverRequestOrRenderFinancialRecords() {
        show(Routes.EXPENSES, AircraftRole.Viewer)
        compose.onNodeWithText("Financial records are private to the aircraft owner.").assertIsDisplayed()
        compose.onNodeWithText("Add expense").assertDoesNotExist()
        assertFalse(calls.any { it.endsWith("expenses") })
    }

    @Test @Config(qualifiers = "w891dp-h411dp-land")
    fun costPeriodRequestsMatchingRowsUsageAndCsvInLandscape() {
        show(Routes.EXPENSES)
        awaitText("Recorded 123.45 · reserves 0.00")
        compose.onNodeWithText("Apply period").performScrollTo().performClick()
        awaitText("Recorded 50.00 · reserves 0.00")
        compose.onNodeWithText("About USD 5.00 per measured hour · spending within the measured dates").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Reviewed boundary tach readings for the applied period.").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("USD 50.00 · Period shop").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("USD 123.45 · Maintenance shop").assertDoesNotExist()
        val periodUrl = requestUrls.last { "from=" in it }
        val query = Url(periodUrl).parameters
        assertEquals(java.time.LocalDate.now().withDayOfYear(1).toString(), query["from"])
        assertEquals(java.time.LocalDate.now().toString(), query["to"])
        compose.onNodeWithText("Export expense CSV").performScrollTo().performClick()
        compose.waitUntil(5000) { requestUrls.any { "format=csv" in it } }
        val csv = Url(requestUrls.last { "format=csv" in it }).parameters
        assertEquals(query["from"], csv["from"])
        assertEquals(query["to"], csv["to"])
        compose.waitUntil(5000) { compose.onAllNodes(hasText("Show all dates") and isEnabled()).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithText("Show all dates").performScrollTo().performClick()
        awaitText("Recorded 123.45 · reserves 0.00")
        compose.onNodeWithText("About USD 5.00 per measured hour · spending within the measured dates").assertDoesNotExist()
    }

    @Test fun costLedgerShowsActualTotalsAndKeepsAnAddDraftOnScreen() {
        show(Routes.EXPENSES)
        awaitText("Recorded 123.45 · reserves 0.00")
        compose.onNodeWithText("Recorded 123.45 · reserves 0.00").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Add expense").performScrollTo().performClick()
        compose.onNodeWithText("Amount").performTextInput("12.345")
        compose.onNodeWithText("Save expense").performScrollTo().assertIsNotEnabled()
        compose.onNodeWithText("Amount").performScrollTo().performTextClearance()
        compose.onNodeWithText("Amount").performTextInput("12.34")
        compose.onNodeWithText("Save expense").performScrollTo().assertIsEnabled()
    }
}

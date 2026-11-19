package com.mytaillog.app

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.work.testing.WorkManagerTestInitHelper
import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import com.mytaillog.core.api.SyncApi
import com.mytaillog.core.db.mirror.MirrorDatabase
import com.mytaillog.core.db.outbox.OutboxDatabase
import com.mytaillog.core.domain.Mutation
import com.mytaillog.core.domain.PullPage
import com.mytaillog.core.domain.PushResult
import com.mytaillog.core.sync.RowRef
import com.mytaillog.design.MyTailLogTheme
import com.mytaillog.design.Section
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/** M-SYS-01: conflicts as yours beside theirs, refusals with their reason, waiting changes by label. */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
class SyncScreenTest {
    @get:Rule val compose = createComposeRule()
    @get:Rule val tmp = TemporaryFolder()

    private val server = object : SyncApi {
        override suspend fun pull(cursor: Long, limit: Int) = PullPage(emptyList(), cursor, false)
        override suspend fun push(mutations: List<Mutation>) = mutations.map { m ->
            when (m.type) {
                "squawk.update" -> PushResult(m.id, PushResult.Status.Conflict, buildJsonObject { put("id", "s1"); put("status", "resolved"); put("updated_at", "t2") })
                "entry.delete" -> PushResult(m.id, PushResult.Status.Error, error = "You don't have edit access to N4321J.")
                else -> PushResult(m.id, PushResult.Status.Ok)
            }
        }
        override suspend fun resolveConflict(mutationId: String, resolution: String) {}
    }

    @Test
    fun listsConflictsRefusalsAndWaitingChanges() {
        val app = RuntimeEnvironment.getApplication()
        WorkManagerTestInitHelper.initializeTestWorkManager(app)
        val store = OfflineStore(
            "u1", tmp.root,
            JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY).also { MirrorDatabase.Schema.create(it) },
            JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY).also { OutboxDatabase.Schema.create(it) },
            server, object : PageUploads {
                override suspend fun target(aircraftId: String, kind: String, pageId: String, logbookId: String, bytes: Long): UploadTarget? = null
                override suspend fun put(target: UploadTarget, bytes: ByteArray) {}
            },
        )
        store.enqueue(Mutation("c1", "squawk.update", "a1", buildJsonObject { put("squawkId", "s1"); put("status", "open") }, base = "t1"), "Squawk: Left brake feels soft", RowRef("squawk", "s1"))
        store.enqueue(Mutation("r1", "entry.delete", "a1", buildJsonObject { put("entryId", "e9") }, base = "t1"), "Logbook entry", RowRef("log_entry", "e9"))
        runBlocking { store.syncNow() }
        store.setOnline(false)
        store.enqueue(Mutation("w1", "reading.create", "a1", buildJsonObject { put("id", "w1"); put("tach", 4214.8) }), "Flight, tach 4212.4 to 4214.8", RowRef("hours_reading", "w1"))

        val host = CaptureHost(store, CaptureApi(com.mytaillog.core.api.createHttpClient(), "https://x") { "" }, app)
        compose.setContent { MyTailLogTheme(dark = false) { WaitingScreen(host, Section.Status, "Status") {} } }

        compose.onNodeWithText("1 change on this phone.").assertExists()
        compose.onNodeWithText("Squawk: Left brake feels soft").assertExists()
        compose.onNodeWithText("Yours: open").assertExists()
        compose.onNodeWithText("Theirs: resolved").assertExists()
        compose.onNodeWithText("You don't have edit access to N4321J.").performScrollTo().assertExists()
        compose.onNodeWithText("Flight, tach 4212.4 to 4214.8").performScrollTo().assertExists()

        compose.onNodeWithText("Take theirs").performScrollTo().performClick()
        compose.waitUntil(5_000) { store.sync.value.conflicts == 0L }
        assertEquals(0L, store.sync.value.conflicts)
        compose.onNodeWithText("Took theirs. Yours is discarded.").assertExists()
    }
}

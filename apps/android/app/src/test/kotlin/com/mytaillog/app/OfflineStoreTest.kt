package com.mytaillog.app

import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import com.mytaillog.core.api.ApiHttpException
import com.mytaillog.core.api.SyncApi
import com.mytaillog.core.db.mirror.MirrorDatabase
import com.mytaillog.core.db.outbox.OutboxDatabase
import com.mytaillog.core.domain.Mutation
import com.mytaillog.core.domain.PullPage
import com.mytaillog.core.domain.PushResult
import com.mytaillog.core.sync.Resolution
import com.mytaillog.core.sync.RowRef
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.io.IOException
import java.util.Properties

/**
 * The offline store against real SQLite files, a fake server and fake storage: airplane mode,
 * kill during upload, permanent refusals and conflicts (13 §5 phase 3 exit criteria).
 */
class OfflineStoreTest {
    @get:Rule val tmp = TemporaryFolder()

    /** Storage: what objects exist; [offline] makes every call fail like airplane mode. */
    private class FakeStorage : PageUploads {
        val objects = mutableMapOf<String, Int>()
        var offline = false
        var refuse: UploadHttpException? = null
        /** The PUT lands but the response is lost (the process is killed, or the network drops). */
        var loseResponse = false
        var puts = 0

        override suspend fun target(aircraftId: String, kind: String, pageId: String, logbookId: String, bytes: Long): UploadTarget? {
            if (offline) throw IOException("Unable to resolve host")
            refuse?.let { throw it }
            val path = "$aircraftId/$logbookId/$pageId.jpg" + if (kind == "page_thumb") ".thumb" else ""
            return if (path in objects) null else UploadTarget("https://storage/$path", emptyMap(), path)
        }

        override suspend fun put(target: UploadTarget, bytes: ByteArray) {
            if (offline) throw IOException("Unable to resolve host")
            puts++
            objects[target.storagePath] = bytes.size
            if (loseResponse) { loseResponse = false; throw IOException("Connection reset") }
        }
    }

    /** The server: accepts everything (rows echo the payload ids) unless told to conflict. */
    private class FakeServer : SyncApi {
        var offline = false
        val received = mutableListOf<Mutation>()
        var conflictOn: String? = null
        override suspend fun pull(cursor: Long, limit: Int) = if (offline) throw IOException("offline") else PullPage(emptyList(), cursor, false)
        override suspend fun push(mutations: List<Mutation>): List<PushResult> {
            if (offline) throw IOException("offline")
            received += mutations
            return mutations.map { m ->
                if (m.type == conflictOn) PushResult(m.id, PushResult.Status.Conflict, buildJsonObject { put("id", "e1"); put("description", "Theirs"); put("updated_at", "t2") })
                else PushResult(m.id, PushResult.Status.Ok, buildJsonObject { put("id", (m.payload["id"] as? JsonPrimitive)?.content ?: m.id); put("aircraft_id", m.aircraftId) })
            }
        }
        override suspend fun resolveConflict(mutationId: String, resolution: String) {}
    }

    private val storage = FakeStorage()
    private val server = FakeServer()
    /** The engine backs off after a failed push (5 s, 10 s, …); tests move the clock past it. */
    private var clock = 1_000_000L
    private val target = ScanTarget("a1", "N734QA", "b1", "Airframe", handwritten = true)

    private fun open(dir: File = tmp.root): OfflineStore {
        val mirror = JdbcSqliteDriver("jdbc:sqlite:${File(dir, "mirror.db").path}", Properties(), MirrorDatabase.Schema)
        val outbox = JdbcSqliteDriver("jdbc:sqlite:${File(dir, "outbox.db").path}", Properties(), OutboxDatabase.Schema)
        return OfflineStore("u1", dir, mirror, outbox, server, storage) { clock }
    }

    private fun OfflineStore.capture(batch: String, n: Int) = (1..n).map { addPage(target, batch, ByteArray(1000) { 1 }, ByteArray(100), "00ff00ff00ff00ff") }

    @Test
    fun airplaneModeKeepsEveryPageAndUploadsThemOnReconnect() = runTest {
        val store = open()
        storage.offline = true; server.offline = true
        val batch = store.newBatchId()
        store.capture(batch, 3)
        store.finishSession(batch)
        assertTrue("a retry is asked for", store.syncNow())
        assertEquals(3, store.sync.value.pages)
        assertEquals(0, store.sync.value.failedPages) // no signal is not a failure
        assertEquals(1L, store.sync.value.waiting) // batch.create waits; registers come after the upload

        storage.offline = false; server.offline = false
        clock += 3_600_000
        assertFalse(store.syncNow())
        assertEquals(0, store.sync.value.pages)
        assertEquals(0L, store.sync.value.waiting)
        assertEquals(listOf("batch.create", "page.register", "page.register", "page.register"), server.received.map { it.type })
        assertEquals(3, server.received.first().payload["expectedPages"].toString().toInt())
        assertEquals(6, storage.objects.size) // pages and thumbnails
        assertTrue(store.pagesDir.listFiles()!!.isEmpty()) // files go once storage has them
    }

    @Test
    fun aKillDuringUploadLosesNothingAndUploadsOnce() = runTest {
        var store = open()
        val batch = store.newBatchId()
        store.capture(batch, 2)
        // Killed mid-scan: Done never ran. The PUT of the first thumbnail lands, its response doesn't.
        storage.loseResponse = true
        store.syncNow()
        store.close()

        store = open() // the next launch recovers the scan ("Keep them" by default)
        assertEquals(2, store.sync.value.pages)
        assertFalse(store.syncNow())
        assertEquals(0, store.sync.value.pages)
        assertEquals(listOf("batch.create", "page.register", "page.register"), server.received.map { it.type })
        assertEquals(4, storage.objects.size)
        assertEquals("nothing was uploaded twice", 4, storage.puts)
    }

    @Test
    fun aRefusedUploadGivesUpWithItsReasonAndCanBeRetried() = runTest {
        val store = open()
        val batch = store.newBatchId()
        store.capture(batch, 1)
        store.finishSession(batch)
        storage.refuse = UploadHttpException(413, "Too large to upload. Retake at a lower size or upload from a computer.")
        assertFalse(store.syncNow())
        val job = store.pageJobs().single()
        assertTrue(job.gaveUp)
        assertEquals("Too large to upload. Retake at a lower size or upload from a computer.", job.error)
        assertEquals(1, store.sync.value.failedPages)

        storage.refuse = null
        store.retryPage(job.id)
        assertFalse(store.syncNow())
        assertTrue(store.pageJobs().isEmpty())
    }

    @Test
    fun aDiscardedPageNeverUploads() = runTest {
        val store = open()
        val batch = store.newBatchId()
        val (job, _) = store.capture(batch, 2).first()
        store.discardPage(job)
        store.finishSession(batch)
        store.syncNow()
        assertEquals(1, server.received.count { it.type == "page.register" })
        assertEquals(1, server.received.single { it.type == "batch.create" }.payload["expectedPages"].toString().toInt())
    }

    @Test
    fun aConflictWaitsForTheOwnerAndTakeTheirsDropsTheChange() = runTest {
        val store = open()
        server.conflictOn = "entry.update"
        val m = Mutation("m1", "entry.update", "a1", buildJsonObject { put("entryId", "e1"); put("fields", buildJsonObject { put("description", "Mine") }) }, base = "t1")
        store.enqueue(m, "Logbook entry", RowRef("log_entry", "e1"))
        store.syncNow()
        assertEquals(1L, store.sync.value.conflicts)
        assertEquals("description", store.engine.diff("m1").single().field)
        // A later change to the same row waits behind it.
        store.enqueue(Mutation("m2", "entry.update", "a1", m.payload, base = "t1"), "Logbook entry", RowRef("log_entry", "e1"))
        server.received.clear()
        store.syncNow()
        assertTrue(server.received.none { it.id == "m2" })

        store.resolve("m1", Resolution.TakeTheirs)
        assertEquals(0L, store.sync.value.conflicts)
        assertEquals("Theirs", (store.mirror.raw("log_entry", "e1")!!["description"] as JsonPrimitive).content)
    }

    @Test
    fun aTachReadingSavedOfflineShowsOnThePhoneUntilItLands() = runTest {
        val store = open()
        server.offline = true
        store.enqueue(Mutation("r1", "reading.create", "a1", buildJsonObject { put("id", "r1"); put("tach", 4214.8); put("source", "tach_photo"); put("ocrValue", 4214.8) }), "Flight, tach 4212.4 to 4214.8", RowRef("hours_reading", "r1"))
        store.syncNow()
        assertEquals(4214.8, store.localTach("a1")!!, 0.0)
        assertEquals(LastTach(4214.8, java.time.LocalDate.now().toString(), onPhone = true), lastTach(null, store, "a1"))
        server.offline = false
        clock += 3_600_000
        store.syncNow()
        assertEquals(null, store.localTach("a1"))
    }

    @Test
    fun lastKnownServesTheCachedCopyOnlyWhenOffline() = runTest {
        val f = File(tmp.root, "cache/x.json")
        assertEquals("one", lastKnown(f, { "one" }, { it }, { it }))
        assertEquals("one", lastKnown(f, { throw IOException("offline") }, { it }, { it }))
        val refused = runCatching { lastKnown<String>(f, { throw ApiHttpException(403, "no") }, { it }, { it }) }.exceptionOrNull()
        assertTrue(refused is ApiHttpException)
    }

    @Suppress("unused")
    private fun JsonObject.str(k: String) = (this[k] as JsonPrimitive).content
}

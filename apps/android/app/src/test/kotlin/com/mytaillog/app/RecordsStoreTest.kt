package com.mytaillog.app

import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import com.mytaillog.core.api.SyncApi
import com.mytaillog.core.db.mirror.MirrorDatabase
import com.mytaillog.core.db.outbox.OutboxDatabase
import com.mytaillog.core.domain.Mutation
import com.mytaillog.core.domain.PullPage
import com.mytaillog.core.domain.PushResult
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.io.IOException
import java.util.Properties

/**
 * Phase 4 writes against real SQLite and a fake server: a squawk with photos filed in airplane mode
 * (C-SQ-02 "works fully offline; photos upload later"), a document added offline (M-DOCS-03), and the
 * outbox laid over the mirror so offline changes show at once.
 */
class RecordsStoreTest {
    @get:Rule val tmp = TemporaryFolder()

    /** What happened, in order, across the push endpoint and the file routes. */
    private val log = mutableListOf<String>()
    private var offline = false
    private val aircraft = "a1"

    private val server = object : SyncApi {
        override suspend fun pull(cursor: Long, limit: Int) = if (offline) throw IOException("offline") else PullPage(emptyList(), cursor, false)
        override suspend fun push(mutations: List<Mutation>): List<PushResult> {
            if (offline) throw IOException("offline")
            return mutations.map { m ->
                log += "push ${m.type}"
                val row = JsonObject(m.payload + mapOf("id" to (m.payload["id"] ?: JsonPrimitive(m.id)), "aircraft_id" to JsonPrimitive(m.aircraftId), "updated_at" to JsonPrimitive("2026-11-19T10:00:00Z")))
                PushResult(m.id, PushResult.Status.Ok, row)
            }
        }
        override suspend fun resolveConflict(mutationId: String, resolution: String) {}
    }

    private val files = object : RecordUploads {
        override suspend fun squawkPhoto(aircraftId: String, squawkId: String, photoId: String, jpeg: ByteArray) {
            if (offline) throw IOException("offline")
            log += "photo $photoId of $squawkId"
        }
        override suspend fun document(aircraftId: String, meta: JsonObject, bytes: ByteArray): JsonObject {
            if (offline) throw IOException("offline")
            log += "document ${meta.s("title")}"
            return buildJsonObject { put("id", "d1"); put("aircraft_id", aircraftId); put("type", meta.s("type")); put("title", meta.s("title")); put("file_name", meta.s("fileName")) }
        }
    }

    private val pages = object : PageUploads {
        override suspend fun target(aircraftId: String, kind: String, pageId: String, logbookId: String, bytes: Long): UploadTarget? = null
        override suspend fun put(target: UploadTarget, bytes: ByteArray) {}
    }

    private var clock = 1_000_000L

    private fun open(): OfflineStore {
        Class.forName("org.sqlite.JDBC")
        val mirror = JdbcSqliteDriver("jdbc:sqlite:${File(tmp.root, "mirror.db").path}", Properties(), MirrorDatabase.Schema)
        val outbox = JdbcSqliteDriver("jdbc:sqlite:${File(tmp.root, "outbox.db").path}", Properties(), OutboxDatabase.Schema)
        return OfflineStore("u1", tmp.root, mirror, outbox, server, pages, files) { clock }
    }

    @Test
    fun aSquawkWithPhotosFiledOfflineUploadsTheSquawkFirstThenItsPhotos() = runTest {
        val store = open()
        offline = true
        val id = "s1"
        store.change("squawk.create", aircraft, "squawk", id, "Squawk", json("id" to id, "description" to "Nav light lens cracked", "severity" to "medium", "reportedAt" to "2026-11-19T09:00:00Z"))
        repeat(2) { i ->
            val photo = "p$i"
            val job = store.addFile(OfflineStore.SQUAWK_PHOTO, aircraft, File(store.dir, "squawk_photos/$photo.jpg"), ByteArray(10), json("squawkId" to id, "photoId" to photo))
            store.change("squawkPhoto.create", aircraft, "squawk_photo", photo, "Squawk photo", json("id" to photo, "squawkId" to id, "blobId" to photo), dependsOn = job)
        }
        // Shown at once, from the outbox: open, Watch, two photos, all "On this phone".
        val shown = store.records("squawk", aircraft).single()
        assertTrue(shown.pending)
        assertEquals("open", shown.s("status"))
        assertEquals(2, store.records("squawk_photo", aircraft).count { it.s("squawk_id") == id })
        assertTrue("a retry is asked for", store.syncNow())
        assertTrue(log.isEmpty())

        offline = false
        clock += 3_600_000
        assertFalse(store.syncNow())
        assertEquals("push squawk.create", log[0])
        assertEquals(setOf("photo p0 of s1", "photo p1 of s1"), log.subList(1, 3).toSet())
        assertEquals(listOf("push squawkPhoto.create", "push squawkPhoto.create"), log.drop(3))
        assertEquals(0L, store.sync.value.waiting)
        assertTrue(store.recordFiles().isEmpty())
        assertTrue("the phone keeps its copy to show", File(store.dir, "squawk_photos/p0.jpg").exists())
        assertFalse(store.records("squawk", aircraft).single().pending)
    }

    @Test
    fun aDocumentAddedOfflineUploadsAndKeepsItsOfflineCopy() = runTest {
        val store = open()
        offline = true
        store.addFile(OfflineStore.DOCUMENT, aircraft, File(store.dir, "outbox/docs/x"), ByteArray(20), json("type" to "registration", "title" to "Registration", "fileName" to "reg.pdf", "mimeType" to "application/pdf"))
        assertEquals(1, heldDocs(store, aircraft).size)
        store.syncNow()
        offline = false
        clock += 3_600_000
        store.syncNow()
        assertEquals(listOf("document Registration"), log)
        assertTrue(heldDocs(store, aircraft).isEmpty())
        assertEquals("registration", store.records("document", aircraft).single().s("type"))
        assertTrue(File(store.dir, "docs/d1.pdf").exists())
    }

    @Test
    fun resolvingOfflineShowsResolvedAndDeletingAnUnsentSquawkLeavesNothingToSend() = runTest {
        val store = open()
        store.mirror.upsertRow("squawk", buildJsonObject { put("id", "s9"); put("aircraft_id", aircraft); put("description", "Oil seep"); put("severity", "low"); put("status", "open"); put("updated_at", "2026-11-01T00:00:00Z") })
        store.change("squawk.resolve", aircraft, "squawk", "s9", "Resolve", json("squawkId" to "s9", "resolvedAt" to "2026-11-19", "resolutionNotes" to "Tightened"))
        val r = store.records("squawk", aircraft).single()
        assertEquals("resolved", r.s("status"))
        assertEquals("Tightened", r.s("resolution_notes"))
        assertEquals("2026-11-01T00:00:00Z", store.queued().single().base) // the base it was read from

        store.change("squawk.create", aircraft, "squawk", "s10", "Squawk", json("id" to "s10", "description" to "Tire low", "severity" to "low"))
        store.delete("squawk.delete", aircraft, "squawk", "s10", "Delete", json("squawkId" to "s10"))
        assertNull(store.records("squawk", aircraft).firstOrNull { it.id == "s10" })
        assertEquals(listOf("squawk.resolve"), store.queued().map { it.type })
    }

    @Test
    fun overlayAppliesInOrderAndShowsRefusals() {
        val rows = listOf(buildJsonObject { put("id", "o1"); put("quarts", 1.0) }, buildJsonObject { put("id", "o2"); put("quarts", 2.0) })
        val out = overlay("oil_addition", rows, listOf(
            Waiting("oil.delete", "oil_addition", "o1", json("additionId" to "o1"), "pending", null),
            Waiting("oil.create", "oil_addition", "o3", json("id" to "o3", "date" to "2026-11-19", "quarts" to 0.5), "pending", null),
            Waiting("oil.delete", "oil_addition", "o2", json("additionId" to "o2"), "refused", "Not yours"),
            Waiting("mx.seedStandard", "maintenance_item", "m1", JsonObject(emptyMap()), "pending", null),
        ))
        assertEquals(listOf("o2", "o3"), out.map { it.id })
        assertEquals("Not yours", out[0].refused)
        assertEquals(0.5, out[1].d("quarts")!!, 0.0)
        assertEquals("2026-11-19", out[1].s("added_date"))
        assertTrue(overlay("maintenance_item", emptyList(), listOf(Waiting("mx.seedStandard", "maintenance_item", "m1", JsonObject(emptyMap()), "pending", null))).isEmpty())
    }
}

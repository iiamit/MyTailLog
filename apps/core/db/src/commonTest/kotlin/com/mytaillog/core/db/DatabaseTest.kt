package com.mytaillog.core.db

import app.cash.sqldelight.db.QueryResult
import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.db.SqlSchema
import com.mytaillog.core.db.mirror.MirrorDatabase
import com.mytaillog.core.db.outbox.OutboxDatabase
import com.mytaillog.core.domain.PullPage
import com.mytaillog.core.domain.SyncChange
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

expect fun inMemoryDriver(schema: SqlSchema<QueryResult.Value<Unit>>): SqlDriver

class DatabaseTest {
    private fun row(vararg kv: Pair<String, Any?>) = JsonObject(kv.associate { (k, v) ->
        k to when (v) { null -> JsonNull; is Number -> JsonPrimitive(v); is Boolean -> JsonPrimitive(v); else -> JsonPrimitive(v.toString()) }
    })
    private fun upsert(table: String, id: String, seq: Long, r: JsonObject) = SyncChange(table, id, SyncChange.Op.Upsert, seq, r)

    @Test
    fun mirrorAppliesPagesAndKeepsTheCursor() {
        val store = MirrorStore(inMemoryDriver(MirrorDatabase.Schema))
        assertEquals(0L, store.cursor())
        store.apply(PullPage(listOf(upsert("squawk", "s1", 4, row("id" to "s1", "aircraft_id" to "a1"))), nextCursor = 4, hasMore = true))
        assertEquals(1L, store.count("squawk"))
        store.apply(PullPage(listOf(SyncChange("squawk", "s1", SyncChange.Op.Delete, 9)), nextCursor = 9, hasMore = false))
        assertEquals(9L, store.cursor())
        assertEquals(0L, store.count("squawk"))
    }

    @Test
    fun typedTablesMatchTheDeclaredColumns() {
        val driver = inMemoryDriver(MirrorDatabase.Schema)
        for ((table, cols) in MirrorTables.columns) {
            val actual = driver.executeQuery(null, "PRAGMA table_info($table)", { c ->
                val names = mutableListOf<String>()
                while (c.next().value) names += c.getString(1)!!
                QueryResult.Value(names)
            }, 0).value
            assertEquals(listOf("id", "aircraft_id", "updated_at") + cols.map { it.first } + listOf("_raw", "_seq"), actual, table)
        }
    }

    @Test
    fun typedRowsKeepTheirColumnsAndTheRawRow() {
        val store = MirrorStore(inMemoryDriver(MirrorDatabase.Schema))
        val page = row("id" to "p1", "aircraft_id" to "a1", "logbook_id" to "lb", "batch_id" to "b1", "page_sequence" to 3,
            "extraction_status" to "queued", "needs_look" to true, "updated_at" to "2026-11-18T10:00:00Z", "new_server_column" to "kept")
        store.apply(PullPage(listOf(
            upsert("page", "p1", 5, page),
            upsert("aircraft", "a1", 6, row("id" to "a1", "tail_number" to "N734DM", "year" to 1978)),
            upsert("visit_note", "v1", 7, row("id" to "v1")),
        ), nextCursor = 7, hasMore = false))
        val inBatch = store.db.mirrorQueries.pagesInBatch("b1").executeAsList().single()
        assertEquals(3L, inBatch.page_sequence)
        assertEquals(1L, inBatch.needs_look)
        assertEquals(JsonPrimitive("kept"), store.raw("page", "p1")!!["new_server_column"])
        assertEquals(1L, store.db.mirrorQueries.countUnknown().executeAsOne(), "a table this build doesn't know waits in unknown_record")
        assertEquals("v1", store.raw("visit_note", "v1")!!["id"].let { (it as JsonPrimitive).content })

        // A row the push returned keeps the seq the pull gave it.
        store.upsertRow("page", JsonObject(page + ("extraction_status" to JsonPrimitive("extracted"))))
        assertEquals("extracted", store.db.mirrorQueries.pagesInBatch("b1").executeAsOne().extraction_status)

        store.reset()
        assertEquals(0L, store.cursor())
        assertEquals(0L, store.count("page"))
        assertNull(store.raw("visit_note", "v1"))
    }

    @Test
    fun outboxQueuesInOrder() {
        val q = OutboxDatabase(inMemoryDriver(OutboxDatabase.Schema)).outboxQueries
        q.enqueue("m2", "a1", "oil.create", "{}", null, null, null, null, "Oil, 1 qt", 2_000, null)
        q.enqueue("m1", "a1", "squawk.create", "{}", null, null, null, null, "Squawk", 1_000, null)
        assertEquals(listOf("m1", "m2"), q.pending().executeAsList().map { it.id })
        q.markSending(listOf("m1"))
        assertEquals(listOf("m2"), q.pending().executeAsList().map { it.id })
        q.recoverSending()
        q.remove("m1")
        assertEquals(listOf("m2"), q.pending().executeAsList().map { it.id })
        repeat(205) { q.log(it.toLong(), "sent", "x", null); q.trimActivity() }
        assertEquals(200, q.recentActivity(500).executeAsList().size)
    }
}

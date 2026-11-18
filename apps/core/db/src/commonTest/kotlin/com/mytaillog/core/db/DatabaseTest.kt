package com.mytaillog.core.db

import app.cash.sqldelight.db.QueryResult
import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.db.SqlSchema
import com.mytaillog.core.db.mirror.MirrorDatabase
import com.mytaillog.core.db.outbox.OutboxDatabase
import com.mytaillog.core.domain.PullPage
import com.mytaillog.core.domain.SyncChange
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals

expect fun inMemoryDriver(schema: SqlSchema<QueryResult.Value<Unit>>): SqlDriver

class DatabaseTest {
    @Test
    fun mirrorAppliesPagesAndKeepsTheCursor() {
        val store = MirrorStore(MirrorDatabase(inMemoryDriver(MirrorDatabase.Schema)))
        assertEquals(0, store.cursor())
        val row = JsonObject(mapOf("id" to JsonPrimitive("s1")))
        store.apply(PullPage(listOf(SyncChange("squawk", "s1", SyncChange.Op.Upsert, 4, row)), nextCursor = 4, hasMore = true))
        store.apply(PullPage(listOf(SyncChange("squawk", "s1", SyncChange.Op.Delete, 9)), nextCursor = 9, hasMore = false))
        assertEquals(9, store.cursor())
    }

    @Test
    fun outboxQueuesInOrder() {
        val q = OutboxDatabase(inMemoryDriver(OutboxDatabase.Schema)).outboxQueries
        q.enqueue("m2", "a1", "oil.create", "{}", null, null, null, null, "Oil, 1 qt", "2026-11-18T10:01:00Z")
        q.enqueue("m1", "a1", "squawk.create", "{}", null, null, null, null, "Squawk", "2026-11-18T10:00:00Z")
        assertEquals(listOf("m1", "m2"), q.pending().executeAsList().map { it.id })
        q.remove("m1")
        assertEquals(listOf("m2"), q.pending().executeAsList().map { it.id })
    }
}

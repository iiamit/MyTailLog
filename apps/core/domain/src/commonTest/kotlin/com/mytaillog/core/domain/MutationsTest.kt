package com.mytaillog.core.domain

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class MutationsTest {
    @Test
    fun catalogueMatchesTheServerCount() {
        // 64 types in apps/web/src/lib/sync/mutations.ts: phase 3 added page.register, batch.create,
        // page.duplicateDecision; phase 4 added the 12 of PHASE4_MUTATIONS (lib/writes/index.ts);
        // phase 6 added reminder.snooze; page.details reviews reference-page identity through the outbox.
        assertEquals(64, Mutations.catalogue.size)
        assertTrue(Mutations.needsBase("page.details", JsonObject(emptyMap())))
        assertFalse(Mutations.isOnlineOnly("page.details"))
        assertFalse(Mutations.needsBase("reminder.snooze", JsonObject(emptyMap())))
        assertTrue(Mutations.needsBase("visit.setStatus", JsonObject(emptyMap())))
        assertFalse(Mutations.needsBase("visit.create", JsonObject(emptyMap())))
    }

    @Test
    fun baseRules() {
        val empty = JsonObject(emptyMap())
        assertTrue(Mutations.needsBase("entry.update", empty))
        assertFalse(Mutations.needsBase("squawk.create", empty))
        assertFalse(Mutations.needsBase("mx.upsert", empty))
        assertTrue(Mutations.needsBase("mx.upsert", JsonObject(mapOf("id" to JsonPrimitive("a1")))))
        assertFalse(Mutations.needsBase("mx.upsert", JsonObject(mapOf("id" to JsonPrimitive("")))))
    }

    @Test
    fun onlineOnlyTypes() {
        assertTrue(Mutations.isOnlineOnly("aircraft.enroll"))
        assertFalse(Mutations.isOnlineOnly("squawk.create"))
        assertFalse(Mutations.isOnlineOnly("not.a.type"))
    }

    @Test
    fun pullPageDecodesTheServerShape() {
        val page = Json.decodeFromString<PullPage>(
            """{"changes":[{"table":"squawk","op":"upsert","id":"s1","seq":7,"row":{"id":"s1"}},
               {"table":"page","op":"delete","id":"p1","seq":8}],"nextCursor":8,"hasMore":false}""",
        )
        assertEquals(SyncChange.Op.Delete, page.changes[1].op)
        assertEquals(8L, page.nextCursor)
    }
}

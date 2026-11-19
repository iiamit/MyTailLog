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
        // 47 types in apps/web/src/lib/sync/mutations.ts plus the 12 phase 4 types of PHASE4_MUTATIONS (lib/writes/index.ts).
        assertEquals(59, Mutations.catalogue.size)
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

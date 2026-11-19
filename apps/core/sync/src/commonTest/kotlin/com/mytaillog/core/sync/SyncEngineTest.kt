package com.mytaillog.core.sync

import app.cash.sqldelight.db.QueryResult
import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.db.SqlSchema
import com.mytaillog.core.api.SyncApi
import com.mytaillog.core.api.SyncHttpException
import com.mytaillog.core.db.MirrorStore
import com.mytaillog.core.db.mirror.MirrorDatabase
import com.mytaillog.core.db.outbox.OutboxDatabase
import com.mytaillog.core.domain.Mutation
import com.mytaillog.core.domain.PullPage
import com.mytaillog.core.domain.PushResult
import com.mytaillog.core.domain.SyncChange
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

expect fun inMemoryDriver(schema: SqlSchema<QueryResult.Value<Unit>>): SqlDriver

class SyncEngineTest {
    private fun obj(vararg kv: Pair<String, String>) = JsonObject(kv.associate { it.first to JsonPrimitive(it.second) })

    /** A fake transport: pull pages in order, push answers from [answer] (default ok), or fails while [down]. */
    private class FakeApi(var pages: MutableList<() -> PullPage> = mutableListOf()) : SyncApi {
        val cursors = mutableListOf<Long>()
        val batches = mutableListOf<List<Mutation>>()
        val resolved = mutableListOf<Pair<String, String>>()
        var down = false
        var answer: (Mutation) -> PushResult = { PushResult(it.id, PushResult.Status.Ok, row = null) }
        override suspend fun pull(cursor: Long, limit: Int): PullPage { cursors += cursor; return pages.removeAt(0)() }
        override suspend fun push(mutations: List<Mutation>): List<PushResult> {
            if (down) throw IllegalStateException("offline")
            batches += mutations
            return mutations.map(answer)
        }
        override suspend fun resolveConflict(mutationId: String, resolution: String) { resolved += mutationId to resolution }
    }

    private class Rig(val api: FakeApi = FakeApi()) {
        var clock = 1_000L
        val mirror = MirrorStore(inMemoryDriver(MirrorDatabase.Schema))
        val outbox = OutboxDatabase(inMemoryDriver(OutboxDatabase.Schema))
        val engine = SyncEngine(api, mirror, outbox) { clock }
        fun status(id: String) = outbox.outboxQueries.byId(id).executeAsOneOrNull()?.status
        fun queue(id: String, type: String = "oil.create", aircraft: String = "a1", target: RowRef? = null, base: String? = null, dependsOn: String? = null, payload: JsonObject = JsonObject(emptyMap())) {
            clock += 1
            engine.enqueue(Mutation(id, type, aircraft, payload, base), label = id, target = target, baseRow = null, dependsOn = dependsOn)
        }
    }

    @Test
    fun pullLoopsFromTheStoredCursorUntilNoMore() = runTest {
        val change = SyncChange("squawk", "s1", SyncChange.Op.Delete, 3)
        val rig = Rig(FakeApi(mutableListOf({ PullPage(listOf(change), 3, hasMore = true) }, { PullPage(listOf(change), 7, hasMore = false) })))
        assertEquals(2, rig.engine.pull())
        assertEquals(listOf(0L, 3L), rig.api.cursors)
        assertEquals(7L, rig.mirror.cursor())
    }

    @Test
    fun resyncRequiredRebuildsTheMirrorFromZeroAndKeepsTheOutbox() = runTest {
        val rig = Rig()
        rig.mirror.apply(PullPage(listOf(SyncChange("squawk", "old", SyncChange.Op.Upsert, 5, obj("id" to "old", "aircraft_id" to "a1"))), 5, false))
        rig.queue("m1")
        rig.api.pages = mutableListOf(
            { throw SyncHttpException(410, """{"code":"resync_required"}""") },
            { PullPage(listOf(SyncChange("squawk", "new", SyncChange.Op.Upsert, 90, obj("id" to "new", "aircraft_id" to "a1"))), 90, false) },
        )
        rig.engine.pull()
        assertEquals(listOf(5L, 0L), rig.api.cursors)
        assertEquals(1L, rig.mirror.count("squawk"))
        assertEquals(90L, rig.mirror.cursor())
        assertEquals("pending", rig.status("m1"), "unsent work survives a rebuild")
    }

    @Test
    fun pushSendsOldestFirstOneAircraftAtATimeInHundreds() = runTest {
        val rig = Rig()
        repeat(150) { rig.queue("a$it") }
        rig.queue("b0", aircraft = "a2")
        val report = rig.engine.push()
        assertEquals(listOf(100, 50, 1), rig.api.batches.map { it.size })
        assertEquals("a0", rig.api.batches[0].first().id)
        assertEquals(151, report.ok)
        assertEquals(0L, rig.engine.summary().waiting)
    }

    @Test
    fun refusesOnlineOnlyAndMissingBaseAtEnqueue() {
        val rig = Rig()
        assertFailsWith<IllegalArgumentException> { rig.queue("x", type = "aircraft.enroll") }
        assertFailsWith<IllegalArgumentException> { rig.queue("y", type = "entry.update") }
    }

    @Test
    fun aNetworkFailureKeepsEverythingWithBackoff() = runTest {
        val rig = Rig()
        rig.queue("m1")
        rig.api.down = true
        assertTrue(rig.engine.push().offline)
        assertEquals("pending", rig.status("m1"))
        // Not due yet: nothing is sent even when the network is back.
        rig.api.down = false
        assertEquals(0, rig.engine.push().ok)
        rig.clock += SyncEngine.backoffMs(1)
        assertEquals(1, rig.engine.push().ok)
        assertEquals(listOf(5_000L, 10_000L, 20_000L, 900_000L), listOf(1L, 2L, 3L, 30L).map(SyncEngine::backoffMs))
    }

    @Test
    fun aConflictBlocksLaterChangesToTheSameRowOnly() = runTest {
        val rig = Rig()
        val row = RowRef("squawk", "s1")
        val theirs = obj("id" to "s1", "aircraft_id" to "a1", "description" to "Left brake soft", "updated_at" to "2026-11-18T09:12:00Z")
        rig.queue("m1", type = "squawk.update", target = row, base = "2026-11-18T09:00:00Z", payload = obj("squawkId" to "s1", "description" to "Brake fixed"))
        rig.queue("m2", type = "squawk.resolve", target = row, base = "2026-11-18T09:00:00Z")
        rig.queue("m3", type = "oil.create", target = RowRef("oil_addition", "o1"))
        rig.api.answer = { if (it.id == "m1") PushResult(it.id, PushResult.Status.Conflict, row = theirs) else PushResult(it.id, PushResult.Status.Ok) }
        val report = rig.engine.push()
        assertEquals(1, report.conflicts)
        assertEquals(listOf(listOf("m1", "m3")), rig.api.batches.map { b -> b.map { it.id } }, "one change per row per request")
        assertEquals("conflict", rig.status("m1"))
        assertEquals("blocked", rig.status("m2"))
        assertEquals(null, rig.status("m3"))
        assertEquals(1L, rig.engine.summary().conflicts)

        // Keep mine: re-sent with the server's updated_at as the new base; the blocked change follows.
        val diff = rig.engine.diff("m1").single()
        assertEquals("description", diff.field)
        assertTrue(diff.changedByMe)
        rig.api.answer = { PushResult(it.id, PushResult.Status.Ok) }
        rig.engine.resolve("m1", Resolution.KeepMine)
        rig.engine.push()
        assertEquals("2026-11-18T09:12:00Z", rig.api.batches[1].single().base)
        assertEquals(listOf("m2"), rig.api.batches[2].map { it.id })
        assertEquals(0L, rig.engine.summary().waiting)
    }

    @Test
    fun takeTheirsAppliesTheServerRowAndClosesTheServerRecord() = runTest {
        val rig = Rig()
        val theirs = obj("id" to "s1", "aircraft_id" to "a1", "description" to "Theirs", "updated_at" to "2026-11-18T09:12:00Z")
        rig.queue("m1", type = "squawk.update", target = RowRef("squawk", "s1"), base = "t0", payload = obj("description" to "Mine"))
        rig.api.answer = { PushResult(it.id, PushResult.Status.Conflict, row = theirs) }
        rig.engine.push()
        rig.engine.resolve("m1", Resolution.TakeTheirs)
        assertEquals(null, rig.status("m1"))
        assertEquals(JsonPrimitive("Theirs"), rig.mirror.raw("squawk", "s1")!!["description"])
        assertEquals(listOf("m1" to "take_theirs"), rig.api.resolved)
    }

    @Test
    fun keepBothSendsOnlyMyChangedFields() = runTest {
        val payload = obj("squawkId" to "s1", "description" to "Mine", "severity" to "minor")
        val base = obj("id" to "s1", "description" to "Old", "severity" to "minor", "updated_at" to "t0")
        val theirs = obj("id" to "s1", "description" to "Old", "severity" to "grounding", "updated_at" to "t1")
        assertTrue(Conflicts.canKeepBoth(Conflicts.diff(base, payload, theirs)))
        assertEquals(setOf("squawkId", "description"), Conflicts.onlyMine(payload, base).keys)
        assertFalse(Conflicts.canKeepBoth(Conflicts.diff(base, payload, obj("description" to "Theirs"))))
    }

    @Test
    fun aRefusalIsFinalAndRefusesItsDependents() = runTest {
        val rig = Rig()
        rig.queue("sq", type = "squawk.create")
        rig.queue("photo", type = "squawk.create", dependsOn = "sq")
        rig.api.answer = { PushResult(it.id, PushResult.Status.Error, error = "You don't have edit access to this aircraft.", code = "viewer_read_only") }
        val report = rig.engine.push()
        assertEquals(1, report.refused)
        assertEquals(listOf(listOf("sq")), rig.api.batches.map { b -> b.map { it.id } }, "a dependent waits for its dependency")
        assertEquals("refused", rig.status("sq"))
        assertEquals("refused", rig.status("photo"))
        assertEquals(2L, rig.engine.summary().refused)
    }

    @Test
    fun aChangeWaitsForTheFileItRegisters() = runTest {
        val rig = Rig()
        rig.outbox.outboxQueries.addFile("f1", "page", "a1", "/outbox/pages/f1.jpg", 1_000, null, "{}", 1)
        rig.queue("reg", type = "page.register", dependsOn = "f1")
        rig.engine.push()
        assertTrue(rig.api.batches.isEmpty())
        rig.outbox.outboxQueries.setFileStatus("uploaded", 1.0, null, 0, "f1")
        rig.engine.push()
        assertEquals(listOf("reg"), rig.api.batches.single().map { it.id })
    }

    @Test
    fun anAcceptedRowLandsInTheMirrorAndAKilledPushIsResent() = runTest {
        val rig = Rig()
        rig.queue("p1", type = "page.register", target = RowRef("page", "p1"))
        // The process died mid-push: the mutation was marked sending and never acknowledged.
        rig.outbox.outboxQueries.markSending(listOf("p1"))
        val restarted = SyncEngine(rig.api, rig.mirror, rig.outbox) { rig.clock }
        assertEquals("pending", rig.status("p1"))
        rig.api.answer = { PushResult(it.id, PushResult.Status.Ok, row = obj("id" to "p1", "aircraft_id" to "a1", "extraction_status" to "queued")) }
        restarted.push()
        assertEquals(JsonPrimitive("queued"), rig.mirror.raw("page", "p1")!!["extraction_status"])
    }
}

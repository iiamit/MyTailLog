package com.mytaillog.core.sync

import com.mytaillog.core.api.SyncApi
import com.mytaillog.core.domain.Mutation
import com.mytaillog.core.domain.PullPage
import com.mytaillog.core.domain.PullSink
import com.mytaillog.core.domain.PushResult
import com.mytaillog.core.domain.SyncChange
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class SyncEngineTest {
    private val empty = JsonObject(emptyMap())

    private class FakeApi(val pages: List<PullPage>) : SyncApi {
        val cursors = mutableListOf<Long>()
        val batches = mutableListOf<Int>()
        override suspend fun pull(cursor: Long, limit: Int): PullPage { cursors += cursor; return pages[cursors.size - 1] }
        override suspend fun push(mutations: List<Mutation>) =
            mutations.map { PushResult(it.id, PushResult.Status.Ok) }.also { batches += mutations.size }
    }

    private class MemorySink : PullSink {
        var stored = 0L
        override fun cursor() = stored
        override fun apply(page: PullPage) { stored = page.nextCursor }
    }

    @Test
    fun pullLoopsFromTheStoredCursorUntilNoMore() = runTest {
        val change = SyncChange("squawk", "s1", SyncChange.Op.Delete, 3)
        val api = FakeApi(listOf(PullPage(listOf(change), 3, hasMore = true), PullPage(listOf(change), 7, hasMore = false)))
        val sink = MemorySink()
        assertEquals(2, SyncEngine(api, sink).pull())
        assertEquals(listOf(0L, 3L), api.cursors)
        assertEquals(7, sink.stored)
    }

    @Test
    fun pushBatchesByAHundredAndRefusesOnlineOnly() = runTest {
        val api = FakeApi(emptyList())
        val engine = SyncEngine(api, MemorySink())
        val results = engine.push(List(230) { Mutation("m$it", "oil.create", "a1", empty) })
        assertEquals(listOf(100, 100, 30), api.batches)
        assertEquals("m229", results.last().id)
        assertFailsWith<IllegalArgumentException> { engine.push(listOf(Mutation("x", "aircraft.enroll", "a1", empty))) }
    }
}

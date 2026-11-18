package com.mytaillog.core.sync

import com.mytaillog.core.api.SyncApi
import com.mytaillog.core.domain.Mutation
import com.mytaillog.core.domain.Mutations
import com.mytaillog.core.domain.PullSink
import com.mytaillog.core.domain.PushResult

/**
 * The transport half of sync (05 §6.3–6.4): pull pages until the server has no more,
 * push mutations in batches of at most 100. Outbox bookkeeping (backoff, conflicts,
 * blocking, projection) arrives with the offline phase.
 */
class SyncEngine(private val api: SyncApi, private val mirror: PullSink) {

    /** Pulls from the stored cursor until `hasMore` is false. Returns the number of changes applied. */
    suspend fun pull(pageSize: Int = 500): Int {
        var applied = 0
        do {
            val page = api.pull(mirror.cursor(), pageSize)
            mirror.apply(page)
            applied += page.changes.size
        } while (page.hasMore)
        return applied
    }

    /** Sends [mutations] oldest first; results come back one per mutation, in order. */
    suspend fun push(mutations: List<Mutation>): List<PushResult> {
        mutations.firstOrNull { Mutations.isOnlineOnly(it.type) }?.let {
            throw IllegalArgumentException("${it.type} is online only and is never queued")
        }
        return mutations.chunked(Mutations.MAX_PER_PUSH).flatMap { api.push(it) }
    }
}

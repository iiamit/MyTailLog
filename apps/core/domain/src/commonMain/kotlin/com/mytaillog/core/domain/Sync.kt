package com.mytaillog.core.domain

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

// Wire types of today's sync protocol (apps/web/src/app/api/sync/{pull,push}).

/** One collapsed change from GET /api/sync/pull: the latest state of one row. */
@Serializable
data class SyncChange(
    val table: String,
    val id: String,
    val op: Op,
    val seq: Long,
    val row: JsonObject? = null,
) {
    @Serializable
    enum class Op { @SerialName("upsert") Upsert, @SerialName("delete") Delete }
}

@Serializable
data class PullPage(val changes: List<SyncChange>, val nextCursor: Long, val hasMore: Boolean)

/** Where pulled pages land (mirror.db). [apply] must store the page and its cursor atomically. */
interface PullSink {
    fun cursor(): Long
    fun apply(page: PullPage)
}

/** One queued write for POST /api/sync/push. `id` is the idempotency key. */
@Serializable
data class Mutation(
    val id: String,
    val type: String,
    val aircraftId: String,
    val payload: JsonObject,
    val base: String? = null,
)

@Serializable
data class PushResult(
    val id: String,
    val status: Status,
    val row: JsonObject? = null,
    val error: String? = null,
) {
    @Serializable
    enum class Status { @SerialName("ok") Ok, @SerialName("conflict") Conflict, @SerialName("error") Error }
}

@Serializable
data class PushRequest(val mutations: List<Mutation>)

@Serializable
data class PushResponse(val results: List<PushResult>)

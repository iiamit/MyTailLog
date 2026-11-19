package com.mytaillog.core.domain

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

// Wire types of the sync protocol (apps/web/src/app/api/sync/{pull,push}); v2 under /api/sync/v2
// adds the optional fields (09 §5).

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
data class PullPage(
    val changes: List<SyncChange>,
    val nextCursor: Long,
    val hasMore: Boolean,
    val serverTime: String? = null,
    /** v2: builds older than this show "Update MyTailLog to keep syncing" (05 §6.8). */
    val minAppVersion: String? = null,
)

/** Where pulled pages land (mirror.db). [apply] must store the page and its cursor atomically. */
interface PullSink {
    fun cursor(): Long
    fun apply(page: PullPage)
    /** Drop every mirrored row and the cursor (410 resync_required, "Rebuild from the server"). Never touches the outbox. */
    fun reset()
}

/** One queued write for POST /api/sync/push. `id` is the idempotency key. */
@Serializable
data class Mutation(
    val id: String,
    val type: String,
    val aircraftId: String,
    val payload: JsonObject,
    val base: String? = null,
    /** v2: `keep_both` when this is a re-push made from "Keep both changes" (05 §6.6). */
    val resolution: String? = null,
)

@Serializable
data class PushResult(
    val id: String,
    val status: Status,
    val row: JsonObject? = null,
    val error: String? = null,
    /** v2 machine code: viewer_read_only, conflict, refused, invalid. */
    val code: String? = null,
    /** v2: this mutation id had already landed; nothing ran again and `row` is null. */
    val replayed: Boolean = false,
) {
    @Serializable
    enum class Status { @SerialName("ok") Ok, @SerialName("conflict") Conflict, @SerialName("error") Error }
}

@Serializable
data class PushRequest(val mutations: List<Mutation>)

@Serializable
data class PushResponse(val results: List<PushResult>)

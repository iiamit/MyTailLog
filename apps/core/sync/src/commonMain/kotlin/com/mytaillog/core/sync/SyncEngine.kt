package com.mytaillog.core.sync

import com.mytaillog.core.api.SyncApi
import com.mytaillog.core.api.SyncHttpException
import com.mytaillog.core.db.MirrorStore
import com.mytaillog.core.db.outbox.Mutation as Queued
import com.mytaillog.core.db.outbox.OutboxDatabase
import com.mytaillog.core.domain.Mutation
import com.mytaillog.core.domain.Mutations
import com.mytaillog.core.domain.PushResult
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlin.coroutines.cancellation.CancellationException
import kotlin.time.Clock
import kotlin.time.ExperimentalTime

/** The row a mutation changes: it blocks later changes to the same row while in conflict, and takes the returned row. */
data class RowRef(val table: String, val id: String)

enum class Resolution(val wire: String) { KeepMine("keep_mine"), KeepBoth("keep_both"), TakeTheirs("take_theirs"), Discard("discard") }

/** The sync line (09 §5.7): "Offline · 3 changes on this phone", "1 change needs a decision". */
data class SyncSummary(val waiting: Long, val conflicts: Long, val refused: Long)

data class PushReport(val ok: Int = 0, val conflicts: Int = 0, val refused: Int = 0, val offline: Boolean = false)

@OptIn(ExperimentalTime::class)
private fun epochMillis() = Clock.System.now().toEpochMilliseconds()

/**
 * The offline sync engine (05 §6.3–6.6, 09 §5): pull into mirror.db, the outbox in outbox.db,
 * push with per-row ordering, dependencies and backoff, conflicts kept until the owner decides.
 * Server acceptance is the only thing that removes a mutation (05 §6.1 rule 3).
 */
class SyncEngine(
    private val api: SyncApi,
    private val mirror: MirrorStore,
    outbox: OutboxDatabase,
    private val now: () -> Long = ::epochMillis,
) {
    private val q = outbox.outboxQueries

    init {
        // A push the process died during was never acknowledged: it is still unsent.
        q.recoverSending()
    }

    // ---------------------------------------------------------------------------------------
    // Write path
    // ---------------------------------------------------------------------------------------

    /** Queue one change (05 §6.4). Refuses unknown and online-only types and a missing base, as the server would. */
    fun enqueue(m: Mutation, label: String, target: RowRef? = null, baseRow: JsonObject? = null, dependsOn: String? = null) {
        require(Mutations.isKnown(m.type)) { "Unknown change type: ${m.type}" }
        require(!Mutations.isOnlineOnly(m.type)) { "${m.type} is online only and is never queued" }
        require(!Mutations.needsBase(m.type, m.payload) || m.base != null) { "${m.type} needs the base it was made from" }
        q.enqueue(m.id, m.aircraftId, m.type, m.payload.toString(), target?.table, target?.id, m.base, baseRow?.toString(), label, now(), dependsOn)
    }

    /**
     * Drain the outbox: oldest first, one aircraft per request, at most 100, one change per row per
     * request (so a conflict on the first holds the rest), dependencies first. Stops at the first
     * network failure, leaving everything unsent with a backoff.
     */
    suspend fun push(): PushReport {
        var report = PushReport()
        while (true) {
            val batch = nextBatch()
            if (batch.isEmpty()) return report
            q.markSending(batch.map { it.id })
            val results = try {
                api.push(batch.map { it.toWire() })
            } catch (e: CancellationException) {
                q.recoverSending()
                throw e
            } catch (e: Exception) {
                val retryable = e !is SyncHttpException || e.status >= 500 || e.status == 408 || e.status == 429
                if (!retryable) { q.recoverSending(); throw e } // 401: the platform refreshes the session; 4xx: a bug to surface
                for (m in batch) q.retryLater(now() + backoffMs(m.attempts + 1), m.id)
                return report.copy(offline = true)
            }
            val byId = batch.associateBy { it.id }
            for (r in results) {
                val m = byId[r.id] ?: continue
                report = when (r.status) {
                    PushResult.Status.Ok -> { accepted(m, r); report.copy(ok = report.ok + 1) }
                    PushResult.Status.Conflict -> {
                        q.setStatus(CONFLICT, null, r.row?.toString(), m.id)
                        log("conflict", "Changed in two places: ${m.label}", m.id)
                        report.copy(conflicts = report.conflicts + 1)
                    }
                    PushResult.Status.Error -> { refuse(m.id, r.error ?: "Refused by the server."); report.copy(refused = report.refused + 1) }
                }
            }
            // A result the server didn't send back stays unsent.
            for (m in batch) if (results.none { it.id == m.id }) q.retryLater(now() + backoffMs(m.attempts + 1), m.id)
        }
    }

    private fun accepted(m: Queued, r: PushResult) {
        q.remove(m.id)
        val row = r.row
        if (m.target_table != null && row != null && row["id"] is JsonPrimitive) mirror.upsertRow(m.target_table!!, row)
        log("sent", if (r.replayed) "Already on the server: ${m.label}" else "Sent: ${m.label}", m.id)
    }

    /** Refusal is final for this change and for every change that depended on it (05 §6.4). */
    private fun refuse(id: String, error: String) {
        q.setStatus(REFUSED, error, null, id)
        log("refused", error, id)
        for (d in q.all().executeAsList()) if (d.depends_on == id && d.status != REFUSED) refuse(d.id, "A change it depended on was refused.")
    }

    private fun nextBatch(): List<Queued> {
        val all = q.all().executeAsList()
        val byId = all.associateBy { it.id }
        val conflicted = all.filter { it.status == CONFLICT }.mapNotNull { it.key() }.toSet()
        val held = mutableSetOf<String>() // rows that already have an earlier change waiting or in this request
        val out = mutableListOf<Queued>()
        for (m in all) {
            val key = m.key()
            if (m.status != PENDING && m.status != BLOCKED) { if (m.status != REFUSED) key?.let(held::add); continue }
            if (key != null && key in conflicted) {
                if (m.status == PENDING) q.setStatus(BLOCKED, null, null, m.id)
                continue
            }
            if (m.status == BLOCKED) q.setStatus(PENDING, null, null, m.id)
            val dep = m.depends_on?.let { byId[it] }
            if (dep?.status == REFUSED) { refuse(m.id, "A change it depended on was refused."); continue }
            val waitingFile = m.depends_on?.let { q.fileById(it).executeAsOneOrNull() }?.let { it.status != "uploaded" && it.status != "registered" } == true
            val due = (m.next_try_at ?: 0) <= now()
            if (dep != null || waitingFile || !due || (key != null && key in held)) { key?.let(held::add); continue }
            key?.let(held::add)
            out += m
        }
        val aircraft = out.firstOrNull()?.aircraft_id ?: return emptyList()
        return out.filter { it.aircraft_id == aircraft }.take(Mutations.MAX_PER_PUSH)
    }

    // ---------------------------------------------------------------------------------------
    // Read path
    // ---------------------------------------------------------------------------------------

    /**
     * Pull from the stored cursor until `hasMore` is false (05 §6.3). On 410 resync_required the mirror
     * is dropped and rebuilt from cursor 0; the outbox is untouched (09 §5.4). Returns changes applied.
     */
    suspend fun pull(pageSize: Int = 500): Int {
        var applied = 0
        var rebuilt = false
        while (true) {
            val page = try {
                api.pull(mirror.cursor(), pageSize)
            } catch (e: SyncHttpException) {
                if (e.status != 410 || rebuilt) throw e
                mirror.reset()
                rebuilt = true
                log("rebuild", "Rebuilding this phone's copy from the server.", null)
                continue
            }
            mirror.apply(page)
            applied += page.changes.size
            if (!page.hasMore) return applied
        }
    }

    /** What every trigger in 05 §6.7 runs: push, then pull. */
    suspend fun sync(): PushReport = push().also { if (!it.offline) pull() }

    // ---------------------------------------------------------------------------------------
    // Conflicts (05 §6.6)
    // ---------------------------------------------------------------------------------------

    fun conflicts(): List<Queued> = q.all().executeAsList().filter { it.status == CONFLICT }

    fun diff(mutationId: String): List<FieldDiff> {
        val m = q.byId(mutationId).executeAsOneOrNull() ?: return emptyList()
        return Conflicts.diff(m.base_row?.let(::obj), obj(m.payload), m.server_row?.let(::obj))
    }

    /** The owner's decision. Never automatic: nothing calls this except the owner's tap. */
    suspend fun resolve(mutationId: String, choice: Resolution) {
        val m = q.byId(mutationId).executeAsOneOrNull() ?: return
        require(m.status == CONFLICT) { "Only a conflict can be resolved." }
        val server = m.server_row?.let(::obj)
        val serverBase = (server?.get("updated_at") as? JsonPrimitive)?.content
        when (choice) {
            Resolution.KeepMine -> q.rebase(serverBase ?: m.base, m.server_row, m.payload, null, m.id)
            Resolution.KeepBoth -> {
                require(Conflicts.canKeepBoth(diff(m.id))) { "You and they changed the same field; choose one." }
                q.rebase(serverBase ?: m.base, m.server_row, Conflicts.onlyMine(obj(m.payload), m.base_row?.let(::obj)).toString(), choice.wire, m.id)
            }
            Resolution.TakeTheirs, Resolution.Discard -> {
                if (choice == Resolution.TakeTheirs && server != null && m.target_table != null) mirror.upsertRow(m.target_table!!, server)
                q.remove(m.id)
                // shortcut: offline, the server's conflict record stays open (bookkeeping only); queue the report if the web shows them.
                try { api.resolveConflict(m.id, choice.wire) } catch (e: CancellationException) { throw e } catch (_: Exception) {}
            }
        }
        log("decided", "${choice.name}: ${m.label}", m.id)
    }

    fun summary(): SyncSummary {
        val n = q.countByStatus().executeAsList().associate { it.status to it.n }
        return SyncSummary(
            waiting = (n[PENDING] ?: 0) + (n[SENDING] ?: 0) + (n[BLOCKED] ?: 0),
            conflicts = n[CONFLICT] ?: 0,
            refused = n[REFUSED] ?: 0,
        )
    }

    private fun log(kind: String, text: String, ref: String?) {
        q.log(now(), kind, text, ref)
        q.trimActivity()
    }

    private fun Queued.key() = target_table?.let { t -> target_id?.let { "$t:$it" } }

    private fun Queued.toWire() = Mutation(id, type, aircraft_id, obj(payload), base, resolution)

    private fun obj(s: String) = Json.parseToJsonElement(s).jsonObject

    companion object {
        const val PENDING = "pending"
        const val SENDING = "sending"
        const val CONFLICT = "conflict"
        const val REFUSED = "refused"
        const val BLOCKED = "blocked"

        /** 5 s, 10 s, 20 s … capped at 15 minutes (05 §6.4). */
        fun backoffMs(attempt: Long): Long = minOf(5_000L shl (attempt - 1).coerceIn(0, 20).toInt(), 15 * 60_000L)
    }
}

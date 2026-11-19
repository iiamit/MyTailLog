package com.mytaillog.core

import app.cash.sqldelight.db.QueryResult
import app.cash.sqldelight.driver.native.NativeSqliteDriver
import com.mytaillog.core.api.HttpSyncApi
import com.mytaillog.core.api.createHttpClient
import com.mytaillog.core.db.MIRROR_DB
import com.mytaillog.core.db.MirrorStore
import com.mytaillog.core.db.MirrorTables
import com.mytaillog.core.db.OUTBOX_DB
import com.mytaillog.core.db.mirror.MirrorDatabase
import com.mytaillog.core.db.outbox.OutboxDatabase
import com.mytaillog.core.domain.Mutation
import com.mytaillog.core.sync.PushReport
import com.mytaillog.core.sync.Resolution
import com.mytaillog.core.sync.RowRef
import com.mytaillog.core.sync.SyncEngine
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put

/**
 * The iOS app's handle on the offline store (05 §6.2): mirror.db and outbox.db for one signed-in user in [dir],
 * and the sync engine talking to [baseUrl]. Swift sets [accessToken] before each sync (05 §8.1: the platform owns auth).
 * Payloads, rows and lists cross as JSON text, so Swift decodes them with Codable and never sees kotlinx JSON trees
 * or the outbox's generated row classes.
 */
class OfflineCore(dir: String, baseUrl: String) {
    var accessToken: String = ""

    private val mirrorDriver = NativeSqliteDriver(MirrorDatabase.Schema, MIRROR_DB, onConfiguration = { it.copy(extendedConfig = it.extendedConfig.copy(basePath = dir)) })
    private val outboxDriver = NativeSqliteDriver(OutboxDatabase.Schema, OUTBOX_DB, onConfiguration = { it.copy(extendedConfig = it.extendedConfig.copy(basePath = dir)) })
    private val http = createHttpClient()

    val mirror = MirrorStore(mirrorDriver)
    private val outbox = OutboxDatabase(outboxDriver)
    private val q = outbox.outboxQueries
    val engine = SyncEngine(HttpSyncApi(http, baseUrl) { accessToken }, mirror, outbox)

    // --- Sync -------------------------------------------------------------------------------

    @Throws(Exception::class)
    suspend fun sync(): PushReport = engine.sync()
    @Throws(Exception::class)
    suspend fun pull(): Int = engine.pull()

    /** `choice`: keep_mine | keep_both | take_theirs | discard. */
    @Throws(Exception::class)
    suspend fun resolve(mutationId: String, choice: String) =
        engine.resolve(mutationId, Resolution.entries.first { it.wire == choice })

    // --- Outbox -----------------------------------------------------------------------------

    /** Queue one change; `payload` and `baseRow` are JSON objects as text. Refusals (unknown or online-only types, a missing base) throw to Swift. */
    @Throws(Exception::class)
    fun enqueue(id: String, type: String, aircraftId: String, payload: String, label: String,
                targetTable: String?, targetId: String?, base: String?, baseRow: String?, dependsOn: String?) {
        engine.enqueue(
            Mutation(id, type, aircraftId, Json.parseToJsonElement(payload).jsonObject, base),
            label,
            if (targetTable != null && targetId != null) RowRef(targetTable, targetId) else null,
            baseRow?.let { Json.parseToJsonElement(it).jsonObject },
            dependsOn,
        )
    }

    /** The owner's Discard on a waiting or refused change (M-SYS-01). */
    fun discard(mutationId: String) = q.remove(mutationId)

    /** Every queued change, oldest first, as a JSON array. */
    fun outboxJson(): String = buildJsonArray {
        for (m in q.all().executeAsList()) add(buildJsonObject {
            put("id", m.id); put("aircraftId", m.aircraft_id); put("type", m.type); put("label", m.label)
            put("createdAt", m.created_at); put("attempts", m.attempts); put("nextTryAt", m.next_try_at)
            put("status", m.status); put("error", m.error); put("targetTable", m.target_table); put("targetId", m.target_id)
            put("dependsOn", m.depends_on)
            put("payload", Json.parseToJsonElement(m.payload))
        })
    }.toString()

    /** The conflict's three-way diff (05 §6.6) as [{field, base, mine, theirs, clash}]. */
    fun diffJson(mutationId: String): String = buildJsonArray {
        for (d in engine.diff(mutationId)) add(buildJsonObject {
            put("field", d.field); put("base", d.base ?: JsonNull); put("mine", d.mine); put("theirs", d.theirs ?: JsonNull)
            put("clash", d.clash); put("changedByMe", d.changedByMe); put("changedByThem", d.changedByThem)
        })
    }.toString()

    fun activityJson(limit: Long): String = buildJsonArray {
        for (a in q.recentActivity(limit).executeAsList()) add(buildJsonObject {
            put("at", a.at); put("kind", a.kind); put("text", a.text); put("ref", a.ref)
        })
    }.toString()

    // --- File jobs (05 §7.2; the transfer is Swift) -------------------------------------------

    fun addFile(id: String, kind: String, aircraftId: String, localPath: String, bytes: Long, sha256: String?, meta: String, createdAt: Long) =
        q.addFile(id, kind, aircraftId, localPath, bytes, sha256, meta, createdAt)

    fun setFileStatus(id: String, status: String, progress: Double, error: String?, attemptDelta: Long) =
        q.setFileStatus(status, progress, error, attemptDelta, id)

    fun removeFile(id: String) = q.removeFile(id)

    fun filesJson(): String = buildJsonArray {
        val rows = q.filesAll()
        for (f in rows) add(buildJsonObject {
            put("id", f.id); put("kind", f.kind); put("aircraftId", f.aircraft_id); put("localPath", f.local_path)
            put("bytes", f.bytes); put("status", f.status); put("progress", f.progress); put("attempts", f.attempts)
            put("error", f.error); put("createdAt", f.created_at); put("meta", Json.parseToJsonElement(f.meta))
        })
    }.toString()

    private fun com.mytaillog.core.db.outbox.OutboxQueries.filesAll() =
        outboxDriver.executeQuery(null, "SELECT id FROM file_job ORDER BY created_at, id", { cur ->
            val ids = mutableListOf<String>()
            while (cur.next().value) cur.getString(0)?.let(ids::add)
            QueryResult.Value(ids)
        }, 0).value.mapNotNull { fileById(it).executeAsOneOrNull() }

    // --- Mirror reads -----------------------------------------------------------------------

    /** `_raw` of every row of a typed mirror table for one aircraft, as a JSON array. */
    fun rowsJson(table: String, aircraftId: String): String {
        require(MirrorTables.isTyped(table)) { "Not a typed mirror table: $table" }
        val rows = mirrorDriver.executeQuery(null, "SELECT _raw FROM $table WHERE aircraft_id = ? ORDER BY _seq", { cur ->
            val out = mutableListOf<String>()
            while (cur.next().value) cur.getString(0)?.let(out::add)
            QueryResult.Value(out)
        }, 1) { bindString(0, aircraftId) }.value
        return JsonArray(rows.map { Json.parseToJsonElement(it) }).toString()
    }

    /** Every aircraft row in the mirror, as a JSON array. */
    fun aircraftJson(): String {
        val rows = mirrorDriver.executeQuery(null, "SELECT _raw FROM aircraft ORDER BY tail_number", { cur ->
            val out = mutableListOf<String>()
            while (cur.next().value) cur.getString(0)?.let(out::add)
            QueryResult.Value(out)
        }, 0).value
        return JsonArray(rows.map { Json.parseToJsonElement(it) }).toString()
    }

    /** One stored row (`_raw`), or null: the base row of an edit. */
    fun rawJson(table: String, id: String): String? = mirror.raw(table, id)?.toString()

    fun cursor(): Long = mirror.cursor()

    fun close() {
        http.close()
        mirrorDriver.close()
        outboxDriver.close()
    }
}

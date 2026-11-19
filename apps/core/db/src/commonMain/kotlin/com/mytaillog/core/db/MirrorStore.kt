package com.mytaillog.core.db

import app.cash.sqldelight.db.QueryResult
import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.db.SqlPreparedStatement
import com.mytaillog.core.db.mirror.MirrorDatabase
import com.mytaillog.core.domain.PullPage
import com.mytaillog.core.domain.PullSink
import com.mytaillog.core.domain.SyncChange
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.longOrNull

const val MIRROR_DB = "mirror.db"
const val OUTBOX_DB = "outbox.db"

/**
 * mirror.db: server truth (05 §6.2, §6.3). Applies pulled pages to the typed tables
 * (unknown tables to unknown_record), keeps the cursor, and takes the rows the push
 * endpoint returns. The typed writes are built from [MirrorTables], one code path for
 * every table.
 */
class MirrorStore(private val driver: SqlDriver) : PullSink {
    val db = MirrorDatabase(driver)

    override fun cursor(): Long = db.mirrorQueries.stateValue(CURSOR).executeAsOneOrNull()?.toLongOrNull() ?: 0

    /** One page in one transaction, cursor included, so a crash never skips or half-applies a page (05 §6.3). */
    override fun apply(page: PullPage) = db.transaction {
        for (c in page.changes) when (c.op) {
            SyncChange.Op.Upsert -> upsert(c.table, requireNotNull(c.row) { "upsert without a row: ${c.table}/${c.id}" }, c.seq)
            SyncChange.Op.Delete -> delete(c.table, c.id)
        }
        db.mirrorQueries.setState(CURSOR, page.nextCursor.toString())
    }

    /** "Rebuild from the server" and 410 resync_required: every mirrored row and the cursor go; the outbox is another file. */
    override fun reset() = db.transaction {
        for (table in MirrorTables.columns.keys) driver.execute(null, "DELETE FROM $table", 0)
        db.mirrorQueries.clearUnknown()
        db.mirrorQueries.clearState()
    }

    /** A row the push endpoint returned (server truth after an accepted write, or "Take theirs"). Keeps the row's last seq. */
    fun upsertRow(table: String, row: JsonObject) = db.transaction { upsert(table, row, seq = null) }

    /** The stored row as the server sent it, or null. */
    fun raw(table: String, id: String): JsonObject? {
        val sql = if (MirrorTables.isTyped(table)) "SELECT _raw FROM $table WHERE id = ? AND ? IS NOT NULL" else "SELECT raw FROM unknown_record WHERE id = ? AND table_name = ?"
        return driver.executeQuery(null, sql, { cur -> QueryResult.Value(if (cur.next().value) cur.getString(0) else null) }, 2) {
            bindString(0, id)
            bindString(1, table)
        }.value?.let { Json.parseToJsonElement(it).jsonObject }
    }

    fun count(table: String): Long =
        driver.executeQuery(null, "SELECT count(*) FROM $table", { cur -> cur.next(); QueryResult.Value(cur.getLong(0) ?: 0) }, 0).value

    private fun upsert(table: String, row: JsonObject, seq: Long?) {
        val id = (row["id"] as? JsonPrimitive)?.content ?: error("row without an id: $table")
        val cols = MirrorTables.columns[table]
        if (cols == null) {
            db.mirrorQueries.upsertUnknown(table, id, row.toString(), seq ?: 0)
            return
        }
        // A row of an aircraft carries aircraft_id; the aircraft row is its own aircraft.
        val aircraftId = (row["aircraft_id"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: id
        val names = listOf("id", "aircraft_id", "updated_at") + cols.map { it.first } + listOf("_raw", "_seq")
        val seqSql = if (seq != null) "?" else "coalesce((SELECT _seq FROM $table WHERE id = ?), 0)"
        val sql = "INSERT OR REPLACE INTO $table(${names.joinToString()}) VALUES (${List(names.size - 1) { "?" }.joinToString()}, $seqSql)"
        driver.execute(null, sql, names.size) {
            bindString(0, id)
            bindString(1, aircraftId)
            bindText(2, row["updated_at"])
            cols.forEachIndexed { k, (name, type) -> bind(3 + k, type, row[name]) }
            bindString(3 + cols.size, row.toString())
            if (seq != null) bindLong(4 + cols.size, seq) else bindString(4 + cols.size, id)
        }
    }

    private fun delete(table: String, id: String) {
        if (MirrorTables.isTyped(table)) driver.execute(null, "DELETE FROM $table WHERE id = ?", 1) { bindString(0, id) }
        else db.mirrorQueries.deleteUnknown(table, id)
    }

    private fun SqlPreparedStatement.bindText(index: Int, v: kotlinx.serialization.json.JsonElement?) =
        bindString(index, when (v) { null, JsonNull -> null; is JsonPrimitive -> v.content; else -> v.toString() })

    private fun SqlPreparedStatement.bind(index: Int, type: MirrorTables.Type, v: kotlinx.serialization.json.JsonElement?) {
        val p = v as? JsonPrimitive
        when (type) {
            MirrorTables.Type.Text -> bindText(index, v)
            MirrorTables.Type.Integer -> bindLong(index, p?.takeIf { it !is JsonNull }?.let { it.booleanOrNull?.let { b -> if (b) 1L else 0L } ?: it.longOrNull ?: it.doubleOrNull?.toLong() })
            MirrorTables.Type.Real -> bindDouble(index, p?.takeIf { it !is JsonNull }?.doubleOrNull)
        }
    }

    private companion object { const val CURSOR = "cursor" }
}

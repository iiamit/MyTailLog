package com.mytaillog.app

import com.mytaillog.core.db.MirrorTables
import com.mytaillog.core.domain.Mutation
import com.mytaillog.core.domain.Mutations
import com.mytaillog.core.sync.RowRef
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.util.UUID

// Phase 4's records on the phone: rows of the mirror with the outbox laid over them, so a change made
// offline shows at once (with "On this phone", 06 §1.4), and the writes that put changes in the outbox.

fun JsonObject.s(k: String): String? = (this[k] as? JsonPrimitive)?.takeIf { it !is JsonNull }?.contentOrNull?.takeIf { it.isNotEmpty() }
fun JsonObject.d(k: String): Double? = (this[k] as? JsonPrimitive)?.takeIf { it !is JsonNull }?.let { it.doubleOrNull ?: it.contentOrNull?.toDoubleOrNull() }
fun JsonObject.b(k: String): Boolean = (this[k] as? JsonPrimitive)?.booleanOrNull == true
val JsonObject.id: String get() = s("id") ?: ""

/** A row as shown: server truth with this phone's waiting changes applied. */
data class Rec(val row: JsonObject, val pending: Boolean = false, val refused: String? = null, val conflict: Boolean = false) {
    val id get() = row.id
    fun s(k: String) = row.s(k)
    fun d(k: String) = row.d(k)
    fun b(k: String) = row.b(k)
}

/** A change waiting in the outbox, as [overlay] needs it. */
data class Waiting(val type: String, val table: String?, val rowId: String?, val payload: JsonObject, val status: String, val error: String?)

private fun obj(vararg pairs: Pair<String, JsonElement?>) = JsonObject(pairs.filter { it.second != null }.associate { it.first to it.second!! })
private fun p(o: JsonObject, k: String): JsonElement? = o[k]

/** What a waiting change does to its row: the columns it sets, or null when it deletes the row. */
fun patchOf(type: String, payload: JsonObject): JsonObject? = when (type) {
    "squawk.create" -> obj("description" to p(payload, "description"), "severity" to p(payload, "severity"), "status" to JsonPrimitive("open"), "reported_at" to p(payload, "reportedAt"))
    "squawk.resolve" -> obj("status" to JsonPrimitive("resolved"), "resolved_at" to p(payload, "resolvedAt"), "resolved_log_entry_id" to p(payload, "resolvedEntryId"), "resolution_notes" to p(payload, "resolutionNotes"))
    "squawk.reopen" -> obj("status" to JsonPrimitive("open"), "resolved_at" to JsonNull, "resolved_log_entry_id" to JsonNull)
    "squawk.update" -> obj("description" to p(payload, "description"), "severity" to p(payload, "severity"))
    "squawkPhoto.create" -> obj("squawk_id" to p(payload, "squawkId"), "taken_at" to p(payload, "takenAt"))
    "oil.create" -> obj("added_date" to p(payload, "date"), "quarts" to p(payload, "quarts"), "tach" to p(payload, "tach"), "hobbs" to p(payload, "hobbs"), "notes" to p(payload, "notes"))
    "reading.create" -> obj("reading_date" to p(payload, "date"), "tach" to p(payload, "tach"), "hobbs" to p(payload, "hobbs"), "source" to (p(payload, "source") ?: JsonPrimitive("manual")))
    "reading.update" -> obj("reading_date" to p(payload, "date"), "tach" to (p(payload, "tach") ?: JsonNull), "hobbs" to (p(payload, "hobbs") ?: JsonNull))
    "meterReset.create" -> obj("meter" to p(payload, "meter"), "reset_date" to p(payload, "date"), "prior_value" to p(payload, "prior"), "new_value" to p(payload, "next"))
    "mx.upsert" -> payload["item"] as? JsonObject
    "ad.upsert" -> payload["record"] as? JsonObject
    "ad.track" -> obj(
        "kind" to (p(payload, "kind") ?: JsonPrimitive("ad")), "reference" to p(payload, "reference"), "title" to p(payload, "title"), "status" to JsonPrimitive("open"),
        "recurring" to (p(payload, "recurring") ?: JsonPrimitive(false)), "interval_hours" to p(payload, "intervalHours"), "interval_months" to p(payload, "intervalMonths"),
    )
    "component.upsert" -> (payload["component"] as? JsonObject)?.let { JsonObject(it + ("is_installed" to (it["is_installed"] ?: JsonPrimitive(true)))) }
    "component.remove" -> obj("is_installed" to JsonPrimitive(false), "removal_date" to p(payload, "date"), "removal_entry_id" to p(payload, "entryId"))
    "component.reinstall" -> obj("is_installed" to JsonPrimitive(true), "removal_date" to JsonNull, "removal_entry_id" to JsonNull)
    "wb.upsert" -> payload["fields"] as? JsonObject
    "document.update" -> payload["fields"] as? JsonObject
    "document.setEntry" -> obj("log_entry_id" to (p(payload, "entryId") ?: JsonNull))
    "document.setExpiry" -> obj("track_expiry" to p(payload, "trackExpiry"), "expires_on" to (p(payload, "expiresOn") ?: JsonNull))
    else -> if (type.endsWith(".delete")) null else JsonObject(emptyMap())
}

/**
 * [rows] of [table] with the waiting changes laid over them in queue order: creates appear, deletes
 * disappear, updates set their columns. A refused change is shown on its row and not applied.
 */
fun overlay(table: String, rows: List<JsonObject>, waiting: List<Waiting>): List<Rec> {
    val out = LinkedHashMap<String, Rec>()
    rows.forEach { out[it.id] = Rec(it) }
    for (w in waiting) {
        if (w.table != table || w.rowId == null) continue
        val cur = out[w.rowId]
        if (w.status == "refused") { cur?.let { out[w.rowId] = it.copy(refused = w.error ?: "Refused by the server.") }; continue }
        if (w.status == "conflict") { cur?.let { out[w.rowId] = it.copy(conflict = true) }; continue }
        val patch = patchOf(w.type, w.payload)
        if (patch == null) { out.remove(w.rowId); continue }
        if (cur == null && patch.isEmpty()) continue // a change with nothing to show (mx.seedStandard) makes no row
        val base = cur?.row ?: JsonObject(mapOf("id" to JsonPrimitive(w.rowId)))
        out[w.rowId] = Rec(JsonObject(base + patch.filterKeys { it != "id" }), pending = true, refused = cur?.refused)
    }
    return out.values.toList()
}

/** Every row of [table] for [aircraftId], as shown on this phone. */
fun OfflineStore.records(table: String, aircraftId: String): List<Rec> {
    val rows = if (MirrorTables.isTyped(table)) rows(table, "aircraft_id = ?", aircraftId) else unknownRows(table, aircraftId)
    return overlay(table, rows, waiting(aircraftId))
}

fun OfflineStore.waiting(aircraftId: String): List<Waiting> = queued().filter { it.aircraft_id == aircraftId }.map {
    Waiting(it.type, it.target_table, it.target_id, Json.parseToJsonElement(it.payload).jsonObject, it.status, it.error)
}

/**
 * Queue one change to [table]/[rowId] (05 §6.4). Inserts use the new row's id as the change id, so a
 * photo or a dependent change can wait on it. Returns the change id.
 * shortcut: a change to a row that is still only on this phone carries a far-future base (the server
 * row it was "read" from doesn't exist yet, so there is nothing to conflict with); upgrade when the
 * outbox can fold an edit into the waiting insert.
 */
fun OfflineStore.change(type: String, aircraftId: String, table: String, rowId: String, label: String, payload: JsonObject, dependsOn: String? = null): String {
    val id = if (!Mutations.needsBase(type, payload) && queued().none { it.id == rowId }) rowId else UUID.randomUUID().toString()
    val base = if (Mutations.needsBase(type, payload)) mirror.raw(table, rowId)?.s("updated_at") ?: NOT_ON_SERVER else null
    enqueue(Mutation(id, type, aircraftId, payload, base), label, RowRef(table, rowId), dependsOn)
    return id
}

/**
 * Delete [rowId]: a row that is still only on this phone is simply taken out of the outbox with every
 * change waiting on it; otherwise [type] is queued.
 */
fun OfflineStore.delete(type: String, aircraftId: String, table: String, rowId: String, label: String, payload: JsonObject) {
    if (mirror.raw(table, rowId) == null && queued().any { it.target_id == rowId && it.status != "sending" }) {
        queued().filter { it.target_id == rowId || it.depends_on == rowId }.forEach { discard(it.id) }
        return
    }
    change(type, aircraftId, table, rowId, label, payload)
}

const val NOT_ON_SERVER = "9999-12-31T00:00:00Z"

fun newId(): String = UUID.randomUUID().toString()

fun json(vararg pairs: Pair<String, Any?>): JsonObject = buildJsonObject {
    for ((k, v) in pairs) put(k, when (v) {
        null -> JsonNull
        is JsonElement -> v
        is String -> JsonPrimitive(v)
        is Number -> JsonPrimitive(v)
        is Boolean -> JsonPrimitive(v)
        else -> JsonPrimitive(v.toString())
    })
}

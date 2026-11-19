package com.mytaillog.core.sync

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject

/** One field of a conflict: what the owner saw (base), what they set (mine), what the server holds (theirs). */
data class FieldDiff(val field: String, val base: JsonElement?, val mine: JsonElement, val theirs: JsonElement?) {
    val changedByMe get() = !same(mine, base)
    val changedByThem get() = !same(theirs, base)
    /** Both changed it, to different values: "Keep both changes" is not offered. */
    val clash get() = changedByMe && changedByThem && !same(mine, theirs)
}

private fun same(a: JsonElement?, b: JsonElement?) = (a ?: JsonNull) == (b ?: JsonNull)

/**
 * The three-way diff behind M-SYS-01 (05 §6.6). Payload keys map to columns by snake_case, the
 * same rule as `mineFields` in apps/web/src/lib/sync/mutations.ts.
 * shortcut: the web's per-type COLUMN_ALIAS (`date` → `reading_date`, …) is not ported; those
 * fields show as changed-by-me only. Port the table when a screen shows those types' conflicts.
 */
object Conflicts {
    private val ID_KEY = Regex("(^id$|Id$|Ids$|_id$)")
    private val NESTED = listOf("fields", "item", "record", "component")
    private fun snake(k: String) = k.replace(Regex("[A-Z]")) { "_" + it.value.lowercase() }

    /** The row-shaped fields a payload sets, keyed by column. */
    fun mine(payload: JsonObject): Map<String, JsonElement> {
        val src = NESTED.firstNotNullOfOrNull { payload[it] as? JsonObject } ?: payload
        return src.filterKeys { !ID_KEY.containsMatchIn(it) }.mapKeys { snake(it.key) }
    }

    fun diff(baseRow: JsonObject?, payload: JsonObject, serverRow: JsonObject?): List<FieldDiff> =
        mine(payload).map { (col, v) -> FieldDiff(col, baseRow?.get(col), v, serverRow?.get(col)) }

    fun canKeepBoth(diffs: List<FieldDiff>) = diffs.none { it.clash }

    /**
     * "Keep both changes": re-submit only the fields the owner actually changed, so the
     * other person's edits to the rest survive. Identity keys stay.
     */
    fun onlyMine(payload: JsonObject, baseRow: JsonObject?): JsonObject {
        val nestedKey = NESTED.firstOrNull { payload[it] is JsonObject }
        fun keep(src: JsonObject) = JsonObject(src.filter { (k, v) -> ID_KEY.containsMatchIn(k) || !same(v, baseRow?.get(snake(k))) })
        return if (nestedKey != null) JsonObject(payload + (nestedKey to keep(payload[nestedKey] as JsonObject))) else keep(payload)
    }
}

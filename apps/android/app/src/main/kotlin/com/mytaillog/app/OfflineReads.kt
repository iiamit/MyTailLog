package com.mytaillog.app

import com.mytaillog.core.api.AircraftAccess
import com.mytaillog.core.api.AircraftRole
import com.mytaillog.core.api.AircraftSummary
import com.mytaillog.core.api.ApiHttpException
import com.mytaillog.core.api.StatusSnapshot
import com.mytaillog.core.domain.Mutation
import com.mytaillog.core.domain.due.StatusBody
import com.mytaillog.core.sync.RowRef
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.io.File

private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

/**
 * The server's answer when there is one, else the last one this phone kept (09 §3.12: the server
 * snapshot stays the authority; offline shows the last snapshot, dated by its own "synced" time).
 * An HTTP refusal is not "offline" and is never papered over.
 */
suspend fun <T> lastKnown(file: File, fetch: suspend () -> T, encode: (T) -> String, decode: (String) -> T): T = try {
    fetch().also { v -> runCatching { file.parentFile?.mkdirs(); OfflineStore.writeAtomically(file, encode(v).toByteArray()) } }
} catch (e: CancellationException) {
    throw e
} catch (e: ApiHttpException) {
    throw e
} catch (e: Exception) {
    file.takeIf { it.exists() }?.let { runCatching { decode(it.readText()) }.getOrNull() } ?: throw e
}

fun encodeStatus(s: StatusSnapshot) = buildJsonObject {
    put("body", json.encodeToJsonElement(StatusBody.serializer(), s.body)); s.computedAt?.let { put("computedAt", it) }
}.toString()

fun decodeStatus(text: String): StatusSnapshot {
    val o = json.parseToJsonElement(text).jsonObject
    return StatusSnapshot(json.decodeFromJsonElement(StatusBody.serializer(), o["body"]!!), o["computedAt"]?.jsonPrimitive?.contentOrNull)
}

fun encodeAircraft(list: List<AircraftAccess>) = JsonArray(list.map { a ->
    buildJsonObject { put("aircraft", json.encodeToJsonElement(AircraftSummary.serializer(), a.aircraft)); put("role", a.role.name) }
}).toString()

fun decodeAircraft(text: String): List<AircraftAccess> = json.parseToJsonElement(text).jsonArray.map { e ->
    val o = e.jsonObject
    AircraftAccess(json.decodeFromJsonElement(AircraftSummary.serializer(), o["aircraft"]!!), AircraftRole.valueOf(o["role"]!!.jsonPrimitive.content))
}

/** Logbooks and review writes that couldn't reach the server go to the outbox with their row (05 §6.4). */
fun queueBookWrites(store: OfflineStore, mutations: List<Mutation>) = mutations.forEach { m ->
    fun id(k: String) = m.payload[k]?.jsonPrimitive?.contentOrNull
    val (label, target) = when {
        m.type.startsWith("entry.") -> "Logbook entry" to id("entryId")?.let { RowRef("log_entry", it) }
        m.type == "page.review" -> "Page review" to id("pageId")?.let { RowRef("page", it) }
        m.type == "gap.setStatus" -> "Logbook gap" to id("gapId")?.let { RowRef("logbook_gap", it) }
        m.type == "entries.confirmClean" -> "Confirm clean pages" to null
        else -> m.type to null
    }
    store.enqueue(m, label, target)
}

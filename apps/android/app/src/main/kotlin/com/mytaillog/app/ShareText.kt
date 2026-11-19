package com.mytaillog.app

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit

// Record rooms (08 §3.16, 09 §4.11) on the phone: the list the server sends, what a new one holds, and the words
// for expiry and opens (06 M-SHARE-01..03, 12).

/** One record room link (GET …/record-rooms row). [url] is null only if the server could not decrypt the token. */
data class Room(
    val id: String,
    val label: String,
    val audience: String,
    val url: String?,
    val createdAt: String,
    val expiresAt: String,
    val revokedAt: String?,
    val active: Boolean,
    val opens: Int,
    val lastOpenedAt: String?,
    val logbooks: Int,
    val documents: Int,
    val scans: Boolean,
    val summary: Boolean,
    val squawks: Boolean,
    val mapWindow: String,
)

/** One open: one browser within 30 minutes, with the parts of the room it looked at. */
data class RoomOpen(val openedAt: String, val lastAt: String, val sections: List<String>)

fun parseRooms(text: String): List<Room> = (runCatching { Json.parseToJsonElement(text) }.getOrNull() as? JsonArray).orEmpty().mapNotNull { e ->
    val o = e as? JsonObject ?: return@mapNotNull null
    val inc = o["includes"] as? JsonObject ?: JsonObject(emptyMap())
    Room(
        o.s("id") ?: return@mapNotNull null, o.s("label") ?: "", o.s("audience") ?: "other", o.s("url"),
        o.s("createdAt") ?: "", o.s("expiresAt") ?: return@mapNotNull null, o.s("revokedAt"), o.b("active"),
        o.d("opens")?.toInt() ?: 0, o.s("lastOpenedAt"),
        (inc["logbookIds"] as? JsonArray)?.size ?: 0, (inc["documentIds"] as? JsonArray)?.size ?: 0,
        inc.b("scans"), inc.b("summary"), inc.b("squawks"), o.s("mapWindow") ?: "whole_life",
    )
}

fun parseOpens(text: String): List<RoomOpen> = runCatching { Json.parseToJsonElement(text).jsonArray }.getOrDefault(JsonArray(emptyList())).mapNotNull { e ->
    val o = e as? JsonObject ?: return@mapNotNull null
    RoomOpen(o.s("openedAt") ?: return@mapNotNull null, o.s("lastAt") ?: o.s("openedAt")!!, (o["sections"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.content })
}

/** The four people a hand-off starts from (M-SHARE-01). `other` is the room for "someone else"; co-owners get an invite instead. */
enum class Audience(val key: String, val days: Int, val mapWindow: String) {
    Ia("ia", 30, "line_ahead"), Buyer("buyer", 30, "whole_life"), Insurer("insurer", 14, "last_5_years"), People("other", 30, "whole_life"),
}

/** The days a link can stay open (09 §4.11). */
val ROOM_DAYS = listOf(7, 14, 30, 90, 180)

/** What a new room holds. Defaults per audience: the IA and the buyer get everything, the insurer the summary and documents. */
data class RoomDraft(
    val audience: Audience,
    val label: String,
    val days: Int,
    val summary: Boolean,
    val logbookIds: Set<String>,
    val scans: Boolean,
    val documentIds: Set<String>,
    val squawks: Boolean,
) {
    fun body(): JsonObject = json(
        "label" to label.trim(), "audience" to audience.key, "mapWindow" to audience.mapWindow, "cover" to "map",
        "includeSummary" to summary, "includeDossier" to (audience == Audience.Buyer),
        "logbookIds" to JsonArray(logbookIds.map(::JsonPrimitive)), "includeScans" to scans,
        "documentIds" to JsonArray(documentIds.map(::JsonPrimitive)), "includeSquawks" to squawks, "includeReporters" to false,
        "expiresInDays" to days,
    )

    val holdsSomething get() = summary || logbookIds.isNotEmpty() || documentIds.isNotEmpty() || squawks

    companion object {
        fun of(a: Audience, tail: String, logbooks: List<String>, documents: List<String>) = RoomDraft(
            a, defaultLabel(a, tail), a.days, summary = true,
            logbookIds = if (a == Audience.Insurer) emptySet() else logbooks.toSet(), scans = a != Audience.Insurer,
            documentIds = documents.toSet(), squawks = a == Audience.Ia,
        )
    }
}

fun defaultLabel(a: Audience, tail: String) = when (a) {
    Audience.Ia -> "$tail annual, for my IA"
    Audience.Buyer -> "$tail pre-buy"
    Audience.Insurer -> "$tail, for my insurer"
    Audience.People -> "$tail records"
}

private fun localDay(iso: String, zone: ZoneId): LocalDate = runCatching { Instant.parse(iso).atZone(zone).toLocalDate() }.getOrElse { LocalDate.parse(iso.take(10)) }

/** "Dec 18, 2026, in 30 days" / "ended Nov 2" / "revoked Nov 2". */
fun roomExpiry(r: Room, now: Instant = Instant.now(), zone: ZoneId = ZoneId.systemDefault()): String {
    val today = now.atZone(zone).toLocalDate()
    r.revokedAt?.let { return "revoked ${dayDate(localDay(it, zone).toString(), today)}" }
    val end = localDay(r.expiresAt, zone)
    if (!Instant.parse(r.expiresAt).isAfter(now)) return "ended ${dayDate(end.toString(), today)}"
    val days = ChronoUnit.DAYS.between(today, end)
    return "${longDate(end.toString())}, ${if (days <= 0) "today" else if (days == 1L) "tomorrow" else "in $days days"}"
}

/** The list row's second line: "Expires Dec 18 · opened 3 times · last Nov 17". */
fun roomLine(r: Room, now: Instant = Instant.now(), zone: ZoneId = ZoneId.systemDefault()): String {
    val today = now.atZone(zone).toLocalDate()
    val end = when {
        r.revokedAt != null -> "Revoked ${dayDate(localDay(r.revokedAt, zone).toString(), today)}"
        !r.active -> "Ended ${dayDate(localDay(r.expiresAt, zone).toString(), today)}"
        else -> "Expires ${dayDate(localDay(r.expiresAt, zone).toString(), today)}"
    }
    val opens = when (r.opens) { 0 -> "not opened yet"; 1 -> "opened once"; else -> "opened ${r.opens} times" }
    val last = r.lastOpenedAt?.let { " · last ${dayDate(localDay(it, zone).toString(), today)}" } ?: ""
    return "$end · $opens$last"
}

/** "5 logbooks with their scans, 14 documents, the summary and open squawks". */
fun roomHolds(r: Room): String {
    val parts = buildList {
        if (r.logbooks > 0) add((if (r.logbooks == 1) "1 logbook" else "${r.logbooks} logbooks") + if (r.scans) " with their scans" else "")
        if (r.documents > 0) add(if (r.documents == 1) "1 document" else "${r.documents} documents")
        if (r.summary) add("the maintenance summary")
        if (r.squawks) add("open squawks")
    }
    return when (parts.size) { 0 -> "Nothing yet"; 1 -> parts[0]; else -> parts.dropLast(1).joinToString(", ") + " and " + parts.last() }.replaceFirstChar { it.uppercase() }
}

/** "Opens on" (M-SHARE-02): what the recipient sees first. */
fun roomOpensOn(mapWindow: String): String = when (mapWindow) {
    "line_ahead" -> "The line ahead, then the tabs"
    "last_5_years" -> "The map of the last five years, then the tabs"
    else -> "The map of the whole life, then the tabs"
}

/** "mytaillog.com/r/7KQ2M4…" for the link row: the scheme dropped, the token kept whole (it is what the QR encodes). */
fun shortUrl(url: String): String = url.removePrefix("https://").removePrefix("http://")

/** One open as a log line: "Nov 17, 9:41 AM · Status, Logbooks". */
fun openLine(o: RoomOpen, zone: ZoneId = ZoneId.systemDefault()): String {
    val t = Instant.parse(o.openedAt).atZone(zone)
    val stamp = t.format(java.time.format.DateTimeFormatter.ofPattern("MMM d, h:mm a", java.util.Locale.US))
    return if (o.sections.isEmpty()) stamp else "$stamp · ${o.sections.joinToString(", ") { it.replaceFirstChar { c -> c.uppercase() } }}"
}

/** Roles as the owner reads them (M-SHARE-03). */
fun roleWord(role: String) = when (role) { "editor" -> "Editor"; "owner" -> "Owner"; else -> "Viewer" }

/** The rooms list body as kept on the phone: only JSON arrays, so a cached error never replaces the list. */
fun isRoomList(text: String) = runCatching { Json.parseToJsonElement(text) is JsonArray }.getOrDefault(false)

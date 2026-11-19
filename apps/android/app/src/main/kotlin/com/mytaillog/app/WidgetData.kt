package com.mytaillog.app

import android.content.Context
import com.mytaillog.core.api.StatusSnapshot
import com.mytaillog.core.domain.due.DueItem
import com.mytaillog.core.domain.due.LineAhead
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.io.File
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale

// The widgets' words (02 §9.14, 05 §11). They read a snapshot the app writes after Status loads; they never open
// the database or the network. The server's StatusBody is computed from confirmed records only (09 §3.1), and
// "no record" items are left out here, so an entry read by AI and not yet confirmed never shows on a widget.

/** The 60-day horizon is fixed (14-decisions.md D6). */
const val WIDGET_DAYS = 60L

/** One list line: **lead** rest, plus the parts the 2×2 widget shows on their own. */
data class WidgetRow(val key: String?, val lead: String, val rest: String, val status: String, val value: String, val about: String?)

data class WidgetView(
    val tail: String?,
    val rows: List<WidgetRow>,
    /** "Nothing due before Jan 17", or the no-aircraft prompt when [tail] is null. */
    val empty: String?,
    /** "as of Nov 16" when the records are more than 24 hours old (05 §11.2). */
    val asOf: String?,
    /** The one accessible summary (02 §9.14 Accessibility). */
    val summary: String,
    /** The 60-day line with the rings of the listed items, for the bitmap. */
    val line: LineAhead?,
)

private val SHORT = DateTimeFormatter.ofPattern("MMM d", Locale.US)
private fun short(iso: String) = LocalDate.parse(iso).format(SHORT)

private fun andList(words: List<String>) = when (words.size) {
    0 -> ""
    1 -> words[0]
    else -> words.dropLast(1).joinToString(", ") + " and " + words.last()
}

fun widgetView(tail: String?, snapshot: StatusSnapshot?, today: LocalDate, now: Instant): WidgetView {
    val body = snapshot?.body
    if (tail == null || body == null) return WidgetView(null, emptyList(), "Open MyTailLog to choose an aircraft.", null, "Open MyTailLog to choose an aircraft.", null)
    val end = today.plusDays(WIDGET_DAYS)
    // Day counts move at midnight without a new snapshot: shift them by the days since the server's "today".
    val shift = ChronoUnit.DAYS.between(LocalDate.parse(body.today), today).coerceAtLeast(0)
    val dated = body.items.filter { it.status != "no_record" && (it.calendar != null || it.hours != null) }

    fun daysNow(i: DueItem) = i.calendar?.let { it.daysLeft - shift }
    fun lapsed(i: DueItem) = i.status == "overdue" || (daysNow(i)?.let { it < 0 } ?: false)
    fun near(i: DueItem): Boolean = lapsed(i) || i.status == "due_soon" ||
        (daysNow(i)?.let { it <= WIDGET_DAYS } ?: false) ||
        (i.hours?.let { h -> h.remaining <= 25 || (h.projectedDate?.let { !LocalDate.parse(it).isAfter(end) } ?: false) } ?: false)

    fun row(i: DueItem): WidgetRow {
        val ifr = if (i.ifrOnly) ", IFR only" else ""
        val h = i.hours
        val c = i.calendar
        return when {
            lapsed(i) && h != null && h.remaining <= 0 && (c == null || daysNow(i)!! >= 0) ->
                WidgetRow(i.key, i.label, "${hours1(-h.remaining)} h over$ifr", "overdue", "${hours1(-h.remaining)} h", "over")
            lapsed(i) && c != null -> WidgetRow(i.key, i.label, "lapsed ${short(c.dueDate)}$ifr", "overdue", "lapsed", short(c.dueDate))
            i.first == "hours" && h != null -> {
                val about = h.projectedDate?.let { "about ${short(it)}" }
                WidgetRow(i.key, i.label, "in ${hours1(h.remaining)} h${about?.let { ", $it" } ?: ""}$ifr", i.status, "${hours1(h.remaining)} h", about)
            }
            c != null -> {
                val d = daysNow(i)!!
                WidgetRow(i.key, i.label, "due ${short(c.dueDate)}$ifr", i.status, "$d ${if (d == 1L) "day" else "days"}", short(c.dueDate))
            }
            else -> WidgetRow(i.key, i.label, "in ${hours1(h!!.remaining)} h$ifr", i.status, "${hours1(h.remaining)} h", null)
        }
    }

    val shown = dated.filter(::near)
    // The next visit in the window, planned before suggested; its items are named on its line, not again below.
    val visit = (body.visits.planned + body.visits.suggested).firstOrNull { v ->
        val d = LocalDate.parse(v.visitDate ?: v.weekOf)
        !d.isBefore(today) && !d.isAfter(end) && v.items.any { vi -> shown.any { it.key == vi.key } }
    }
    val inVisit = visit?.items?.map { it.key }?.toSet().orEmpty()
    val byKey = body.items.associateBy { it.key }
    val visitRow = visit?.let { v ->
        val names = v.items.mapNotNull { byKey[it.key]?.label?.replaceFirstChar { ch -> ch.lowercase() } }
        WidgetRow(null, "${short(v.visitDate ?: v.weekOf)} visit:", andList(names), "visit", short(v.visitDate ?: v.weekOf), null)
    }
    val rows = shown.filter { lapsed(it) && it.key !in inVisit }.map(::row) +
        listOfNotNull(visitRow) +
        shown.filter { !lapsed(it) && it.key !in inVisit }.map(::row)

    val empty = if (rows.isEmpty()) "Nothing due before ${end.format(SHORT)}" else null
    val at = snapshot.computedAt?.let { runCatching { Instant.parse(it) }.getOrNull() }
    val asOf = at?.takeIf { Duration.between(it, now) > Duration.ofHours(24) }?.let { "as of ${it.atZone(java.time.ZoneId.systemDefault()).toLocalDate().format(SHORT)}" }
    val said = rows.joinToString(". ") { "${it.lead.removeSuffix(":")} ${it.rest}" }.ifEmpty { empty!! }
    val listed = shown.map { it.key }.toSet()
    val line = LineAhead(today.toString(), end.toString(), body.lineAhead.rings.filter { it.itemKey in listed }, emptyList())
    return WidgetView(tail, rows, empty, asOf, "$tail, next 60 days: $said.", line)
}

/** The snapshot file the widgets read: `filesDir/widget/current.json` (05 §7.1), deleted on sign-out. */
object WidgetData {
    private fun file(context: Context) = File(context.filesDir, "widget/current.json")

    fun save(context: Context, tail: String, snapshot: StatusSnapshot) {
        val f = file(context)
        f.parentFile?.mkdirs()
        OfflineStore.writeAtomically(f, buildJsonObject { put("tail", tail); put("status", encodeStatus(snapshot)) }.toString().toByteArray())
    }

    fun load(context: Context): Pair<String, StatusSnapshot>? = runCatching {
        val o = Json.parseToJsonElement(file(context).readText()).jsonObject
        o["tail"]!!.jsonPrimitive.content to decodeStatus(o["status"]!!.jsonPrimitive.content)
    }.getOrNull()

    fun clear(context: Context) { file(context).delete() }
}

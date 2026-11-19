package com.mytaillog.app

import com.mytaillog.core.domain.due.DueItem
import com.mytaillog.core.domain.due.PlanResult
import com.mytaillog.core.domain.due.StatusBody
import com.mytaillog.core.domain.due.VisitView
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.time.temporal.TemporalAdjusters
import kotlin.math.roundToLong

// Plan ahead and visits in words and geometry (06 M-STATUS-03/04, 12). The rule itself is core's planDate.

/** 14-decisions.md D5: a fixed 24-month horizon whose first six months are drawn at double scale. */
class PlanScale(val today: LocalDate) {
    val end: LocalDate = today.plusMonths(24)
    private val six = ChronoUnit.DAYS.between(today, today.plusMonths(6)).toDouble()
    private val total = ChronoUnit.DAYS.between(today, end).toDouble()
    private val width = 2 * six + (total - six)

    /** 0 at today, 1 at the horizon's end. */
    fun x(date: LocalDate): Float {
        val d = ChronoUnit.DAYS.between(today, date).toDouble().coerceIn(0.0, total)
        return ((2 * minOf(d, six) + maxOf(0.0, d - six)) / width).toFloat()
    }

    /** The day under [x] (snaps to days), never before tomorrow. */
    fun date(x: Float): LocalDate {
        val u = x.coerceIn(0f, 1f) * width
        val d = if (u <= 2 * six) u / 2 else six + (u - 2 * six)
        return today.plusDays(d.roundToLong().coerceIn(1L, total.toLong()))
    }

    /** Axis labels: "Today", the end of the double-scale stretch, a year on, the end ("Nov 2028"). */
    fun ticks(): List<Pair<Float, String>> = listOf(
        0f to "Today",
        x(today.plusMonths(6)) to monthShort(today.plusMonths(6)),
        x(today.plusMonths(12)) to monthShort(today.plusMonths(12)),
        1f to "${monthShort(end)} ${end.year}",
    )
}

private fun monthShort(d: LocalDate) = d.month.getDisplayName(java.time.format.TextStyle.SHORT, java.util.Locale.US)

private val WORDS = listOf("no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten")

/** 12 §numbers: one to ten in words, then digits. */
fun word(n: Int): String = WORDS.getOrNull(n) ?: n.toString()

/** The suggestion's or booking's key for a route: the visit id, or "s:" and the suggestion key. */
fun visitKey(v: VisitView): String = v.id ?: "s:${v.suggestionKey}"

fun findVisit(body: StatusBody?, extra: List<VisitView>, key: String): VisitView? =
    (body?.visits?.planned.orEmpty() + body?.visits?.suggested.orEmpty() + extra).firstOrNull { visitKey(it) == key }

/** "Dec 7" (the Monday of the visit's week, or its booked day). */
fun visitDay(v: VisitView): String = dayDate(v.visitDate ?: v.weekOf)

/** How planDate names a covering visit: a booking's id, or "sugg:" and the suggestion key. */
fun coveringVisit(covered: String?, visits: List<VisitView>): VisitView? = covered?.let { c ->
    visits.firstOrNull { if (c.startsWith("sugg:")) it.id == null && it.suggestionKey == c.removePrefix("sugg:") else it.id == c }
}

/** Everything lapsed by the plan date (already, then by date), in due order. */
fun lapsedBy(p: PlanResult) = p.lapsed + p.lapses

/**
 * The statement under the scrubber with the date to set in bold: "By Mar 1, at about tach 4256, five items lapse
 * unless the two visits happen." / "By Mar 1, nothing tracked lapses."
 */
fun planStatement(p: PlanResult, today: LocalDate = LocalDate.now()): Pair<String, IntRange> {
    val date = dayDate(p.date, today)
    val head = "By $date"
    val all = lapsedBy(p)
    if (all.isEmpty()) return "$head, nothing tracked lapses." to (3 until head.length)
    val tach = p.metersOnDate.tach?.let { ", at about tach ${it.roundToLong()}" } ?: ""
    val n = all.size
    val visits = all.mapNotNull { it.coveredByVisit }.distinct().size
    val unless = when {
        all.any { it.coveredByVisit == null } -> if (n == 1) " unless it is done" else " unless they are done"
        visits == 1 -> " unless the visit happens"
        else -> " unless the ${word(visits)} visits happen"
    }
    val items = if (n == 1) "one item lapses" else "${word(n)} items lapse"
    return "$head$tach, $items$unless." to (3 until head.length)
}

/** "Close behind: seat-rail AD, 11.9 h left on Mar 1." The item still in date with the least to spare, if any. */
fun closeBehind(p: PlanResult, items: List<DueItem>, today: LocalDate = LocalDate.now()): String? {
    val byKey = items.associateBy { it.key }
    val rate = p.hoursPerWeek
    val next = p.stillInDate.minByOrNull { s ->
        val viaHours = s.spare.hours?.let { h -> if (rate != null && rate > 0) h / (rate / 7) else null }
        listOfNotNull(s.spare.days?.toDouble(), viaHours).minOrNull() ?: Double.MAX_VALUE
    } ?: return null
    val label = byKey[next.key]?.label ?: return null
    val days = next.spare.days
    val hours = next.spare.hours
    val viaHours = hours?.let { h -> if (rate != null && rate > 0) h / (rate / 7) else null }
    val left = if (hours != null && (days == null || (viaHours != null && viaHours < days))) "${hours1(hours)} h" else if (days != null) (if (days == 1) "1 day" else "$days days") else return null
    return "Close behind: $label, $left left on ${dayDate(p.date, today)}."
}

/** "One visit, four items: three before they come due, and the VOR check that has lapsed." */
fun visitStatement(v: VisitView, items: List<DueItem>): String {
    val byKey = items.associateBy { it.key }
    val inIt = v.items.filter { !it.done }
    val n = inIt.size
    if (n == 0) return "Every item in this visit is done."
    val lapsed = inIt.filter { it.status == "overdue" }
    val ahead = n - lapsed.size
    val head = "One visit, ${if (n == 1) "one item" else "${word(n)} items"}"
    return when {
        lapsed.isEmpty() -> "$head, ${if (n == 1) "before it comes due" else "all before they come due"}."
        ahead == 0 -> "$head, ${if (n == 1) "which has lapsed" else "all lapsed"}."
        lapsed.size == 1 -> "$head: ${word(ahead)} before ${if (ahead == 1) "it comes" else "they come"} due, and the ${byKey[lapsed[0].key]?.label?.replaceFirstChar { it.lowercase() } ?: "item"} that has lapsed."
        else -> "$head: ${word(ahead)} before ${if (ahead == 1) "it comes" else "they come"} due, and ${word(lapsed.size)} that have lapsed."
    }
}

/** The status word at the top of a visit (06 M-STATUS-04). */
fun visitStatusWord(status: String): String = when (status) {
    "planned" -> "Planned"
    "in_shop" -> "In the shop"
    "awaiting_records" -> "Awaiting records"
    "done" -> "Done"
    "cancelled" -> "Cancelled"
    else -> "Suggested"
}

/** The Monday of [date]'s week: visits are booked by week (09 §2.5). */
fun mondayOf(date: LocalDate): LocalDate = date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))

/**
 * What goes to the shop with the link (M-STATUS-04 Send): tail, owner, each item with its due date and the page
 * that last did it. Plain text for any mail or message app.
 */
fun visitMessage(tail: String, owner: String?, v: VisitView, items: List<DueItem>, url: String): String {
    val byKey = items.associateBy { it.key }
    val lines = v.items.filter { !it.done }.mapNotNull { byKey[it.key] }.map { i ->
        val due = listOfNotNull(i.calendar?.let { "due ${longDate(it.dueDate)}" }, i.hours?.let { "due ${it.meter} ${hours1(it.dueAt)}" }).joinToString(", ")
        val last = i.lastDone?.let { d -> listOfNotNull(d.date?.let { "last done ${longDate(it)}" }, d.signer?.let { "by $it" }, d.pageLabel).joinToString(" ") }
        val parts = listOfNotNull(due.ifEmpty { null }, last?.ifEmpty { null })
        "- ${i.label}" + if (parts.isEmpty()) "" else ": " + parts.joinToString("; ")
    }
    return buildString {
        append("$tail, visit the week of ${longDate(v.weekOf)}")
        owner?.let { append(" (owner $it)") }
        append(".\n\n")
        lines.forEach { append(it).append('\n') }
        append("\nThe records for these items: $url\n")
    }
}

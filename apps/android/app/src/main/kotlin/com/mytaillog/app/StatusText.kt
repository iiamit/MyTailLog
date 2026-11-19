package com.mytaillog.app

import com.mytaillog.core.domain.due.DueItem
import com.mytaillog.core.domain.due.LineAhead
import com.mytaillog.core.domain.due.Rate
import com.mytaillog.core.domain.due.fmtAbout
import com.mytaillog.core.domain.due.fmtDate
import com.mytaillog.design.MarkKind
import com.mytaillog.design.TrustLevel
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.time.temporal.ChronoUnit
import java.util.Locale

// What Status says about the server's snapshot (06 M-STATUS-*, 02 §5.8, 12 §4–5). Pure, so it is unit-tested.
// The server writes the Verdict; everything here is per-row wording in the same English it uses.

/** Phone home groups (06 M-STATUS-01) in order; "Next 60 days" is W-STATUS-01's deterministic near horizon (04, open question 3). */
enum class DueGroup { Overdue, Near, Later, NoRecord }

fun groupOf(i: DueItem, today: String): DueGroup = when (i.status) {
    "overdue" -> DueGroup.Overdue
    "no_record" -> DueGroup.NoRecord
    "due_soon" -> DueGroup.Near // due soon is always listed near, whatever its distance
    else -> {
        val in60 = LocalDate.parse(today).plusDays(60).toString()
        val near = (i.calendar?.let { it.daysLeft <= 60 } ?: false) ||
            (i.hours?.let { it.remaining <= 25 || (it.projectedDate != null && it.projectedDate!! <= in60) } ?: false)
        if (near) DueGroup.Near else DueGroup.Later
    }
}

/** Non-empty groups in order, items in the server's order (worst first). */
fun grouped(items: List<DueItem>, today: String): List<Pair<DueGroup, List<DueItem>>> =
    items.groupBy { groupOf(it, today) }.toSortedMap().toList()

fun markKind(status: String): MarkKind = when (status) {
    "overdue" -> MarkKind.Overdue
    "due_soon" -> MarkKind.DueSoon
    "no_record" -> MarkKind.NoRecord
    else -> MarkKind.Current
}

/** 12 §4 status words. */
fun statusWord(status: String): String = when (status) {
    "overdue" -> "Overdue"
    "due_soon" -> "Due soon"
    "no_record" -> "No record"
    else -> "Current"
}

private fun plural(n: Int, one: String, many: String) = "$n ${if (n == 1) one else many}"

/** 12 §5: one decimal, thousands separator. */
fun hours1(x: Double): String = String.format(Locale.US, "%,.1f", x)

/** "4,222.1 tach". */
fun meterValue(x: Double, meter: String): String = "${hours1(x)} $meter"

/** The overdue slip: "lapsed 7 days ago", or "2.3 h over" when only the hours limit has passed. Null when not overdue. */
fun overdueText(i: DueItem): String? {
    if (i.status != "overdue") return null
    i.calendar?.takeIf { it.daysLeft < 0 }?.let { return "lapsed ${plural(-it.daysLeft, "day", "days")} ago" }
    i.hours?.takeIf { it.remaining <= 0 }?.let { return "${hours1(-it.remaining)} h over" }
    return "Overdue"
}

/** The right column of a DueRow: "43 days" or "9.7 h" for the limit that bites first. Null for overdue (slip) and no record. */
fun rowValue(i: DueItem): String? {
    if (i.status == "overdue" || i.status == "no_record") return null
    return if (i.first == "hours" && i.hours != null) "${hours1(i.hours!!.remaining)} h"
    else i.calendar?.let { plural(it.daysLeft, "day", "days") }
}

enum class LimitKind { Calendar, Hours, Document }

/** One limit on the meta line; [first] only when the item has both and this one bites first (02 §5.6). */
data class LimitText(val kind: LimitKind, val text: String, val about: String?, val first: Boolean)

fun limits(i: DueItem, today: String): List<LimitText> {
    val both = i.calendar != null && i.hours != null
    return listOfNotNull(
        i.calendar?.let {
            LimitText(if (i.source == "document") LimitKind.Document else LimitKind.Calendar, fmtDate(it.dueDate), null, both && i.first == "calendar")
        },
        i.hours?.let { h ->
            LimitText(LimitKind.Hours, meterValue(h.dueAt, h.meter), h.projectedDate?.let { "about ${fmtAbout(it, today)}" }, both && i.first == "hours")
        },
    )
}

/** Scope words for the meta line ("IFR only", "advisory"). */
fun qualifiers(i: DueItem): List<String> = listOfNotNull("IFR only".takeIf { i.ifrOnly }, "advisory".takeIf { i.advisory })

fun bookName(line: String?): String? = when (line) {
    null -> null
    "prop" -> "Propeller"
    else -> line.replaceFirstChar { it.uppercase() }
}

/** One phrase TalkBack reads for a row (11 §6): "Annual, overdue, lapsed 110 days ago, due Jul 31, 2026, Airframe". */
fun spokenRow(i: DueItem, today: String): String = listOfNotNull(
    i.label,
    statusWord(i.status).lowercase(),
    overdueText(i) ?: rowValue(i)?.let { if (i.first == "hours") "$it left" else "in $it" },
    limits(i, today).joinToString(" or ") { l -> "due ${l.text}${l.about?.let { ", $it" } ?: ""}${if (l.first) ", comes first" else ""}" }.ifEmpty { null },
    qualifiers(i).joinToString(", ").ifEmpty { null },
    bookName(i.line),
).joinToString(", ")

private val FULL_MONTH: (LocalDate) -> String = { it.month.getDisplayName(TextStyle.FULL, Locale.US) }

/** Item detail's Due row for the calendar limit (12 §4): "Dec 31, 2026 · 43 days" / "Due end of December 2026 (Dec 31)". */
fun calendarDue(i: DueItem): String? = i.calendar?.let { c ->
    val d = LocalDate.parse(c.dueDate)
    val date = if (c.calendarMonthRule && d.dayOfMonth == d.lengthOfMonth()) "end of ${FULL_MONTH(d)} ${d.year} (${fmtDate(c.dueDate).substringBefore(",")})" else fmtDate(c.dueDate)
    val left = when {
        c.daysLeft < 0 -> "lapsed ${plural(-c.daysLeft, "day", "days")} ago"
        c.daysLeft == 0 -> "today"
        else -> plural(c.daysLeft, "day", "days")
    }
    "$date · $left"
}

/** Item detail's Due row for the hours limit: "4,222.1 tach · 9.7 h left". */
fun hoursDue(i: DueItem): String? = i.hours?.let { h ->
    val left = if (h.remaining <= 0) "${hours1(-h.remaining)} h over" else "${hours1(h.remaining)} h left"
    "${meterValue(h.dueAt, h.meter)} · $left"
}

/** 12 §4 projection: "about Dec 12 at your recent 1.4 h a week", basis named when not the tach's last 90 days. */
fun projection(i: DueItem, rate: Rate, today: String): String? {
    val h = i.hours ?: return null
    if (h.remaining <= 0) return null
    val date = h.projectedDate ?: return "${hours1(h.remaining)} h left, no recent flying to date it"
    val basis = when {
        "estimate" in h.projectionBasis || "estimate" in rate.basis -> " (from your estimate)"
        "hobbs" in h.projectionBasis || "hobbs" in rate.basis -> " (from hobbs)"
        "year" in h.projectionBasis || "year" in rate.basis -> " (from the past year)"
        else -> ""
    }
    return "about ${fmtAbout(date, today)} at your recent ${hours1(rate.hoursPerWeek)} h a week$basis"
}

/** "Jul 20, 2025 at 4,168.3 tach". */
fun lastDoneText(i: DueItem): String? = i.lastDone?.date?.let { d ->
    val meter = i.hours?.meter ?: "tach"
    fmtDate(d) + (i.lastDone!!.hours?.let { " at ${meterValue(it, meter)}" } ?: "")
}

fun trustLevel(trust: String?, signer: String?): TrustLevel = when {
    trust == "ai_read" -> TrustLevel.AiRead
    signer != null -> TrustLevel.Signed
    else -> TrustLevel.Confirmed
}

/** 12 §7 trust words. */
fun trustWords(level: TrustLevel, signer: String?): String = when (level) {
    TrustLevel.AiRead -> "Read by AI, not yet confirmed"
    TrustLevel.Confirmed -> "Confirmed by you"
    TrustLevel.Signed -> signer?.let { "Signed by $it" } ?: "Signed by a mechanic"
}

/**
 * The SyncLine's state (06 §1.3) from when the server worked the snapshot out: "synced 9:38",
 * "synced yesterday 18:02", "synced Nov 16". Null computedAt: "not synced yet".
 */
fun syncState(computedAt: String?, now: Instant, zone: ZoneId): String {
    val at = computedAt?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return "not synced yet"
    val local = at.atZone(zone)
    val days = ChronoUnit.DAYS.between(local.toLocalDate(), now.atZone(zone).toLocalDate())
    val time = local.format(DateTimeFormatter.ofPattern("H:mm", Locale.US))
    return when {
        days <= 0L -> "synced $time"
        days == 1L -> "synced yesterday $time"
        else -> "synced ${local.format(DateTimeFormatter.ofPattern("MMM d", Locale.US))}"
    }
}

/** The freshness line (06 M-STATUS-01), only when the snapshot is more than 6 hours old: "From records synced Nov 16, 6:02 PM." */
fun freshness(computedAt: String?, now: Instant, zone: ZoneId): String? {
    val at = computedAt?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: return null
    if (Duration.between(at, now) <= Duration.ofHours(6)) return null
    return "From records synced ${at.atZone(zone).format(DateTimeFormatter.ofPattern("MMM d, h:mm a", Locale.US))}."
}

/** Where a date sits across the LineAhead, 0..1: a short solid past stub, then today, then the window (02 §4.5). */
const val LINE_PAST = 0.04f

fun lineX(date: String, ahead: LineAhead): Float {
    val span = ChronoUnit.DAYS.between(LocalDate.parse(ahead.from), LocalDate.parse(ahead.to)).coerceAtLeast(1)
    val d = ChronoUnit.DAYS.between(LocalDate.parse(ahead.from), LocalDate.parse(date)).coerceIn(0, span)
    return LINE_PAST + (1 - LINE_PAST) * d / span
}

/** Axis labels: "Today", one mid month, the end month with its year ("Nov 2027"). */
fun lineTicks(ahead: LineAhead): List<Pair<Float, String>> {
    val from = LocalDate.parse(ahead.from)
    val to = LocalDate.parse(ahead.to)
    val mid = from.plusDays(ChronoUnit.DAYS.between(from, to) / 2).withDayOfMonth(1)
    val month: (LocalDate) -> String = { it.month.getDisplayName(TextStyle.SHORT, Locale.US) }
    return listOf(
        LINE_PAST to "Today",
        lineX(mid.toString(), ahead) to month(mid),
        1f to "${month(to)} ${to.year}",
    )
}

/** The LineAhead as one TalkBack element (06 M-STATUS-01 Accessibility). */
fun lineSummary(ahead: LineAhead, items: List<DueItem>): String {
    val months = ChronoUnit.MONTHS.between(LocalDate.parse(ahead.from), LocalDate.parse(ahead.to))
    val window = if (months >= 2) "next $months months" else "next ${ChronoUnit.DAYS.between(LocalDate.parse(ahead.from), LocalDate.parse(ahead.to))} days"
    val byKey = items.associateBy { it.key }
    val rings = ahead.rings.mapNotNull { r ->
        byKey[r.itemKey]?.let { i -> "${i.label}, ${statusWord(r.status).lowercase()}${if (r.status == "overdue") "" else ", ${fmtDate(r.date)}"}" }
    }
    return "Line ahead, $window. " + (if (rings.isEmpty()) "Nothing on the line." else rings.joinToString(". ") + ".")
}

/** 12 §7 line.undated: "Not on the line: Oil change, needs a date". */
fun undatedLines(ahead: LineAhead, items: List<DueItem>): List<String> {
    val byKey = items.associateBy { it.key }
    return ahead.undated.mapNotNull { byKey[it]?.label }.map { "Not on the line: $it, needs a date" }
}

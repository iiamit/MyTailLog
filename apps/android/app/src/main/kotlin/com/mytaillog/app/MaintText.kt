package com.mytaillog.app

import com.mytaillog.core.domain.due.DueItem
import com.mytaillog.design.MarkKind
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.util.Locale

// Wording for Maintenance, Aircraft and Documents (12 §4, §5), pure so the unit tests pin it.

/** Squawk severity as the owner reads it (C-SQ-01): low · medium · high are Low · Watch · Ground. */
val SEVERITIES = listOf("low", "medium", "high")

fun severityWord(s: String?): String = when (s) { "high" -> "Ground"; "medium" -> "Watch"; else -> "Low" }

/** Ground a slip, Watch a ring, Low a dot: the shape says it as well as the word (status never colour-only). */
fun severityMark(s: String?): MarkKind = when (s) { "high" -> MarkKind.Overdue; "medium" -> MarkKind.DueSoon; else -> MarkKind.Current }

fun ago(iso: String?, today: LocalDate = LocalDate.now()): String? {
    val d = iso?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() } ?: return null
    val n = ChronoUnit.DAYS.between(d, today)
    return when {
        n <= 0 -> "today"
        n == 1L -> "yesterday"
        n < 60 -> "$n days ago"
        else -> dayDate(d.toString(), today)
    }
}

/** "Watch · 10 days ago · Dana · 1 photo" (M-MAINT-05). */
fun squawkMeta(severity: String?, reportedAt: String?, reporter: String?, photos: Int, today: LocalDate = LocalDate.now()): String =
    listOfNotNull(severityWord(severity), ago(reportedAt, today), reporter?.substringBefore(' ')?.takeIf { it.isNotBlank() }, photos.takeIf { it > 0 }?.let { if (it == 1) "1 photo" else "$it photos" })
        .joinToString(" · ")

/** The AD's word and mark: Not applicable and one-time Complied are settled; the rest come from the due list. */
fun adStatus(status: String?, recurring: Boolean, due: DueItem?): Pair<MarkKind, String> = when {
    status == "not_applicable" -> MarkKind.Neutral to "Not applicable"
    status == "superseded" -> MarkKind.Neutral to "Superseded"
    !recurring && (status == "complied" || status == "previously_complied") -> MarkKind.Neutral to "Complied"
    due != null -> markKind(due.status) to statusWord(due.status)
    status == "open" -> MarkKind.NoRecord to "No record"
    else -> MarkKind.Current to "Current"
}

private fun every(hours: Double?, months: Int?): String? = listOfNotNull(
    hours?.let { "${fmtNum(it)} hours" }, months?.let { if (it == 1) "month" else "$it months" },
).takeIf { it.isNotEmpty() }?.joinToString(" or ")?.let { "every $it" }

/**
 * "Recurring, every 100 hours. Complied Jul 14, 2026 at 4168.3; next at tach 4268.3, 55.9 h."
 * One-time: "One-time. Complied Jul 14, 2026." Not applicable: "Reason: …".
 */
fun adSentence(
    status: String?, recurring: Boolean, intervalHours: Double?, intervalMonths: Int?, compliedDate: String?, compliedHours: Double?,
    nextDate: String?, nextHours: Double?, reason: String?, tach: Double?,
): String {
    if (status == "not_applicable") return "Reason: ${reason ?: "not given."}".let { if (it.endsWith(".")) it else "$it." }
    val head = if (recurring) "Recurring${every(intervalHours, intervalMonths)?.let { ", $it" } ?: ""}." else "One-time."
    val complied = compliedDate?.let { d -> " Complied ${longDate(d)}${compliedHours?.let { " at ${fmt1(it)}" } ?: ""}" }
    val next = if (!recurring) null else listOfNotNull(
        nextHours?.let { h -> "tach ${fmt1(h)}${tach?.let { ", ${fmt1(h - it)} h" } ?: ""}" },
        nextDate?.let { "on ${longDate(it)}" },
    ).takeIf { it.isNotEmpty() }?.joinToString(" or ")
    return when {
        complied != null && next != null -> "$head$complied; next at $next."
        complied != null -> "$head$complied."
        next != null -> "$head Next at $next."
        else -> "$head No compliance recorded yet."
    }
}

/** Sort order of M-MAINT-01: overdue, due soon, current recurring, complied one-time, not applicable; then by reference. */
fun adRank(word: String): Int = when (word) { "Overdue" -> 0; "Due soon" -> 1; "No record" -> 2; "Current" -> 3; "Complied" -> 4; else -> 5 }

/** "Required · every 12 calendar months" / "Advisory · every 50 hours" (M-MAINT-04). */
fun itemRule(regulatory: Boolean, months: Int?, hours: Double?, calendarMonth: Boolean): String {
    val m = months?.let { if (calendarMonth) "$it calendar months" else if (it == 1) "month" else "$it months" }
    val h = hours?.let { "${fmtNum(it)} hours" }
    val e = listOfNotNull(m, h).joinToString(" or ").takeIf { it.isNotEmpty() }?.let { " · every $it" } ?: ""
    return (if (regulatory) "Required" else "Advisory") + e
}

/** Item kinds the editor offers, in 06 M-MAINT-04's order. */
val ITEM_KINDS = listOf(
    "annual" to "Annual inspection", "hundred_hour" to "100-hour inspection", "transponder" to "Transponder",
    "pitot_static" to "Pitot-static and altimeter", "elt" to "ELT inspection", "elt_battery" to "ELT battery",
    "vor_check" to "VOR check", "oil_change" to "Oil and filter change", "engine_tbo" to "Engine TBO",
    "prop_overhaul" to "Propeller overhaul", "other" to "Something else",
)

val CALENDAR_MONTH = setOf("annual", "transponder", "pitot_static", "elt")

/** Next due from a last-done date and hours (the engine's rule: calendar-month kinds run to the month's end). */
fun nextDue(kind: String, lastDate: String?, lastHours: Double?, months: Int?, hours: Double?): Pair<String?, Double?> {
    val date = if (lastDate != null && months != null) runCatching {
        val d = LocalDate.parse(lastDate.take(10)).plusMonths(months.toLong())
        (if (kind in CALENDAR_MONTH) d.withDayOfMonth(d.lengthOfMonth()) else d).toString()
    }.getOrNull() else null
    return date to if (lastHours != null && hours != null) lastHours + hours else null
}

/**
 * The editor's live preview: "Next due works out to Jul 31, 2027, or tach 4268.3, whichever is first."
 * With a flying rate the hours limit gets a date, and the earlier one is named.
 */
fun nextDuePreview(kind: String, lastDate: String?, lastHours: Double?, months: Int?, hours: Double?, meter: String, now: Double?, hoursPerDay: Double?, today: LocalDate = LocalDate.now()): String? {
    val (date, at) = nextDue(kind, lastDate, lastHours, months, hours)
    if (date == null && at == null) return null
    val hoursDate = if (at != null && now != null && hoursPerDay != null && hoursPerDay > 0) today.plusDays(((at - now) / hoursPerDay).toLong().coerceAtLeast(0)) else null
    val parts = listOfNotNull(date?.let(::longDate), at?.let { "$meter ${fmt1(it)}" })
    val base = "Next due works out to ${parts.joinToString(", or ")}"
    if (date == null || at == null) return "$base."
    val first = when {
        hoursDate == null -> "whichever is first"
        hoursDate.isBefore(LocalDate.parse(date)) -> "the hours first, about ${longDate(hoursDate.toString())}"
        else -> "the date first"
    }
    return "$base, $first."
}

/** What a meter reading says about where it came from (M-AIRCRAFT-02). */
fun readingSource(source: String?): String = when (source) {
    "manual" -> "logged by you"
    "tach_photo" -> "from a photo of the tach"
    "myflightbook" -> "from MyFlightBook"
    "adsb" -> "from ADS-B"
    "log_entry", "entry", "extraction" -> "from a log entry"
    null -> "logged"
    else -> "from ${source.replace('_', ' ')}"
}

fun editableReading(source: String?) = source == "manual" || source == "tach_photo"

/** Hours per quart over top-offs with a tach: the hours flown across them over the quarts after the first. */
fun hoursPerQuart(adds: List<Pair<Double, Double>>): Double? {
    val s = adds.sortedBy { it.first }
    if (s.size < 2) return null
    val quarts = s.drop(1).sumOf { it.second }
    return if (quarts > 0) (s.last().first - s.first().first) / quarts else null
}

/** Hours between consecutive top-offs per quart added, the last [n] intervals (the bar chart). */
fun burnIntervals(adds: List<Pair<Double, Double>>, n: Int = 12): List<Double> =
    adds.sortedBy { it.first }.zipWithNext { a, b -> if (b.second > 0) (b.first - a.first) / b.second else 0.0 }.takeLast(n)

/** Moment from weight and arm, when the moment wasn't given (W&B "Moment is computed"). */
fun moment(weight: Double?, arm: Double?, given: Double?): Double? = given ?: if (weight != null && arm != null) weight * arm else null

fun fmt2(x: Double?): String = x?.let { String.format(Locale.US, "%,.2f", it) } ?: "—"
fun fmt3(x: Double?): String = x?.let { String.format(Locale.US, "%.3f", it) } ?: "—"

/** The four carry-aboard documents (AROW) in M-DOCS-01's order. */
val CARRY_ABOARD = listOf("airworthiness_cert", "registration", "poh_afm", "weight_balance")

val DOC_TYPES = listOf(
    "registration" to "Registration", "airworthiness_cert" to "Airworthiness certificate", "poh_afm" to "Operating handbook",
    "weight_balance" to "Weight and balance", "insurance" to "Insurance policy", "form_337" to "Form 337", "form_8130_3" to "8130-3",
    "stc" to "STC", "radio_license" to "Radio licence", "ica" to "ICA", "maintenance_manual" to "Maintenance manual", "other" to "Other",
)

fun docTypeName(t: String?) = DOC_TYPES.firstOrNull { it.first == t }?.second ?: "Document"

/** Types whose expiry the add sheet asks for (M-DOCS-03). */
val EXPIRING = setOf("registration", "insurance", "radio_license")

/** "PDF · added Jan 2026" */
fun docMeta(mime: String?, createdAt: String?): String = listOfNotNull(
    when { mime == null -> null; mime.contains("pdf") -> "PDF"; mime.startsWith("image/") -> "Photo"; else -> "File" },
    createdAt?.let { runCatching { "added " + LocalDate.parse(it.take(10)).format(java.time.format.DateTimeFormatter.ofPattern("MMM yyyy", Locale.US)) }.getOrNull() },
).joinToString(" · ")

/**
 * What a flight moved (M-FLIGHT-04): each hours-limited item on [meter], with hours left before and after.
 * Calendar-only items don't move.
 */
data class Moved(val label: String, val before: Double, val after: Double, val status: String)

fun movedBy(items: List<DueItem>, meter: String, before: Double, after: Double): List<Moved> = items
    .filter { it.hours?.meter == meter && after > before }
    .map { i -> val h = i.hours!!; Moved(i.label, h.dueAt - before, h.dueAt - after, if (h.dueAt - after < 0) "overdue" else i.status) }

package com.mytaillog.core.domain.due

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlin.math.ceil
import kotlin.math.floor

// Kotlin port of apps/web/src/lib/due/engine.ts (09 §3.1–3.4, 3.6; 12 §4). Same rules,
// same output; packages/shared/fixtures/*.json pins both. Change one, change both.

const val ALGO_VERSION = 1

// --- Input: database rows (snake_case) -------------------------------------------

@Serializable data class AircraftRow(
    val id: String,
    @SerialName("tail_number") val tailNumber: String,
    @SerialName("enrollment_date") val enrollmentDate: String? = null,
    @SerialName("enrollment_tach") val enrollmentTach: Double? = null,
    @SerialName("enrollment_hobbs") val enrollmentHobbs: Double? = null,
    @SerialName("enrollment_airframe") val enrollmentAirframe: Double? = null,
    @SerialName("expected_hours_per_week") val expectedHoursPerWeek: Double? = null,
    @SerialName("situation_override") val situationOverride: String? = null,
)

@Serializable data class MaintenanceItemRow(
    val id: String,
    val kind: String,
    val label: String,
    val regulatory: Boolean,
    @SerialName("interval_months") val intervalMonths: Int? = null,
    @SerialName("interval_hours") val intervalHours: Double? = null,
    @SerialName("last_done_date") val lastDoneDate: String? = null,
    @SerialName("last_done_hours") val lastDoneHours: Double? = null,
    @SerialName("next_due_date") val nextDueDate: String? = null,
    @SerialName("next_due_hours") val nextDueHours: Double? = null,
    val meter: String? = null,
    val line: String? = null,
    @SerialName("provider_id") val providerId: String? = null,
    @SerialName("ifr_only") val ifrOnly: Boolean = false,
    @SerialName("expires_on") val expiresOn: String? = null,
)

@Serializable data class AdComplianceRow(
    val id: String,
    val kind: String,
    val reference: String,
    val recurring: Boolean,
    val status: String,
    @SerialName("interval_months") val intervalMonths: Int? = null,
    @SerialName("interval_hours") val intervalHours: Double? = null,
    @SerialName("complied_date") val compliedDate: String? = null,
    @SerialName("complied_hours") val compliedHours: Double? = null,
    @SerialName("next_due_date") val nextDueDate: String? = null,
    @SerialName("next_due_hours") val nextDueHours: Double? = null,
    @SerialName("reference_entry_id") val referenceEntryId: String? = null,
    @SerialName("provider_id") val providerId: String? = null,
)

@Serializable data class DocumentRow(
    val id: String,
    val type: String,
    val title: String? = null,
    @SerialName("expires_on") val expiresOn: String? = null,
    @SerialName("renews_every_months") val renewsEveryMonths: Int? = null,
    @SerialName("track_expiry") val trackExpiry: Boolean,
    @SerialName("remind_lead_days") val remindLeadDays: Int? = null,
)

@Serializable data class ItemCompletionRow(
    val id: String,
    @SerialName("maintenance_item_id") val maintenanceItemId: String? = null,
    @SerialName("ad_compliance_id") val adComplianceId: String? = null,
    @SerialName("log_entry_id") val logEntryId: String? = null,
    @SerialName("done_date") val doneDate: String,
    @SerialName("done_hours") val doneHours: Double? = null,
)

@Serializable data class LogEntryRow(
    val id: String,
    @SerialName("logbook_id") val logbookId: String,
    @SerialName("page_id") val pageId: String? = null,
    @SerialName("entry_date") val entryDate: String? = null,
    val tach: Double? = null,
    val hobbs: Double? = null,
    val airframe: Double? = null,
    val trust: String,
    @SerialName("replaced_by_entry_id") val replacedByEntryId: String? = null,
    @SerialName("signature_name") val signatureName: String? = null,
)

@Serializable data class LogbookRow(val id: String, val type: String)

@Serializable data class PageRow(
    val id: String,
    @SerialName("logbook_id") val logbookId: String,
    @SerialName("page_sequence") val pageSequence: Int? = null,
    @SerialName("extraction_status") val extractionStatus: String? = null,
)

@Serializable data class HoursReadingRow(
    val id: String,
    @SerialName("reading_date") val readingDate: String? = null,
    val tach: Double? = null,
    val hobbs: Double? = null,
    val airframe: Double? = null,
    val source: String,
)

@Serializable data class MeterResetRow(
    val meter: String,
    @SerialName("reset_date") val resetDate: String,
    @SerialName("prior_value") val priorValue: Double? = null,
    @SerialName("new_value") val newValue: Double,
)

@Serializable data class PlannedVisitRow(
    val id: String,
    val status: String,
    @SerialName("week_of") val weekOf: String,
    @SerialName("visit_date") val visitDate: String? = null,
    @SerialName("provider_id") val providerId: String? = null,
    val airport: String? = null,
)

@Serializable data class PlannedVisitItemRow(@SerialName("visit_id") val visitId: String, @SerialName("item_key") val itemKey: String)
@Serializable data class ServiceProviderRow(val id: String, val name: String)
@Serializable data class RecordRoomRow(val audience: String, @SerialName("expires_at") val expiresAt: String, @SerialName("revoked_at") val revokedAt: String? = null)
@Serializable data class SquawkRow(val id: String, val description: String, val severity: String? = null, val status: String)

@Serializable data class DueInput(
    val aircraft: AircraftRow,
    @SerialName("maintenance_item") val maintenanceItem: List<MaintenanceItemRow> = emptyList(),
    @SerialName("ad_compliance") val adCompliance: List<AdComplianceRow> = emptyList(),
    val document: List<DocumentRow> = emptyList(),
    @SerialName("item_completion") val itemCompletion: List<ItemCompletionRow> = emptyList(),
    @SerialName("log_entry") val logEntry: List<LogEntryRow> = emptyList(),
    val logbook: List<LogbookRow> = emptyList(),
    val page: List<PageRow> = emptyList(),
    @SerialName("hours_reading") val hoursReading: List<HoursReadingRow> = emptyList(),
    @SerialName("meter_reset") val meterReset: List<MeterResetRow> = emptyList(),
    @SerialName("planned_visit") val plannedVisit: List<PlannedVisitRow> = emptyList(),
    @SerialName("planned_visit_item") val plannedVisitItem: List<PlannedVisitItemRow> = emptyList(),
    @SerialName("service_provider") val serviceProvider: List<ServiceProviderRow> = emptyList(),
    @SerialName("record_room") val recordRoom: List<RecordRoomRow> = emptyList(),
    val squawk: List<SquawkRow> = emptyList(),
)

// --- Output: API shapes (09 §4.3) ----------------------------------------------------

@Serializable data class MeterView(val face: Double?, val stitched: Double?, val asOf: String?, val source: String?, val readingId: String?)

@Serializable data class Rate(
    val hoursPerDay: Double,
    val hoursPerWeek: Double,
    val basis: String,
    val meter: String,
    val sampleCount: Int,
    val windowStart: String?,
    val windowEnd: String?,
    val confidence: String,
)

@Serializable data class CalendarLimit(val dueDate: String, val daysLeft: Int, val calendarMonthRule: Boolean)

@Serializable data class HoursLimit(
    val meter: String,
    val dueAt: Double,
    val remaining: Double,
    val projectedDate: String?,
    val projectionBasis: String,
    val estimatedMeter: Boolean,
)

@Serializable data class LastDone(
    val date: String?,
    val hours: Double?,
    val entryId: String?,
    val pageId: String?,
    val pageLabel: String?,
    val trust: String?,
    val signer: String?,
)

@Serializable data class Reminder(val nextAt: String? = null, val kind: String? = null, val snoozedUntil: String? = null)

@Serializable data class DueItem(
    val key: String,
    val source: String,
    val kind: String,
    val label: String,
    val rule: String,
    val line: String?,
    val regulatory: Boolean,
    val advisory: Boolean,
    val ifrOnly: Boolean,
    val status: String,
    val calendar: CalendarLimit?,
    val hours: HoursLimit?,
    val first: String?,
    val firstDate: String?,
    val lastDone: LastDone?,
    val waitingEntryId: String?,
    val providerId: String?,
    val visitId: String?,
    val reminder: Reminder = Reminder(),
)

@Serializable data class Ring(val itemKey: String, val line: String, val date: String, val dateKind: String, val status: String)
@Serializable data class Verdict(val text: String, val emphasis: List<List<Int>>, val lines: List<String>)
@Serializable data class Visits(val suggested: List<JsonElement> = emptyList(), val planned: List<JsonElement> = emptyList())
@Serializable data class LineAhead(val from: String, val to: String, val rings: List<Ring>, val undated: List<String>)
@Serializable data class Counts(val overdue: Int, val dueSoon: Int, val noRecord: Int, val pagesToReview: Int, val pagesBeingRead: Int, val openSquawks: Int)

@Serializable data class StatusBody(
    val aircraftId: String,
    val algoVersion: Int,
    val today: String,
    val situation: String,
    val verdict: Verdict,
    val meters: Map<String, MeterView>,
    val rate: Rate,
    val items: List<DueItem>,
    val visits: Visits,
    val lineAhead: LineAhead,
    val counts: Counts,
)

// --- Dates (proleptic Gregorian, YYYY-MM-DD) -------------------------------------------

internal object Dates {
    private fun epochDay(y0: Int, m: Int, d: Int): Long {
        val y = if (m <= 2) y0 - 1 else y0
        val era = IntMath.floorDiv(y, 400)
        val yoe = y - era * 400
        val doy = (153 * (m + (if (m > 2) -3 else 9)) + 2) / 5 + d - 1
        val doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
        return era.toLong() * 146097 + doe - 719468
    }
    private fun civil(z0: Long): Triple<Int, Int, Int> {
        val z = z0 + 719468
        val era = IntMath.floorDiv(z, 146097L)
        val doe = (z - era * 146097).toInt()
        val yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365
        val doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
        val mp = (5 * doy + 2) / 153
        val d = doy - (153 * mp + 2) / 5 + 1
        val m = if (mp < 10) mp + 3 else mp - 9
        val y = yoe + era.toInt() * 400 + (if (m <= 2) 1 else 0)
        return Triple(y, m, d)
    }
    fun parts(s: String): Triple<Int, Int, Int> = s.split("-").let { Triple(it[0].toInt(), it[1].toInt(), it[2].toInt()) }
    private fun fmt(y: Int, m: Int, d: Int) = "${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}"
    private fun day(s: String) = parts(s).let { (y, m, d) -> epochDay(y, m, d) }
    fun addDays(s: String, n: Long): String = civil(day(s) + n).let { (y, m, d) -> fmt(y, m, d) }
    fun between(from: String, to: String): Int = (day(to) - day(from)).toInt()
    private fun lastDay(y: Int, m: Int): Int = (civil(epochDay(if (m == 12) y + 1 else y, if (m == 12) 1 else m + 1, 1) - 1)).third
    private fun shift(y: Int, m: Int, months: Int): Pair<Int, Int> {
        val idx = y * 12 + (m - 1) + months
        return Pair(IntMath.floorDiv(idx, 12), IntMath.floorMod(idx, 12) + 1)
    }
    fun addMonths(s: String, months: Int): String {
        val (y, m, d) = parts(s)
        val (ny, nm) = shift(y, m, months)
        return fmt(ny, nm, minOf(d, lastDay(ny, nm)))
    }
    fun endOfMonthAfter(s: String, months: Int): String {
        val (y, m, _) = parts(s)
        val (ny, nm) = shift(y, m, months)
        return fmt(ny, nm, lastDay(ny, nm))
    }
}

private object IntMath {
    fun floorDiv(a: Int, b: Int): Int = (a - floorMod(a, b)) / b
    fun floorMod(a: Int, b: Int): Int = ((a % b) + b) % b
    fun floorDiv(a: Long, b: Long): Long = (a - (((a % b) + b) % b)) / b
}

private val MONTHS = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
fun fmtDate(d: String): String = Dates.parts(d).let { (y, m, day) -> "${MONTHS[m - 1]} $day, $y" }
private fun fmtShort(d: String, today: String): String = Dates.parts(d).let { (y, m, day) ->
    if (y == Dates.parts(today).first) "${MONTHS[m - 1]} $day" else "${MONTHS[m - 1]} $day, $y"
}
fun fmtAbout(d: String, today: String): String {
    val (y, m, day) = Dates.parts(d)
    val n = Dates.between(today, d)
    return if (n <= 120) "${MONTHS[m - 1]} $day" else if (n <= 540) "${MONTHS[m - 1]} $y" else "$y"
}

private fun round1(x: Double): Double = floor(x * 10 + 0.5) / 10
/** One decimal, as JS toFixed(1) on an already-rounded value. */
private fun fmt1(x: Double): String {
    val tenths = floor(round1(x) * 10 + 0.5).toLong()
    val sign = if (tenths < 0) "-" else ""
    val a = kotlin.math.abs(tenths)
    return "$sign${a / 10}.${a % 10}"
}
/** JS number to string for whole numbers in rule text ("every 50 h", "every 65.3 h"). */
private fun num(x: Double): String = if (x == floor(x)) x.toLong().toString() else x.toString()

// --- Rule tables (as engine.ts) ----------------------------------------------------

val CALENDAR_MONTH_KINDS = setOf("annual", "transponder", "pitot_static", "elt")
private const val DUE_SOON_DAYS = 90
private const val DUE_SOON_HOURS = 10.0
private const val VOR_DUE_SOON_DAYS = 5
private const val DOC_LEAD_DAYS = 60
private const val STALE_METER_DAYS = 30
private val LANES = listOf("airframe", "engine", "prop", "avionics")
private val METERS = listOf("tach", "hobbs", "airframe")

private val NAMES = mapOf(
    "annual" to "Annual", "hundred_hour" to "100-hour inspection", "transponder" to "Transponder check",
    "pitot_static" to "Pitot-static check", "elt" to "ELT inspection", "elt_battery" to "ELT battery",
    "vor" to "VOR check", "oil_change" to "Oil change", "engine_tbo" to "Engine overhaul", "prop_overhaul" to "Propeller overhaul",
)
private val REGS = mapOf(
    "annual" to "91.409", "hundred_hour" to "91.409", "transponder" to "91.413", "pitot_static" to "91.411",
    "elt" to "91.207", "elt_battery" to "91.207", "vor" to "91.171",
)
private val DEFAULT_LINE = mapOf(
    "transponder" to "avionics", "pitot_static" to "avionics", "elt" to "avionics", "elt_battery" to "avionics", "vor" to "avionics",
    "oil_change" to "engine", "engine_tbo" to "engine", "prop_overhaul" to "prop",
)
private val DOC_NAMES = mapOf(
    "registration" to "Registration", "airworthiness_cert" to "Airworthiness certificate", "radio_license" to "Radio licence",
    "insurance" to "Insurance", "weight_balance" to "Weight and balance", "other" to "Document",
)
private val REGULATORY_DOCS = setOf("registration", "airworthiness_cert", "radio_license")
private val BOOK_NAMES = mapOf("airframe" to "Airframe", "engine" to "Engine", "prop" to "Propeller", "avionics" to "Avionics", "other" to "Other")

private fun every(months: Int?, hours: Double?): String? {
    val p = mutableListOf<String>()
    if (hours != null) p.add("${num(hours)} h")
    if (months != null) p.add(if (months == 1) "month" else "$months months")
    return if (p.isEmpty()) null else "every ${p.joinToString(" or ")}"
}

// --- Meters --------------------------------------------------------------------------

private class Reading(val id: String, val readingId: String?, val date: String?, val source: String, val raw: MutableMap<String, Double?>)
private class Reset(val meter: String, val date: String, val prior: Double, val next: Double)

private fun resolveResets(readings: List<Reading>, rows: List<MeterResetRow>): List<Reset> {
    val out = mutableListOf<Reset>()
    for (meter in METERS) {
        val list = rows.filter { it.meter == meter }.sortedBy { it.resetDate }
        list.forEachIndexed { i, r ->
            var prior = r.priorValue
            if (prior == null) {
                val eraStart = if (i > 0) list[i - 1].resetDate else null
                var max: Double? = null
                for (x in readings) {
                    val v = x.raw[meter] ?: continue
                    val d = x.date ?: ""
                    if (d >= r.resetDate || (eraStart != null && d < eraStart)) continue
                    if (max == null || v > max) max = v
                }
                prior = max ?: 0.0
            }
            out.add(Reset(meter, r.resetDate, prior, r.newValue))
        }
    }
    return out
}

private fun offset(resets: List<Reset>, meter: String, date: String?): Double {
    var sum = 0.0
    for (r in resets) if (r.meter == meter && (date ?: "") >= r.date) sum += r.prior - r.next
    return sum
}
private fun toTotal(v: Double, date: String?, meter: String, resets: List<Reset>): Double =
    if (resets.isNotEmpty()) round1(v + offset(resets, meter, date)) else v

// --- Rate (09 §3.3) -------------------------------------------------------------------

private class Util(val hoursPerDay: Double, val sampleCount: Int, val spanDays: Int, val windowStart: String, val windowEnd: String)

private fun ladder(samples: Int, span: Int): String = when {
    samples >= 6 && span >= 180 -> "high"
    samples >= 4 && span >= 90 -> "medium"
    samples >= 2 && span >= 30 -> "low"
    else -> "none"
}

private fun utilization(readings: List<Reading>, resets: List<Reset>, meter: String, today: String, windowDays: Int): Util? {
    val start = Dates.addDays(today, -windowDays.toLong())
    val dated = readings
        .filter { it.date != null && it.raw[meter] != null && it.date >= start && it.date <= today }
        .map { Pair(it.date!!, it.raw[meter]!!) }
        .sortedWith(compareBy<Pair<String, Double>> { it.first }.thenBy { it.second })
    val pts = mutableListOf<Pair<String, Double>>()
    for (p in dated) if (pts.isNotEmpty() && pts.last().first == p.first) pts[pts.size - 1] = p else pts.add(p)
    var hours = 0.0
    var days = 0
    val used = mutableSetOf<String>()
    for (i in 1 until pts.size) {
        val a = pts[i - 1]
        val b = pts[i]
        if (resets.any { it.meter == meter && it.date > a.first && it.date <= b.first }) continue
        val delta = b.second - a.second
        if (delta < 0) continue
        hours += delta
        days += Dates.between(a.first, b.first)
        used.add(a.first)
        used.add(b.first)
    }
    if (days <= 0 || used.size < 2) return null
    val sorted = used.sorted()
    return Util(hours / days, used.size, days, sorted.first(), sorted.last())
}

private fun selectRate(readings: List<Reading>, resets: List<Reset>, today: String, perWeek: Double?): Rate {
    fun rate(u: Util, basis: String, meter: String, c: String) =
        Rate(u.hoursPerDay, round1(u.hoursPerDay * 7), basis, meter, u.sampleCount, u.windowStart, u.windowEnd, c)
    for ((meter, basis) in listOf("tach" to "trailing_90", "hobbs" to "trailing_90_hobbs")) {
        val u = utilization(readings, resets, meter, today, 90)
        if (u != null && u.sampleCount >= 3 && u.spanDays >= 21 && u.hoursPerDay > 0) {
            val c = ladder(u.sampleCount, u.spanDays)
            return rate(u, basis, meter, if (c == "high") "medium" else if (c == "none") "low" else c)
        }
    }
    for (meter in listOf("tach", "hobbs")) {
        val u = utilization(readings, resets, meter, today, 365)
        if (u != null && u.hoursPerDay > 0) {
            val c = ladder(u.sampleCount, u.spanDays)
            if (c != "none") return rate(u, "trailing_365", meter, c)
        }
    }
    if (perWeek != null && perWeek > 0) return Rate(perWeek / 7, perWeek, "owner_estimate", "tach", 0, null, null, "low")
    return Rate(0.0, 0.0, "none", "tach", 0, null, null, "none")
}

// --- Engine -----------------------------------------------------------------------------

private class HoursDraft(val meter: String, val dueAt: Double, val estimatedMeter: Boolean)
private class Draft(
    val key: String, val source: String, val kind: String, val label: String, val rule: String, val line: String?,
    val regulatory: Boolean, val ifrOnly: Boolean, val dueDate: String?, val monthRule: Boolean, val hours: HoursDraft?,
    val hoursNoMeter: Boolean, val soonDays: Int, val lastDone: LastDone?, val waiting: String?, val providerId: String?,
)
private class LastOf(val last: LastDone?, val waiting: String?, val hadRows: Boolean)

private val RANK = mapOf("overdue" to 0, "due_soon" to 1, "current" to 2, "no_record" to 3)

fun computeStatus(input: DueInput, today: String): StatusBody {
    val a = input.aircraft
    val entries = input.logEntry
    val books = input.logbook.associate { it.id to it.type }
    val pages = input.page.associateBy { it.id }
    val entryById = entries.associateBy { it.id }
    fun counts(e: LogEntryRow?) = e != null && e.trust != "ai_read" && e.replacedByEntryId == null

    val readings = mutableListOf<Reading>()
    fun push(r: Reading) {
        if (r.raw["hobbs"] != null && r.raw["tach"] != null && r.raw["hobbs"] == r.raw["tach"]) r.raw["hobbs"] = null
        if (METERS.any { r.raw[it] != null }) readings.add(r)
    }
    if (a.enrollmentTach != null || a.enrollmentHobbs != null || a.enrollmentAirframe != null)
        push(Reading("starting", null, a.enrollmentDate, "starting",
            mutableMapOf("tach" to a.enrollmentTach, "hobbs" to a.enrollmentHobbs, "airframe" to a.enrollmentAirframe)))
    for (e in entries) if (counts(e))
        push(Reading(e.id, null, e.entryDate, "entry", mutableMapOf("tach" to e.tach, "hobbs" to e.hobbs, "airframe" to e.airframe)))
    for (r in input.hoursReading) if (!r.source.endsWith("_estimate"))
        push(Reading(r.id, r.id, r.readingDate,
            when (r.source) { "manual" -> "manual"; "tach_photo" -> "tach_photo"; else -> "myflightbook" },
            mutableMapOf("tach" to r.tach, "hobbs" to r.hobbs, "airframe" to r.airframe)))
    val resets = resolveResets(readings, input.meterReset)

    val meters = linkedMapOf<String, MeterView>()
    for (m in METERS) {
        var best: Reading? = null
        var bestTotal = 0.0
        for (r in readings) {
            val v = r.raw[m] ?: continue
            val total = toTotal(v, r.date, m, resets)
            val d = r.date ?: ""
            val bd = best?.date ?: ""
            if (best == null || d > bd || (d == bd && total > bestTotal)) { best = r; bestTotal = total }
        }
        meters[m] = if (best != null) MeterView(best.raw[m], bestTotal, best.date, best.source, best.readingId)
        else MeterView(null, null, null, null, null)
    }
    val rate = selectRate(readings, resets, today, a.expectedHoursPerWeek)

    fun pageLabel(pageId: String?): String? {
        val p = pageId?.let { pages[it] } ?: return null
        val seq = p.pageSequence ?: return null
        return "${BOOK_NAMES[books[p.logbookId] ?: "other"] ?: "Other"} p. $seq"
    }
    fun fromEntry(date: String?, hours: Double?, entryId: String?): LastDone {
        val e = entryId?.let { entryById[it] }
        return LastDone(date, hours, e?.id, e?.pageId, pageLabel(e?.pageId), e?.trust ?: "confirmed", e?.signatureName)
    }
    val byLatest = Comparator<ItemCompletionRow> { x, y ->
        y.doneDate.compareTo(x.doneDate).takeIf { it != 0 }
            ?: (y.doneHours ?: -1.0).compareTo(x.doneHours ?: -1.0).takeIf { it != 0 }
            ?: x.id.compareTo(y.id)
    }
    fun lastDoneOf(rows: List<ItemCompletionRow>, pDate: String?, pHours: Double?, pEntry: String?): LastOf {
        val sorted = rows.sortedWith(byLatest)
        val counted = sorted.firstOrNull { it.logEntryId == null || counts(entryById[it.logEntryId]) }
        val waiting = sorted.firstOrNull { c ->
            val e = c.logEntryId?.let { entryById[it] }
            e != null && e.trust == "ai_read" && e.replacedByEntryId == null && (counted == null || c.doneDate > counted.doneDate)
        }
        var last: LastDone? = null
        if (counted != null) last = fromEntry(counted.doneDate, counted.doneHours, counted.logEntryId)
        else if (rows.isEmpty() && (pDate != null || pHours != null) &&
            !(pEntry != null && entryById.containsKey(pEntry) && !counts(entryById[pEntry])))
            last = fromEntry(pDate, pHours, if (pEntry != null && entryById.containsKey(pEntry)) pEntry else null)
        return LastOf(last, waiting?.logEntryId, rows.isNotEmpty())
    }

    val liveVisits = input.plannedVisit.filter { it.status == "planned" || it.status == "in_shop" }.associateBy { it.id }
    val visitOf = mutableMapOf<String, String>()
    for (vi in input.plannedVisitItem) if (liveVisits.containsKey(vi.visitId)) visitOf[vi.itemKey] = vi.visitId

    fun hoursLimit(choice: String?, kind: String, baseHours: Double?, baseDate: String?, interval: Double?, stored: Double?): HoursDraft? {
        var meter = choice ?: if (kind == "oil_change") "hobbs" else "tach"
        var estimated = false
        if (choice == null && meter == "hobbs" && meters["hobbs"]!!.stitched == null && meters["tach"]!!.stitched != null) { meter = "tach"; estimated = true }
        val dueAt = if (baseHours != null && interval != null) round1(toTotal(baseHours, baseDate, meter, resets) + interval)
            else if (baseHours == null && stored != null) toTotal(stored, null, meter, resets) else null
        return dueAt?.let { HoursDraft(meter, it, estimated) }
    }

    val drafts = mutableListOf<Draft>()
    val mxLast = input.maintenanceItem.associate { m ->
        m.id to lastDoneOf(input.itemCompletion.filter { it.maintenanceItemId == m.id }, m.lastDoneDate, m.lastDoneHours, null)
    }
    val annual = input.maintenanceItem.firstOrNull { it.kind == "annual" }
    val annualLast = annual?.let { mxLast[it.id]!!.last }
    for (m in input.maintenanceItem) {
        val lo = mxLast[m.id]!!
        val last = lo.last
        val useStored = last == null && !lo.hadRows
        var dueDate: String? = null
        var monthRule = false
        if (m.expiresOn != null) dueDate = m.expiresOn
        else if (last?.date != null && m.intervalMonths != null && m.intervalMonths != 0) {
            if (m.kind == "vor") dueDate = Dates.addDays(last.date, 30)
            else if (m.kind in CALENDAR_MONTH_KINDS) { dueDate = Dates.endOfMonthAfter(last.date, m.intervalMonths); monthRule = true }
            else dueDate = Dates.addMonths(last.date, m.intervalMonths)
        } else if (useStored && m.nextDueDate != null) dueDate = m.nextDueDate
        var baseHours = last?.hours
        var baseDate = if (baseHours != null) last?.date else null
        if (m.kind == "hundred_hour" && annualLast?.hours != null) {
            val on = m.meter ?: "tach"
            if (baseHours == null || toTotal(annualLast.hours, annualLast.date, on, resets) > toTotal(baseHours, baseDate, on, resets)) {
                baseHours = annualLast.hours; baseDate = annualLast.date
            }
        }
        val hours = hoursLimit(m.meter, m.kind, baseHours, baseDate, m.intervalHours, if (useStored) m.nextDueHours else null)
        val rule = listOfNotNull(
            REGS[m.kind],
            if (m.kind == "vor" && m.intervalMonths != null && m.intervalMonths != 0) "every 30 days" else every(m.intervalMonths, m.intervalHours),
            if (m.expiresOn != null && (m.intervalMonths == null || m.intervalMonths == 0)) "by expiry date" else null,
        ).filter { it.isNotEmpty() }.joinToString(" · ")
        drafts.add(Draft(
            "mx:${m.id}", "maintenance", m.kind, NAMES[m.kind] ?: m.label, rule, m.line ?: DEFAULT_LINE[m.kind] ?: "airframe",
            m.regulatory, m.ifrOnly, dueDate, monthRule, hours, hours != null && meters[hours.meter]!!.stitched == null,
            if (m.kind == "vor") VOR_DUE_SOON_DAYS else DUE_SOON_DAYS, last, lo.waiting, m.providerId,
        ))
    }

    for (ad in input.adCompliance) {
        if (!(ad.recurring || ad.status == "open")) continue
        val lo = lastDoneOf(input.itemCompletion.filter { it.adComplianceId == ad.id }, ad.compliedDate, ad.compliedHours, ad.referenceEntryId)
        val last = lo.last
        val useStored = last == null && !lo.hadRows
        val recurringDone = ad.recurring && last != null
        val dueDate = if (recurringDone && last!!.date != null && ad.intervalMonths != null && ad.intervalMonths != 0) Dates.addMonths(last.date!!, ad.intervalMonths)
            else if (useStored || !ad.recurring) ad.nextDueDate else null
        val base = if (recurringDone && last!!.hours != null) last else null
        val hours = hoursLimit("tach", "ad", base?.hours, base?.date, ad.intervalHours, if (useStored || !ad.recurring) ad.nextDueHours else null)
        val refBook = ad.referenceEntryId?.let { entryById[it] }?.let { books[it.logbookId] }
        drafts.add(Draft(
            "ad:${ad.id}", "ad", ad.kind, "${ad.kind.uppercase()} ${ad.reference}",
            if (ad.recurring) every(ad.intervalMonths, ad.intervalHours) ?: "recurring" else "once",
            if (refBook != null && refBook in LANES) refBook else "airframe",
            ad.kind == "ad", false, dueDate, false, hours, hours != null && meters[hours.meter]!!.stitched == null,
            DUE_SOON_DAYS, last, lo.waiting, ad.providerId,
        ))
    }

    for (d in input.document) {
        if (!d.trackExpiry) continue
        drafts.add(Draft(
            "doc:${d.id}", "document", d.type, d.title ?: DOC_NAMES[d.type] ?: "Document",
            if (d.renewsEveryMonths != null && d.renewsEveryMonths != 0) "renews every ${d.renewsEveryMonths} months" else "expiry date",
            null, d.type in REGULATORY_DOCS, false, d.expiresOn, false, null, false,
            d.remindLeadDays ?: DOC_LEAD_DAYS, null, null, null,
        ))
    }

    val items = drafts.map { x ->
        val daysLeft = x.dueDate?.let { Dates.between(today, it) }
        val cur = x.hours?.let { meters[it.meter]!!.stitched }
        val remaining = if (x.hours != null && cur != null) round1(x.hours.dueAt - cur) else null
        val status = when {
            (daysLeft != null && daysLeft < 0) || (remaining != null && remaining <= 0) -> "overdue"
            (daysLeft != null && daysLeft <= x.soonDays) || (remaining != null && remaining <= DUE_SOON_HOURS) -> "due_soon"
            (daysLeft == null && remaining == null) || x.hoursNoMeter -> "no_record"
            else -> "current"
        }
        val projectedDate = if (remaining != null && remaining > 0 && rate.basis != "none")
            Dates.addDays(today, ceil(remaining / rate.hoursPerDay).toLong()) else null
        val hoursDate = if (remaining == null) null else if (remaining <= 0) today else projectedDate
        var first: String? = null
        var firstDate: String? = null
        if (x.dueDate != null && remaining != null) {
            first = if (hoursDate == null) (if (remaining <= DUE_SOON_HOURS) "hours" else "calendar")
                else if (x.dueDate <= hoursDate) "calendar" else "hours"
            firstDate = if (first == "calendar") x.dueDate else hoursDate
        } else if (x.dueDate != null) { first = "calendar"; firstDate = x.dueDate }
        else if (remaining != null) { first = "hours"; firstDate = hoursDate }
        if (status == "no_record") { first = if (x.dueDate != null) "calendar" else null; firstDate = x.dueDate }
        DueItem(
            x.key, x.source, x.kind, x.label, x.rule, x.line, x.regulatory, !x.regulatory, x.ifrOnly, status,
            if (x.dueDate != null) CalendarLimit(x.dueDate, daysLeft!!, x.monthRule) else null,
            if (x.hours != null && remaining != null) HoursLimit(x.hours.meter, x.hours.dueAt, remaining, projectedDate, rate.basis, x.hours.estimatedMeter) else null,
            first, firstDate, x.lastDone, x.waiting, x.providerId, visitOf[x.key],
        )
    }.sortedWith(compareBy<DueItem> { RANK[it.status] }.thenBy { it.firstDate ?: "9999" }.thenBy { it.key })

    // Situation (09 §3.6)
    val annualItem = annual?.let { an -> items.firstOrNull { it.key == "mx:${an.id}" } }
    val ready = annualLast?.date != null && (meters["tach"]!!.stitched != null || meters["hobbs"]!!.stitched != null)
    val shopVisit = input.plannedVisit.firstOrNull { it.status == "in_shop" }
    val buyerRoom = input.recordRoom
        .filter { it.audience == "buyer" && it.revokedAt == null && it.expiresAt.take(10) >= today }
        .sortedByDescending { it.expiresAt }.firstOrNull()
    val anyAlert = items.any { it.status == "overdue" || it.status == "due_soon" }
    val situation = when {
        !ready -> "setup"
        a.situationOverride == "in_shop" || shopVisit != null -> "in_shop"
        a.situationOverride == "preparing_sale" || buyerRoom != null -> "preparing_sale"
        annualItem?.calendar != null && annualItem.status != "overdue" && annualItem.calendar.daysLeft <= 60 -> "annual_month"
        anyAlert -> "attention"
        else -> "all_clear"
    }

    // Line ahead (09 §3.4)
    val to = when (situation) {
        "setup" -> today
        "in_shop", "annual_month" -> Dates.addDays(today, 60)
        else -> Dates.addMonths(today, 12)
    }
    val rings = mutableListOf<Ring>()
    val undated = mutableListOf<String>()
    if (situation != "setup") for (i in items) {
        if (i.source == "document" || i.line == null) continue
        if (i.firstDate == null || i.status == "no_record") { undated.add(i.key); continue }
        val date = if (i.status == "overdue") today else i.firstDate
        if (date <= to) rings.add(Ring(i.key, i.line, date, if (i.first == "hours") "projected" else "calendar", i.status))
    }

    val waitingEntries = entries.filter { it.trust == "ai_read" && it.replacedByEntryId == null }
    val openSquawks = input.squawk.filter { it.status != "resolved" }
    val verdict = composeVerdict(
        situation, items, today, a.tailNumber, meters, shopVisit, input.serviceProvider, input.plannedVisitItem,
        buyerRoom, annualItem, waitingEntries.size, openSquawks.filter { it.severity == "high" },
    )

    return StatusBody(
        a.id, ALGO_VERSION, today, situation, verdict, meters, rate, items, Visits(),
        LineAhead(today, to, rings, undated),
        Counts(
            items.count { it.status == "overdue" }, items.count { it.status == "due_soon" }, items.count { it.status == "no_record" },
            waitingEntries.mapNotNull { it.pageId }.toSet().size,
            input.page.count { it.extractionStatus in setOf("pending", "queued", "processing", "waiting_allowance") },
            openSquawks.size,
        ),
    )
}

// --- Verdict (12 §4) -----------------------------------------------------------------------

private fun mid(label: String): String =
    if (label.length > 1 && label[1].isLowerCase()) label[0].lowercaseChar() + label.substring(1) else label
private fun plural(n: Int, one: String, many: String) = "$n ${if (n == 1) one else many}"
private fun list(xs: List<String>): String =
    if (xs.size <= 1) xs.joinToString("") else "${xs.dropLast(1).joinToString(", ")} and ${xs.last()}"

private fun composeVerdict(
    situation: String, items: List<DueItem>, today: String, tail: String, meters: Map<String, MeterView>,
    shopVisit: PlannedVisitRow?, providers: List<ServiceProviderRow>, visitItems: List<PlannedVisitItemRow>,
    buyerRoom: RecordRoomRow?, annualItem: DueItem?, waiting: Int, groundSquawks: List<SquawkRow>,
): Verdict {
    var text = ""
    var bold = ""
    val dated = items.filter { it.status != "no_record" && it.firstDate != null }
    fun next(pool: List<DueItem>) = pool.firstOrNull { it.regulatory } ?: pool.firstOrNull()
    fun whenOf(i: DueItem) = if (i.first == "hours")
        (i.hours!!.projectedDate?.let { "about ${fmtAbout(it, today)}" } ?: "in about ${fmt1(i.hours.remaining)} hours")
        else fmtDate(i.calendar!!.dueDate)
    fun soonWhen(i: DueItem) = if (i.first == "hours") "in about ${fmt1(i.hours!!.remaining)} hours"
        else if (i.calendar!!.daysLeft == 0) "today" else "in ${plural(i.calendar.daysLeft, "day", "days")}"
    fun nextSentence(i: DueItem, soon: Boolean) =
        if (soon) "Next: ${mid(i.label)} ${soonWhen(i)}." else "Next: ${mid(i.label)}, ${whenOf(i)}."

    fun fallback() {
        val overdue = items.filter { it.status == "overdue" }
        val soon = items.filter { it.status == "due_soon" }
        if (overdue.size == 1) {
            val i = overdue[0]
            val ago = if (i.calendar != null && i.calendar.daysLeft < 0) "${plural(-i.calendar.daysLeft, "day", "days")} ago"
                else "${fmt1(-i.hours!!.remaining)} hours ago"
            if (i.ifrOnly) { bold = "1 item has lapsed"; text = "$bold: ${i.label}, $ago (IFR only)." }
            else { bold = "1 item is overdue"; text = "$bold: ${i.label} lapsed $ago." }
        } else if (overdue.size > 1) {
            bold = "${overdue.size} items are overdue"; text = "$bold."
        } else if (soon.isNotEmpty()) {
            bold = "Nothing tracked is overdue"; text = "$bold. ${nextSentence(next(soon)!!, true)}"
        } else {
            val i = next(dated)
            if (i != null && i.firstDate!! <= Dates.addDays(today, DUE_SOON_DAYS.toLong())) {
                bold = "Nothing tracked is overdue"; text = "$bold. ${nextSentence(i, false)}"
            } else {
                bold = "Nothing tracked is due in the next 90 days"
                text = if (i != null) "$bold. ${nextSentence(i, false)}" else "$bold."
            }
        }
    }

    if (situation == "setup") {
        text = "Nothing to show yet. Scan or add your logbooks to see what's due."
    } else if (situation == "in_shop" && shopVisit != null) {
        val where = providers.firstOrNull { it.id == shopVisit.providerId }?.name ?: shopVisit.airport
        val labels = visitItems.filter { it.visitId == shopVisit.id }
            .mapNotNull { x -> items.firstOrNull { it.key == x.itemKey } }.map { mid(it.label) }
        if (where != null && labels.isNotEmpty()) {
            bold = "$tail is at $where"
            text = "$bold for ${list(labels)}, since ${fmtDate(shopVisit.visitDate ?: shopVisit.weekOf)}."
        } else fallback()
    } else if (situation == "preparing_sale" && buyerRoom != null) {
        val until = buyerRoom.expiresAt.take(10)
        val n = dated.count { it.firstDate!! <= until }
        bold = "A buyer's record room is open until ${fmtDate(until)}"
        text = "$bold. ${if (n == 1) "1 item is" else "$n items are"} due before then."
    } else if (situation == "annual_month" && annualItem?.calendar != null) {
        val due = annualItem.calendar.dueDate
        val n = dated.count { it.key != annualItem.key && it.source != "document" && it.firstDate!! <= due }
        bold = "The annual is due by ${fmtDate(due)}"
        text = if (n > 0) "$bold. ${if (n == 1) "1 item can" else "$n items can"} ride along." else "$bold."
    } else fallback()

    val lines = mutableListOf<String>()
    if (waiting == 1) lines.add("1 entry read by AI is waiting for you. It doesn't count until you confirm it.")
    else if (waiting > 1) lines.add("$waiting entries read by AI are waiting for you. They don't count until you confirm them.")
    if (situation != "setup") {
        val used = items.mapNotNull { it.hours?.meter }.toSet()
        val stale = METERS.firstOrNull { m -> m in used && meters[m]!!.asOf?.let { Dates.between(it, today) > STALE_METER_DAYS } == true }
        if (stale != null) lines.add("Hours are from your last $stale reading on ${fmtShort(meters[stale]!!.asOf!!, today)}. Log a flight to update.")
    }
    for (s in groundSquawks) lines.add("A squawk is marked Ground: ${s.description.trimEnd('.')}.")

    val at = if (bold.isNotEmpty()) text.indexOf(bold) else -1
    return Verdict(text, if (at >= 0) listOf(listOf(at, at + bold.length)) else emptyList(), lines)
}

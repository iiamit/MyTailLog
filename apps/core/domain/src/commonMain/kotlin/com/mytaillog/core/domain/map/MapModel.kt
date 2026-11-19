package com.mytaillog.core.domain.map

import com.mytaillog.core.domain.due.Dates
import com.mytaillog.core.domain.due.DueInput
import com.mytaillog.core.domain.due.ItemCompletionRow
import com.mytaillog.core.domain.due.MaintenanceItemRow
import com.mytaillog.core.domain.due.PlannedVisitItemRow
import com.mytaillog.core.domain.due.PlannedVisitRow
import com.mytaillog.core.domain.due.computeStatus
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlin.math.abs
import kotlin.math.floor

// Kotlin port of apps/web/src/lib/mapModel.ts (09 §3.7, §4.6; 10 §2). Same rules, same output;
// packages/shared/fixtures/map-grouping.json and map-model.json pin both. Change one, change both.
// Phones build the map from their mirror with this (09 §3.12 item 7); rings come from the due
// engine, so unconfirmed entries never place a ring, a visit or an era (09 §3.1).

// --- Input: database rows (snake_case) ----------------------------------------------------

@Serializable data class MapLogbookRow(
    val id: String,
    val type: String,
    @SerialName("component_ref") val componentRef: String? = null,
    val title: String? = null,
)

@Serializable data class MapEntryRow(
    val id: String,
    @SerialName("logbook_id") val logbookId: String,
    @SerialName("page_id") val pageId: String? = null,
    @SerialName("entry_date") val entryDate: String? = null,
    val tach: Double? = null,
    val trust: String,
    @SerialName("replaced_by_entry_id") val replacedByEntryId: String? = null,
    @SerialName("is_continuation") val isContinuation: Boolean = false,
    @SerialName("mechanic_cert_number") val mechanicCertNumber: String? = null,
    @SerialName("entry_kind") val entryKind: String? = null,
    val description: String? = null,
)

@Serializable data class MapPageRow(
    val id: String,
    @SerialName("logbook_id") val logbookId: String,
    @SerialName("extraction_status") val extractionStatus: String? = null,
    @SerialName("landing_date") val landingDate: String? = null,
)

@Serializable data class MapGapRow(
    val id: String,
    @SerialName("logbook_id") val logbookId: String,
    @SerialName("from_date") val fromDate: String,
    @SerialName("to_date") val toDate: String,
    val status: String,
)

@Serializable data class MapSquawkRow(
    val id: String,
    val status: String,
    @SerialName("reported_at") val reportedAt: String? = null,
    @SerialName("resolved_at") val resolvedAt: String? = null,
    @SerialName("resolved_log_entry_id") val resolvedLogEntryId: String? = null,
)

/** The map's own rows. The due engine reads the same JSON as a [DueInput]. */
@Serializable data class MapInput(
    val logbook: List<MapLogbookRow> = emptyList(),
    @SerialName("log_entry") val logEntry: List<MapEntryRow> = emptyList(),
    val page: List<MapPageRow> = emptyList(),
    val squawk: List<MapSquawkRow> = emptyList(),
    @SerialName("logbook_gap") val logbookGap: List<MapGapRow> = emptyList(),
    @SerialName("maintenance_item") val maintenanceItem: List<MaintenanceItemRow> = emptyList(),
    @SerialName("item_completion") val itemCompletion: List<ItemCompletionRow> = emptyList(),
    @SerialName("planned_visit") val plannedVisit: List<PlannedVisitRow> = emptyList(),
    @SerialName("planned_visit_item") val plannedVisitItem: List<PlannedVisitItemRow> = emptyList(),
)

@Serializable data class MapOptions(val from: String? = null, val to: String? = null, val only: List<String>? = null)

// --- Output: API shapes (camelCase) ---------------------------------------------------------

@Serializable data class MapRange(val from: String, val to: String, val scaleBreak: String?)
@Serializable data class MapVolume(val id: String, val label: String, val from: String?, val to: String?)
@Serializable data class MapLine(val lineId: String, val logbook: String, val logbookId: String, val name: String, val volumes: List<MapVolume>)
@Serializable data class MapStop(
    val id: String, val lineId: String, val logbook: String, val date: String, val entryIds: List<String>, val trust: String,
    val pageIds: List<String>, val label: String?, val major: Boolean,
)
@Serializable data class MapInterchange(val id: String, val date: String, val stopIds: List<String>, val lineIds: List<String>, val trust: String, val label: String?)
@Serializable data class MapGap(val id: String, val lineId: String, val logbook: String, val from: String, val to: String, val status: String, val unconfirmedPages: Int)
@Serializable data class MapEra(val lineId: String, val logbook: String, val from: String, val to: String?, val label: String, val anchorEntryId: String?)
@Serializable data class MapSquawk(val id: String, val date: String, val open: Boolean, val line: String, val lineId: String)
@Serializable data class MapRing(
    val itemKey: String, val line: String, val lineId: String, val date: String, val dateKind: String, val status: String,
    val label: String, val kind: String,
)
@Serializable data class MapVisit(val id: String?, val suggestionKey: String?, val state: String, val weekOf: String, val itemKeys: List<String>, val label: String)
@Serializable data class MapModel(
    val today: String,
    val range: MapRange,
    val lines: List<MapLine>,
    val stops: List<MapStop>,
    val interchanges: List<MapInterchange>,
    val gaps: List<MapGap>,
    val eras: List<MapEra>,
    val squawks: List<MapSquawk>,
    val rings: List<MapRing>,
    val visits: List<MapVisit>,
    val undatedEntries: Int,
)

// --- Helpers ----------------------------------------------------------------------------------

val LANES = listOf("airframe", "engine", "prop", "avionics")
val BOOK_NAME = mapOf("airframe" to "Airframe", "engine" to "Engine", "prop" to "Propeller", "avionics" to "Avionics")
private val TRUST_RANK = mapOf("ai_read" to 0, "confirmed" to 1, "signed" to 2)
private fun lowest(ts: List<String>): String = ts.fold("signed") { low, t -> if (TRUST_RANK.getValue(t) < TRUST_RANK.getValue(low)) t else low }
private val BEING_READ = setOf("queued", "processing", "waiting_allowance")
private val DRAWN_GAPS = setOf("open", "asked_previous_owner", "no_pages_exist")

fun stopId(logbookId: String, date: String): String = Sha1.hex("$logbookId|$date").take(16)
fun interchangeId(stopIds: List<String>): String = Sha1.hex(stopIds.sorted().joinToString("|")).take(16)

private fun counts(trust: String, replacedBy: String?) = trust != "ai_read" && replacedBy == null
fun normCert(c: String?): String = (c ?: "").uppercase().filter { it in 'A'..'Z' || it in '0'..'9' }

private val KIND_LABEL = mapOf(
    "engine_overhaul" to "Engine overhaul", "prop_overhaul" to "Propeller overhaul", "overhaul" to "Overhaul",
    "major_repair" to "Major repair", "major_alteration" to "Major alteration", "form_337" to "Major alteration",
    "install" to "Installation", "installation" to "Installation", "engine_replacement" to "Engine replaced",
    "prop_replacement" to "Propeller replaced",
)
private val MAJOR_TEXT = Regex("\\b(overhaul(ed)?|form 337|major (repair|alteration))\\b", RegexOption.IGNORE_CASE)
private val ANNUAL_TEXT = Regex("\\bannual\\b", RegexOption.IGNORE_CASE)
fun majorLabel(e: MapEntryRow): String? =
    e.entryKind?.let { KIND_LABEL[it] } ?: if (MAJOR_TEXT.containsMatchIn(e.description ?: "")) "Major work" else null
fun isAnnual(e: MapEntryRow): Boolean = e.entryKind == "annual" || ANNUAL_TEXT.containsMatchIn(e.description ?: "")

/** "1,234", as the TypeScript (no locale data). */
fun thousands(n: Double): String {
    val v = floor(n + 0.5).toLong()
    val s = abs(v).toString().reversed().chunked(3).joinToString(",").reversed()
    return if (v < 0) "-$s" else s
}

internal class Line(val lineId: String, val logbook: String, val name: String, val books: Set<String>, val volumes: MutableList<MapVolume>)

internal fun linesOf(logbooks: List<MapLogbookRow>, only: List<String>?): List<Line> {
    val out = mutableListOf<Line>()
    for (type in LANES) {
        if (only != null && type !in only) continue
        val books = logbooks.filter { it.type == type }
        val refs = books.map { it.componentRef ?: "" }.distinct().sorted()
        for (ref in refs) {
            val vols = books.filter { (it.componentRef ?: "") == ref }.sortedBy { it.id }
            val name = if (refs.size > 1) "${BOOK_NAME[type]} ${refs.indexOf(ref) + 1}" else BOOK_NAME.getValue(type)
            out.add(Line(vols[0].id, type, name, vols.map { it.id }.toSet(), vols.mapIndexed { i, v ->
                MapVolume(v.id, v.title ?: if (vols.size > 1) "Vol. ${i + 1}" else name, null, null)
            }.toMutableList()))
        }
    }
    return out
}

private class Stop(val s: MapStop, val entries: List<MapEntryRow>)

// --- Derivation -------------------------------------------------------------------------------

fun buildMapModel(input: MapInput, due: DueInput, today: String, opts: MapOptions = MapOptions()): MapModel {
    val lines = linesOf(input.logbook, opts.only)
    val lineOfBook = lines.flatMap { l -> l.books.map { it to l } }.toMap()
    fun firstLine(type: String) = lines.firstOrNull { it.logbook == type } ?: lines.firstOrNull { it.logbook == "airframe" } ?: lines.firstOrNull()
    val pages = input.page.associateBy { it.id }

    val drawable = input.logEntry.filter { e ->
        val page = e.pageId?.let { pages[it] }
        e.logbookId in lineOfBook && e.replacedByEntryId == null && !e.isContinuation && (page?.extractionStatus ?: "") !in BEING_READ
    }
    fun dateOf(e: MapEntryRow): String? = e.entryDate ?: e.pageId?.let { pages[it]?.landingDate }
    val undatedEntries = drawable.count { dateOf(it) == null }

    for (l in lines) for ((i, v) in l.volumes.withIndex()) {
        val ds = drawable.filter { it.logbookId == v.id }.mapNotNull { dateOf(it) }.sorted()
        l.volumes[i] = v.copy(from = ds.firstOrNull(), to = ds.lastOrNull())
    }

    // Stops: one per (line, date).
    val groups = LinkedHashMap<String, MutableList<MapEntryRow>>()
    for (e in drawable) {
        val d = dateOf(e) ?: continue
        groups.getOrPut("${lineOfBook.getValue(e.logbookId).lineId}|$d") { mutableListOf() }.add(e)
    }
    val firstDate = HashMap<String, String>()
    for (key in groups.keys) {
        val (lineId, d) = key.split("|")
        if (firstDate[lineId]?.let { d < it } != false) firstDate[lineId] = d
    }
    val laneIndex = lines.withIndex().associate { (i, l) -> l.lineId to i }
    val allStops = groups.map { (key, es) ->
        val (lineId, date) = key.split("|")
        val line = lines[laneIndex.getValue(lineId)]
        val major = es.firstNotNullOfOrNull { majorLabel(it) }
        val first = firstDate[lineId] == date
        Stop(MapStop(
            stopId(lineId, date), lineId, line.logbook, date, es.map { it.id }.sorted(), lowest(es.map { it.trust }),
            es.mapNotNull { it.pageId }.distinct().sorted(), major ?: if (first) "First entry" else null, major != null || first,
        ), es)
    }.sortedWith(compareBy<Stop>({ laneIndex.getValue(it.s.lineId) }, { it.s.date }))

    fun drawnGap(g: MapGapRow) = g.logbookId in lineOfBook && g.status in DRAWN_GAPS
    val from = opts.from ?: (allStops.map { it.s.date } + input.logbookGap.filter { drawnGap(it) }.map { it.fromDate } + today).minOrNull()!!
    val to = opts.to ?: Dates.addMonths(today, 12)
    fun inRange(d: String) = d >= from && d <= to
    fun overlaps(a: String, b: String) = a <= to && b >= from

    // Interchanges.
    val byDate = LinkedHashMap<String, MutableList<Stop>>()
    for (s in allStops) byDate.getOrPut(s.s.date) { mutableListOf() }.add(s)
    val interchanges = mutableListOf<MapInterchange>()
    for ((date, ss) in byDate) {
        if (ss.size < 2) continue
        val parent = IntArray(ss.size) { it }
        fun find(i: Int): Int { if (parent[i] != i) parent[i] = find(parent[i]); return parent[i] }
        for (i in ss.indices) for (j in i + 1 until ss.size)
            if (ss[i].entries.any { a -> ss[j].entries.any { b -> sameVisit(a, b) } }) parent[find(j)] = find(i)
        val comps = LinkedHashMap<Int, MutableList<Stop>>()
        ss.forEachIndexed { i, s -> comps.getOrPut(find(i)) { mutableListOf() }.add(s) }
        for (c in comps.values) {
            if (c.size < 2) continue
            val annual = c.any { s -> s.entries.any { isAnnual(it) } }
            interchanges.add(MapInterchange(interchangeId(c.map { it.s.id }), date, c.map { it.s.id }, c.map { it.s.lineId },
                lowest(c.map { it.s.trust }), if (annual) "Annual" else null))
        }
    }
    interchanges.sortWith(compareBy({ it.date }, { it.id }))

    // Gaps.
    val gaps = mutableListOf<MapGap>()
    for (g in input.logbookGap) {
        val line = lineOfBook[g.logbookId] ?: continue
        if (!drawnGap(g) || !overlaps(g.fromDate, g.toDate)) continue
        val pagesIn = drawable.filter {
            it.logbookId in line.books && it.trust == "ai_read" && it.pageId != null &&
                (dateOf(it) ?: "") > g.fromDate && (dateOf(it) ?: "") < g.toDate
        }.map { it.pageId }.toSet()
        gaps.add(MapGap(g.id, line.lineId, line.logbook, g.fromDate, g.toDate, g.status, pagesIn.size))
    }
    gaps.sortWith(compareBy({ laneIndex.getValue(it.lineId) }, { it.from }))

    val status = computeStatus(due, today)

    // Eras.
    val entryById = input.logEntry.associateBy { it.id }
    val eras = mutableListOf<MapEra>()
    for ((type, kind) in listOf("engine" to "engine_tbo", "prop" to "prop_overhaul")) {
        val itemIds = input.maintenanceItem.filter { it.kind == kind }.map { it.id }.toSet()
        data class Anchor(val date: String, val tach: Double?, val entryId: String?, val lineId: String?)
        val anchors = mutableListOf<Anchor>()
        for (c in input.itemCompletion) {
            if (c.maintenanceItemId == null || c.maintenanceItemId !in itemIds) continue
            val e = c.logEntryId?.let { entryById[it] }
            val counted = c.logEntryId == null || (e != null && counts(e.trust, e.replacedByEntryId))
            if (!counted) continue
            anchors.add(Anchor(c.doneDate, c.doneHours ?: e?.tach, c.logEntryId, e?.let { lineOfBook[it.logbookId]?.lineId }))
        }
        for (e in input.logEntry)
            if (e.entryKind == "${type}_overhaul" && counts(e.trust, e.replacedByEntryId) && e.entryDate != null && anchors.none { it.date == e.entryDate })
                anchors.add(Anchor(e.entryDate, e.tach, e.id, lineOfBook[e.logbookId]?.lineId))
        anchors.sortBy { it.date }
        val deduped = anchors.filterIndexed { i, a -> i == 0 || a.date != anchors[i - 1].date }
        deduped.forEachIndexed { i, a ->
            val line = (a.lineId?.let { id -> lines.firstOrNull { it.lineId == id && it.logbook == type } }) ?: lines.firstOrNull { it.logbook == type }
                ?: return@forEachIndexed
            val next = deduped.getOrNull(i + 1)
            val endTach = if (next != null) next.tach else status.meters["tach"]?.stitched
            val hours = if (a.tach != null && endTach != null) endTach - a.tach else null
            val y0 = a.date.take(4)
            val label = if (next != null) {
                if (hours != null) "${thousands(hours)} h, $y0 to ${next.date.take(4)}" else "$y0 to ${next.date.take(4)}"
            } else if (hours != null) "${thousands(hours)} h since overhaul" else "Since overhaul, $y0"
            if (overlaps(a.date, next?.date ?: today)) eras.add(MapEra(line.lineId, type, a.date, next?.date, label, a.entryId))
        }
    }

    // Squawks.
    val squawks = mutableListOf<MapSquawk>()
    for (s in input.squawk) {
        val open = s.status != "resolved"
        val date = (if (open) s.reportedAt else s.resolvedAt)?.take(10) ?: continue
        val clearing = s.resolvedLogEntryId?.let { entryById[it] }
        val line = clearing?.let { lineOfBook[it.logbookId] } ?: lines.firstOrNull { it.logbook == "airframe" } ?: lines.firstOrNull() ?: continue
        if (!inRange(date)) continue
        squawks.add(MapSquawk(s.id, date, open, line.logbook, line.lineId))
    }
    squawks.sortWith(compareBy({ it.date }, { it.id }))

    // Rings.
    val rings = mutableListOf<MapRing>()
    if (status.situation != "setup") for (i in status.items) {
        val itemLine = i.line
        if (i.source == "document" || itemLine == null || i.firstDate == null || i.status == "no_record") continue
        val date = if (i.status == "overdue") today else i.firstDate
        val line = firstLine(itemLine) ?: continue
        if (!inRange(date)) continue
        rings.add(MapRing(i.key, itemLine, line.lineId, date, if (i.first == "hours") "projected" else "calendar", i.status, i.label, i.kind))
    }
    rings.sortWith(compareBy({ it.date }, { it.itemKey }))

    // Visits.
    val visits = input.plannedVisit.filter { (it.status == "planned" || it.status == "in_shop") && inRange(it.weekOf) }.map { v ->
        MapVisit(v.id, null, v.status, v.weekOf, input.plannedVisitItem.filter { it.visitId == v.id }.map { it.itemKey }.sorted(),
            if (v.status == "in_shop") "In the shop" else "Planned")
    }.sortedWith(compareBy({ it.weekOf }, { it.id ?: "" }))

    val scaleBreak = if (from <= Dates.addMonths(today, -60)) Dates.addMonths(today, -12) else null
    return MapModel(
        today, MapRange(from, to, scaleBreak),
        lines.map { MapLine(it.lineId, it.logbook, it.lineId, it.name, it.volumes.toList()) },
        allStops.map { it.s }.filter { inRange(it.date) },
        interchanges.filter { inRange(it.date) },
        gaps, eras, squawks, rings, visits, undatedEntries,
    )
}

private fun sameVisit(a: MapEntryRow, b: MapEntryRow): Boolean {
    val ca = normCert(a.mechanicCertNumber)
    if (ca.isNotEmpty() && ca == normCert(b.mechanicCertNumber)) return true
    return a.tach != null && b.tach != null && abs(a.tach - b.tach) <= 0.5 + 1e-9
}

/** SHA-1 (FIPS 180-4) of a UTF-8 string, lowercase hex: stop and interchange ids (09 §4.6). */
internal object Sha1 {
    fun hex(s: String): String {
        val msg = s.encodeToByteArray()
        val ml = msg.size.toLong() * 8
        val padded = ByteArray(((msg.size + 9 + 63) / 64) * 64)
        msg.copyInto(padded)
        padded[msg.size] = 0x80.toByte()
        for (i in 0 until 8) padded[padded.size - 1 - i] = (ml ushr (8 * i)).toByte()
        var h0 = 0x67452301; var h1 = 0xEFCDAB89.toInt(); var h2 = 0x98BADCFE.toInt(); var h3 = 0x10325476; var h4 = 0xC3D2E1F0.toInt()
        val w = IntArray(80)
        for (chunk in padded.indices step 64) {
            for (i in 0 until 16) w[i] = ((padded[chunk + 4 * i].toInt() and 0xff) shl 24) or ((padded[chunk + 4 * i + 1].toInt() and 0xff) shl 16) or
                ((padded[chunk + 4 * i + 2].toInt() and 0xff) shl 8) or (padded[chunk + 4 * i + 3].toInt() and 0xff)
            for (i in 16 until 80) w[i] = (w[i - 3] xor w[i - 8] xor w[i - 14] xor w[i - 16]).rotateLeft(1)
            var a = h0; var b = h1; var c = h2; var d = h3; var e = h4
            for (i in 0 until 80) {
                val (f, k) = when {
                    i < 20 -> ((b and c) or (b.inv() and d)) to 0x5A827999
                    i < 40 -> (b xor c xor d) to 0x6ED9EBA1
                    i < 60 -> ((b and c) or (b and d) or (c and d)) to 0x8F1BBCDC.toInt()
                    else -> (b xor c xor d) to 0xCA62C1D6.toInt()
                }
                val t = a.rotateLeft(5) + f + e + k + w[i]
                e = d; d = c; c = b.rotateLeft(30); b = a; a = t
            }
            h0 += a; h1 += b; h2 += c; h3 += d; h4 += e
        }
        return intArrayOf(h0, h1, h2, h3, h4).joinToString("") { it.toUInt().toString(16).padStart(8, '0') }
    }
}

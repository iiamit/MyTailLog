package com.mytaillog.core.domain.map

import com.mytaillog.core.domain.due.Dates
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

// Kotlin port of apps/web/src/ui/map/map-layout.ts (10 §4–§8, §11). Same geometry, same greedy
// labels; packages/shared/fixtures/map-layout*.json pin both within 0.5 viewBox units.
// Change one, change both.

@Serializable data class DateRange(val from: String, val to: String)
@Serializable data class LayoutOptions(
    val size: String,
    val renderedWidth: Double? = null,
    val zoom: DateRange? = null,
    val planAhead: Boolean = false,
    val window: DateRange? = null,
    val allEras: Boolean = false,
)

@Serializable data class LRect(val x: Double, val y: Double, val w: Double, val h: Double)
@Serializable data class LSeg(val x1: Double, val y1: Double, val x2: Double, val y2: Double)
@Serializable data class LPoint(val x: Double, val y: Double)
@Serializable data class LLane(val lineId: String, val logbook: String, val name: String, val c: Double, val nameX: Double, val nameY: Double, val anchor: String)
@Serializable data class LSegment(val lineId: String, val kind: String, val gapId: String?, val x1: Double, val y1: Double, val x2: Double, val y2: Double)
@Serializable data class LStop(val id: String, val lineId: String, val x: Double, val y: Double, val r: Double, val dotted: Boolean, val major: Boolean, val count: Int, val ids: List<String>)
@Serializable data class LCapsule(val id: String, val x: Double, val y: Double, val w: Double, val h: Double, val dotted: Boolean, val dots: List<LPoint>)
@Serializable data class LRing(val itemKey: String, val lineId: String, val x: Double, val y: Double, val r: Double, val status: String)
@Serializable data class LVisit(val id: String, val state: String, val x: Double, val y: Double, val w: Double, val h: Double)
@Serializable data class LEra(val lineId: String, val x: Double, val y: Double, val w: Double, val h: Double)
@Serializable data class LSquawk(val id: String, val x: Double, val y: Double, val open: Boolean)
@Serializable data class LTick(val x: Double, val y: Double, val label: String, val anchor: String)
@Serializable data class LLabel(@SerialName("for") val forKey: String, val text: String, val x: Double, val y: Double, val anchor: String)
@Serializable data class Layout(
    val size: String, val width: Double, val height: Double, val fontSize: Double,
    val lanes: List<LLane>, val segments: List<LSegment>, val stops: List<LStop>, val interchanges: List<LCapsule>,
    val rings: List<LRing>, val visits: List<LVisit>, val eras: List<LEra>, val squawks: List<LSquawk>,
    val today: LSeg?, val scaleBreak: LSeg?, val window: LRect?, val ticks: List<LTick>, val labels: List<LLabel>, val more: Int,
)

private class Geo(
    val width: Double, val vertical: Boolean, val nameW: Double, val laneGap: Double, val laneStart: Double,
    val t0: Double, val t1: Double, val brk: Pair<Double, Double>?, val stub: Pair<Double, Double>?,
    val ringR: Double, val capW: Double, val labelled: Boolean,
)
private val GEO = mapOf(
    "routemap" to Geo(820.0, false, 90.0, 80.0, 48.0, 100.0, 800.0, 600.0 to 620.0, null, 7.0, 20.0, true),
    "spine" to Geo(1000.0, false, 0.0, 8.0, 0.0, 0.0, 1000.0, 790.0 to 800.0, null, 3.5, 8.0, false),
    "lineahead" to Geo(680.0, false, 84.0, 45.0, 40.0, 110.0, 672.0, null, 88.0 to 110.0, 7.0, 20.0, true),
    "lineahead-phone" to Geo(354.0, false, 44.0, 36.0, 30.0, 60.0, 346.0, null, 48.0 to 60.0, 7.0, 20.0, true),
    "phone" to Geo(358.0, true, 0.0, 40.0, 58.0, 32.0, 0.0, null, null, 7.0, 20.0, true),
)
private const val P_TOP = 32.0
private const val P_FUTURE = 70.0
private const val P_RECENT = 110.0
private const val P_BRK = 14.0
private const val P_PER_YEAR = 8.0
private const val P_LABEL_X = 208.0
private const val P_BOTTOM = 24.0

private val MONTHS = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
private fun dayOf(d: String): Double = Dates.between("1970-01-01", d).toDouble()
private fun isoOf(n: Double): String = Dates.addDays("1970-01-01", floor(n).toLong())
private fun monYear(d: String) = "${MONTHS[d.substring(5, 7).toInt() - 1]} ${d.take(4)}"
private fun monDay(d: String) = "${MONTHS[d.substring(5, 7).toInt() - 1]} ${d.substring(8, 10).toInt()}"
private fun r1(x: Double) = floor(x * 10 + 0.5) / 10

private class Piece(val d0: Double, val d1: Double, val p0: Double, val p1: Double) {
    fun at(d: Double) = if (d1 == d0) p0 else p0 + (d - d0) / (d1 - d0) * (p1 - p0)
}

private fun scaleFor(m: MapModel, geo: Geo, size: String, o: LayoutOptions): List<Piece> {
    val today = dayOf(m.today)
    val to = dayOf(m.range.to)
    var from = dayOf(m.range.from)
    if (from >= to) from = to - 365
    val b = m.range.scaleBreak?.let { dayOf(it) }
    if (size == "lineahead" || size == "lineahead-phone") {
        val (s0, s1) = geo.stub!!
        val stub = Piece(today - 7, today, s0, s1)
        if (o.planAhead && size == "lineahead") {
            val six = dayOf(Dates.addMonths(m.today, 6))
            if (six < to) {
                val w1 = 2 * (six - today); val w2 = to - six
                val mid = s1 + (geo.t1 - s1) * w1 / (w1 + w2)
                return listOf(stub, Piece(today, six, s1, mid), Piece(six, to, mid, geo.t1))
            }
        }
        return listOf(stub, Piece(today, max(to, today + 1), s1, geo.t1))
    }
    if (size == "phone") {
        val now = P_TOP + P_FUTURE; val recentEnd = now + P_RECENT
        val fut = Piece(today, max(to, today + 1), now, P_TOP)
        if (b == null || from >= b) return listOf(fut, Piece(min(from, today - 1), today, recentEnd, now))
        val h0 = recentEnd + P_BRK
        return listOf(fut, Piece(b, today, recentEnd, now), Piece(from, b, h0 + (b - from) / 365.25 * P_PER_YEAR, h0))
    }
    val zoom = o.zoom
    if (size == "routemap" && zoom != null) {
        val zf = dayOf(zoom.from); val zt = max(dayOf(zoom.to), zf + 1)
        return listOf(Piece(zf, zt, geo.t0, geo.t1 - 40), Piece(zt, max(today, zt + 1), geo.t1 - 40, geo.t1))
    }
    if (b != null && from < b && geo.brk != null) return listOf(Piece(from, b, geo.t0, geo.brk.first), Piece(b, to, geo.brk.second, geo.t1))
    return listOf(Piece(from, to, geo.t0, geo.t1))
}
private fun lo(ps: List<Piece>) = ps.minOf { it.d0 }
private fun hi(ps: List<Piece>) = ps.maxOf { it.d1 }
private fun posOf(ps: List<Piece>, d: Double): Double? {
    if (d < lo(ps) - 1e-9 || d > hi(ps) + 1e-9) return null
    var hit: Piece? = null
    for (p in ps) if (d >= p.d0 - 1e-9 && d <= p.d1 + 1e-9 && (hit == null || p.d0 >= hit.d0)) hit = p
    return hit?.at(d)
}
private fun spanOf(ps: List<Piece>, a: Double, b: Double): List<Pair<Double, Double>> = ps.mapNotNull { p ->
    val s = max(a, p.d0); val e = min(b, p.d1)
    if (e - s <= 1e-9) null else p.at(s) to p.at(e)
}

private val INITIALS = mapOf("airframe" to "Air", "engine" to "Eng", "prop" to "Prop", "avionics" to "Avi")
private fun clip(s: String): String {
    if (s.length <= 32) return s
    val cut = s.take(31).lastIndexOf(' ')
    return "${s.take(if (cut > 0) cut else 31)}…"
}

private class Box(val x: Double, val y: Double, val w: Double, val h: Double) {
    fun hits(o: Box) = x < o.x + o.w && x + w > o.x && y < o.y + o.h && y + h > o.y
}
private class Want(val key: String, val text: String, val prio: Int, val t: Double, val cTop: Double, val cBot: Double, val centred: Boolean)
private class Cand(val x: Double, val y: Double, val anchor: String, val box: Box)

fun layoutMap(m: MapModel, o: LayoutOptions): Layout {
    val size = o.size
    val geo = GEO.getValue(size)
    val k = (o.renderedWidth ?: geo.width) / geo.width
    val fs = 13 / k
    val tfs = 12 / k
    val ps = scaleFor(m, geo, size, o)
    val vert = geo.vertical
    val n = m.lines.size
    fun pos(d: String) = posOf(ps, dayOf(d))
    val today = dayOf(m.today)
    val isLineAhead = size == "lineahead" || size == "lineahead-phone"

    fun laneC(i: Int): Double = if (size == "spine") 20 + (i - (n - 1) / 2.0) * geo.laneGap else geo.laneStart + i * geo.laneGap
    val height = when (size) {
        "routemap" -> n * 80.0 + 72
        "spine" -> 40.0
        "lineahead" -> 226.0
        "lineahead-phone" -> 168.0
        else -> ps.maxOf { max(it.p0, it.p1) } + P_BOTTOM
    }
    val tickY = when (size) { "routemap" -> height - 10; "lineahead" -> 222.0; "lineahead-phone" -> 164.0; else -> 0.0 }
    fun pt(t: Double, c: Double) = if (vert) LPoint(r1(c), r1(t)) else LPoint(r1(t), r1(c))
    fun seg(t1: Double, c1: Double, t2: Double, c2: Double): LSeg { val a = pt(t1, c1); val b = pt(t2, c2); return LSeg(a.x, a.y, b.x, b.y) }
    fun rect(t1: Double, t2: Double, c1: Double, c2: Double): LRect {
        val ta = min(t1, t2); val tb = max(t1, t2); val ca = min(c1, c2); val cb = max(c1, c2)
        return if (vert) LRect(r1(ca), r1(ta), r1(cb - ca), r1(tb - ta)) else LRect(r1(ta), r1(ca), r1(tb - ta), r1(cb - ca))
    }
    val laneOf = m.lines.withIndex().associate { (i, l) -> l.lineId to i }

    val lanes = m.lines.mapIndexed { i, l ->
        val c = laneC(i)
        val suffix = Regex(" (\\d+)$").find(l.name)?.groupValues?.get(1)
        if (vert) LLane(l.lineId, l.logbook, "${INITIALS[l.logbook]}${if (suffix != null) " $suffix" else ""}", r1(c), r1(c), 16.0, "middle")
        else LLane(l.lineId, l.logbook, l.name, r1(c), 0.0, r1(c + 4), "start")
    }

    // Line segments.
    val drawnGaps = if (isLineAhead) emptyList() else m.gaps
    val segments = mutableListOf<LSegment>()
    m.lines.forEachIndexed { i, l ->
        val c = laneC(i)
        val gaps = drawnGaps.filter { it.lineId == l.lineId }.sortedBy { it.from }
        val starts = m.stops.filter { it.lineId == l.lineId }.map { dayOf(it.date) } + gaps.map { dayOf(it.from) } +
            l.volumes.mapNotNull { v -> v.from?.let { dayOf(it) } }
        val start = if (isLineAhead) lo(ps) else max(lo(ps), starts.minOrNull() ?: today)
        var cursor = start
        fun push(a: Double, b: Double, kind: String, gapId: String?) {
            for ((p, q) in spanOf(ps, a, b)) { val s = seg(p, c, q, c); segments.add(LSegment(l.lineId, kind, gapId, s.x1, s.y1, s.x2, s.y2)) }
        }
        for (g in gaps) {
            val a = max(dayOf(g.from), start); val b = min(dayOf(g.to), today)
            if (b <= a) continue
            if (a > cursor) push(cursor, a, "solid", null)
            push(a, b, if (g.status == "no_pages_exist") "no_pages" else "gap", g.id)
            cursor = max(cursor, b)
        }
        if (today > cursor) push(cursor, today, "solid", null)
        push(max(today, start), hi(ps), "future", null)
    }

    // Interchanges.
    val inCapsule = HashSet<String>()
    val interchanges = mutableListOf<LCapsule>()
    if (!isLineAhead) for (x in m.interchanges) {
        val t = pos(x.date) ?: continue
        val idx = x.lineIds.mapNotNull { laneOf[it] }
        if (idx.size < 2) continue
        inCapsule.addAll(x.stopIds)
        val c1 = laneC(idx.min()); val c2 = laneC(idx.max())
        val r = if (size == "spine") rect(t - geo.capW / 2, t + geo.capW / 2, (c1 + c2) / 2 - 12, (c1 + c2) / 2 + 12)
        else rect(t - geo.capW / 2, t + geo.capW / 2, c1 - 12, c2 + 12)
        interchanges.add(LCapsule(x.id, r.x, r.y, r.w, r.h, x.trust == "ai_read", if (size == "spine") emptyList() else idx.map { pt(t, laneC(it)) }))
    }

    // Stops.
    class StopAt(val id: String, val t: Double, val c: Double, val r: Double, val stop: MapStop)
    val stops = mutableListOf<LStop>()
    val stopPos = mutableListOf<StopAt>()
    if (size == "routemap" || size == "phone") m.lines.forEachIndexed { i, l ->
        val c = laneC(i)
        val mine = m.stops.filter { it.lineId == l.lineId && it.id !in inCapsule }.mapNotNull { s -> pos(s.date)?.let { s to it } }
        val run = mutableListOf<Pair<MapStop, Double>>()
        fun flush() {
            if (run.isEmpty()) return
            val t = run.sumOf { it.second } / run.size
            val p = pt(t, c)
            stops.add(LStop(run[0].first.id, l.lineId, p.x, p.y, if (run.size > 1) 7.0 else 5.0, run.any { it.first.trust == "ai_read" }, false, run.size, run.map { it.first.id }))
            run.clear()
        }
        for ((s, t) in mine) {
            if (s.major) {
                flush()
                val p = pt(t, c)
                stops.add(LStop(s.id, l.lineId, p.x, p.y, 9.0, s.trust == "ai_read", true, 1, listOf(s.id)))
                stopPos.add(StopAt(s.id, t, c, 9.0, s))
                continue
            }
            if (run.isNotEmpty() && abs(t - run.last().second) * k >= 8) flush()
            run.add(s to t)
        }
        flush()
    }

    // Rings.
    val rings = mutableListOf<LRing>()
    m.lines.forEachIndexed { i, l ->
        val c = laneC(i)
        val brk = m.range.scaleBreak
        val mine = m.rings.filter { it.lineId == l.lineId }.mapNotNull { r -> pos(r.date)?.let { r to it } }
            .filter { (r, _) -> size != "spine" || brk == null || dayOf(r.date) >= dayOf(brk) }
            .sortedWith(compareBy<Pair<MapRing, Double>>({ it.second }, { it.first.itemKey }))
        var j = 0
        mine.forEachIndexed { idx, (r, t) ->
            j = if (idx > 0 && (t - mine[idx - 1].second) * k < 14) j + 1 else 0
            val off = if (size == "spine" || j == 0) 0.0 else if (j % 2 == 1) -8.0 else 8.0
            val p = pt(t, c + off)
            rings.add(LRing(r.itemKey, l.lineId, p.x, p.y, geo.ringR, r.status))
        }
    }

    // Visits.
    val visits = mutableListOf<LVisit>()
    if (size != "spine" && n > 0) for (v in m.visits) {
        val t = pos(v.weekOf) ?: continue
        val idx = m.rings.filter { it.itemKey in v.itemKeys }.mapNotNull { laneOf[it.lineId] }.distinct()
        val use = idx.ifEmpty { m.lines.indices.toList() }
        val r = rect(t - 10, t + 10, laneC(use.min()) - 12, laneC(use.max()) + 12)
        visits.add(LVisit(v.id ?: v.suggestionKey ?: "", v.state, r.x, r.y, r.w, r.h))
    }

    // Eras.
    val eras = mutableListOf<LEra>()
    if (size == "routemap" || size == "phone") for (l in m.lines) {
        val mine = m.eras.filter { it.lineId == l.lineId }
        for (e in if (o.allEras) mine else mine.filter { it.to == null }) {
            val a = max(dayOf(e.from), lo(ps)); val b = min(e.to?.let { dayOf(it) } ?: today, hi(ps))
            if (b <= a) continue
            val c = laneC(laneOf.getValue(l.lineId))
            for ((p, q) in spanOf(ps, a, b)) { val r = rect(p, q, c - 10, c + 10); eras.add(LEra(l.lineId, r.x, r.y, r.w, r.h)) }
        }
    }

    // Squawks.
    val squawks = mutableListOf<LSquawk>()
    if (!isLineAhead) for (s in m.squawks) {
        val t = pos(s.date) ?: continue
        val i = laneOf[s.lineId] ?: continue
        val p = pt(t, laneC(i))
        squawks.add(LSquawk(s.id, p.x, p.y, s.open))
    }

    // Today, break, window.
    val cs = m.lines.indices.map { laneC(it) }
    val cMin = if (n > 0) cs.min() else if (size == "spine") 20.0 else geo.laneStart
    val cMax = if (n > 0) cs.max() else cMin
    fun clampC(c: Double) = if (size == "spine") min(40.0, max(0.0, c)) else c
    val tToday = pos(m.today)
    val todaySeg = tToday?.let { seg(it, clampC(cMin - 12), it, clampC(cMax + 12)) }
    var scaleBreak: LSeg? = null
    val brkDate = m.range.scaleBreak
    if (brkDate != null && o.zoom == null && (size == "routemap" || size == "spine" || size == "phone")) {
        if (dayOf(brkDate) > lo(ps)) {
            val t = if (size == "phone") P_TOP + P_FUTURE + P_RECENT + P_BRK / 2 else (geo.brk!!.first + geo.brk.second) / 2
            scaleBreak = seg(t, clampC(cMin - 12), t, clampC(cMax + 12))
        }
    }
    var window: LRect? = null
    o.window?.let { w ->
        val a = posOf(ps, max(dayOf(w.from), lo(ps))); val b = posOf(ps, min(dayOf(w.to), hi(ps)))
        if (a != null && b != null) window = if (size == "spine") rect(a, b, 2.0, 38.0) else rect(a, b, cMin - 20, cMax + 20)
    }

    // Ticks.
    val ticks = mutableListOf<LTick>()
    if (size != "spine") {
        class TC(val t: Double, val label: String, val anchor: String, val today: Boolean = false)
        val cand = mutableListOf<TC>()
        fun add(d: String, label: String, anchor: String = "middle") { pos(d)?.let { cand.add(TC(it, label, anchor)) } }
        if (tToday != null) cand.add(TC(tToday, "Today", "middle", true))
        if (isLineAhead) {
            var d = Dates.addMonths("${m.today.take(7)}-01", 1)
            while (dayOf(d) <= hi(ps)) {
                add(d, if (d.substring(5, 7) == "01") monYear(d) else MONTHS[d.substring(5, 7).toInt() - 1])
                d = Dates.addMonths(d, 1)
            }
        } else {
            val a = lo(ps)
            val b = o.zoom?.let { dayOf(it.to) } ?: brkDate?.let { dayOf(it) } ?: hi(ps)
            val y0 = isoOf(a).take(4).toInt(); val y1 = isoOf(b).take(4).toInt()
            val step = if (y1 - y0 >= 20) 10 else if (y1 - y0 >= 6) 5 else 1
            var y = ceil(y0.toDouble() / step).toInt() * step
            while (y <= y1) {
                val d = "${y.toString().padStart(4, '0')}-01-01"
                if (dayOf(d) >= a && dayOf(d) < b) add(d, y.toString(), if (size == "phone") "start" else "middle")
                y += step
            }
            if (brkDate != null && o.zoom == null && size != "phone") add(brkDate, monYear(brkDate))
            if (size != "phone" && o.zoom == null) add(m.range.to, m.range.to.take(4), "end")
        }
        val minGap = (if (vert) 16.0 else 40.0) / k
        val kept = mutableListOf<TC>()
        for (c in cand.filter { it.today } + cand.filter { !it.today }.sortedBy { it.t })
            if (kept.all { abs(it.t - c.t) >= minGap }) kept.add(c)
        for (c in kept.sortedBy { it.t })
            ticks.add(if (vert) LTick(0.0, r1(c.t + 4), c.label, "start") else LTick(r1(c.t), tickY, c.label, c.anchor))
    }

    // Labels.
    val labels = mutableListOf<LLabel>()
    var more = 0
    if (geo.labelled) {
        val pad = 3.0
        val obstacles = mutableListOf<Box>()
        fun ob(x: Double, y: Double, w: Double, h: Double) = obstacles.add(Box(x - pad, y - pad, w + 2 * pad, h + 2 * pad))
        for (s in stops) ob(s.x - s.r, s.y - s.r, 2 * s.r, 2 * s.r)
        for (r in rings) ob(r.x - r.r, r.y - r.r, 2 * r.r, 2 * r.r)
        for (c in interchanges) ob(c.x, c.y, c.w, c.h)
        for (c in visits) ob(c.x, c.y, c.w, c.h)
        if (!vert) obstacles.add(Box(0.0, tickY - tfs, geo.width, height))

        val want = mutableListOf<Want>()
        val ringOf = m.rings.associateBy { it.itemKey }
        val phoneHome = size == "lineahead-phone"
        for (r in rings) {
            val mr = ringOf.getValue(r.itemKey)
            if (phoneHome && mr.kind != "annual") continue
            val t = if (vert) r.y else r.x; val c = if (vert) r.x else r.y
            want.add(Want("ring:${r.itemKey}", clip(mr.label), if (r.status == "overdue") 0 else if (r.status == "due_soon") 1 else 7, t, c - r.r, c + r.r, false))
        }
        for (v in visits) {
            val mv = m.visits.first { (it.id ?: it.suggestionKey) == v.id }
            val text = if (mv.state == "in_shop") "In the shop" else "${if (mv.state == "planned") "Planned" else "Suggested"}, week of ${monDay(mv.weekOf)}"
            if (vert) want.add(Want("visit:${v.id}", text, 2, v.y + v.h / 2, v.x, v.x + v.w, false))
            else want.add(Want("visit:${v.id}", text, 2, v.x + v.w / 2, v.y, v.y + v.h, false))
        }
        if (!phoneHome) {
            for (x in interchanges) {
                val mx = m.interchanges.first { it.id == x.id }
                val text = clip("${mx.label ?: "Visit"}, ${monYear(mx.date)}")
                if (vert) want.add(Want("interchange:${x.id}", text, 3, x.y + x.h / 2, x.x, x.x + x.w, false))
                else want.add(Want("interchange:${x.id}", text, 3, x.x + x.w / 2, x.y, x.y + x.h, false))
            }
            for (s in stopPos) {
                val year = s.stop.date.take(4)
                want.add(Want("stop:${s.id}", clip(if (s.stop.label != null) "${s.stop.label}, $year" else year), 4, s.t, s.c - s.r, s.c + s.r, false))
            }
            for (g in segments.filter { it.gapId != null }) {
                if (want.any { it.key == "gap:${g.gapId}" }) continue
                val mg = m.gaps.first { it.id == g.gapId }
                val before = m.stops.none { it.lineId == mg.lineId && it.date <= mg.from }
                val text = if (mg.status == "no_pages_exist") "No pages exist (you marked this)"
                else if (before) "No pages yet before ${mg.to.take(4)}" else "No pages, ${mg.from.take(4)} to ${mg.to.take(4)}"
                val pieces = segments.filter { it.gapId == g.gapId }
                val t1 = if (vert) pieces.first().y1 else pieces.first().x1
                val t2 = if (vert) pieces.last().y2 else pieces.last().x2
                val c = if (vert) g.x1 else g.y1
                want.add(Want("gap:${g.gapId}", text, 5, (t1 + t2) / 2, c - 3, c + 3, true))
            }
        }
        want.sortWith(compareBy<Want>({ it.prio }, { it.t }, { it.key }))
        for (w in want) {
            val tw = w.text.length * fs * 0.56
            val cands = mutableListOf<Cand>()
            if (vert) {
                val y = w.t + 0.35 * fs
                cands.add(Cand(P_LABEL_X, y, "start", Box(P_LABEL_X, y - 0.8 * fs, tw, fs)))
            } else {
                for (y in listOf(w.cTop - 8, w.cBot + 8 + 0.8 * fs)) {
                    if (w.centred) cands.add(Cand(w.t, y, "middle", Box(w.t - tw / 2, y - 0.8 * fs, tw, fs)))
                    else {
                        cands.add(Cand(w.t + 8, y, "start", Box(w.t + 8, y - 0.8 * fs, tw, fs)))
                        cands.add(Cand(w.t - 8, y, "end", Box(w.t - 8 - tw, y - 0.8 * fs, tw, fs)))
                    }
                }
            }
            fun inside(b: Box) = b.x >= geo.nameW && b.x + b.w <= geo.width && b.y >= 0 && b.y + b.h <= height
            val ok = cands.firstOrNull { c -> inside(c.box) && obstacles.none { c.box.hits(it) } }
            if (ok == null) { more++; continue }
            labels.add(LLabel(w.key, w.text, r1(ok.x), r1(ok.y), ok.anchor))
            obstacles.add(Box(ok.box.x - pad, ok.box.y - pad, ok.box.w + 2 * pad, ok.box.h + 2 * pad))
        }
    }

    return Layout(
        size, geo.width, r1(height), r1(fs), lanes, segments, stops, interchanges, rings, visits, eras, squawks,
        todaySeg, scaleBreak, window, ticks, labels, more,
    )
}

package com.mytaillog.app

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.traversalIndex
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.mytaillog.core.api.Books
import com.mytaillog.core.domain.due.fmtDate
import com.mytaillog.core.domain.map.LSegment
import com.mytaillog.core.domain.map.Layout
import com.mytaillog.core.domain.map.LayoutOptions
import com.mytaillog.core.domain.map.MapModel
import com.mytaillog.core.domain.map.layoutMap
import com.mytaillog.design.MyTailLogColors
import com.mytaillog.design.MyTailLogTheme
import com.mytaillog.design.Section
import com.mytaillog.design.Tokens
import com.mytaillog.design.line
import com.mytaillog.design.section
import com.mytaillog.design.statusMark
import kotlin.math.hypot
import kotlin.math.roundToInt

/** Something on the map a tap or TalkBack can open. */
sealed interface MapTarget {
    data class Stop(val stopIds: List<String>) : MapTarget
    data class Visit(val id: String) : MapTarget
    data class Gap(val id: String) : MapTarget
    data class Ring(val itemKey: String) : MapTarget
}

/** One target with where it is (layout units) and what TalkBack calls it. */
data class Placed(val target: MapTarget, val x: Double, val y: Double, val name: String, val t: Double)

/** Every target of a layout in time order, newest first, named per 10 §10. */
fun targets(b: Books, m: MapModel, l: Layout): List<Placed> {
    val vertical = l.size == "phone"
    fun t(x: Double, y: Double) = if (vertical) y else -x
    val entries = b.entries.associateBy { it.id }
    val stops = m.stops.associateBy { it.id }
    val out = mutableListOf<Placed>()
    for (s in l.stops) {
        val first = stops[s.ids.first()] ?: continue
        val name = if (s.count > 1) "${s.count} entries around ${fmtDate(first.date)}, ${bookName(first.logbook)}"
        else spokenStop(b, first.entryIds.firstNotNullOfOrNull { entries[it] }, first.date, first.logbook, first.trust)
        out += Placed(MapTarget.Stop(s.ids), s.x, s.y, name, t(s.x, s.y))
    }
    for (c in l.interchanges) {
        val x = m.interchanges.firstOrNull { it.id == c.id } ?: continue
        val books = x.lineIds.mapNotNull { id -> m.lines.firstOrNull { it.lineId == id }?.name }
        val trust = if (x.trust == "ai_read") ", read by AI" else ""
        out += Placed(MapTarget.Visit(c.id), c.x + c.w / 2, c.y + c.h / 2, "${x.label ?: "Visit"}, ${fmtDate(x.date)}, ${books.joinToString(" and ")}$trust", t(c.x + c.w / 2, c.y + c.h / 2))
    }
    for ((id, segs) in l.segments.filter { it.gapId != null }.groupBy { it.gapId!! }) {
        val g = m.gaps.firstOrNull { it.id == id } ?: continue
        val mid = segs[segs.size / 2]
        val x = (mid.x1 + mid.x2) / 2; val y = (mid.y1 + mid.y2) / 2
        val words = if (g.status == "no_pages_exist") "No pages exist for ${g.from.take(4)} to ${g.to.take(4)}, you marked this"
        else "No pages, ${g.from.take(4)} to ${g.to.take(4)}"
        out += Placed(MapTarget.Gap(id), x, y, "$words, ${bookName(g.logbook)}, gap", t(x, y))
    }
    for (r in l.rings) {
        val mr = m.rings.firstOrNull { it.itemKey == r.itemKey } ?: continue
        out += Placed(MapTarget.Ring(r.itemKey), r.x, r.y, "${mr.label}, ${statusWord(mr.status).lowercase()}, ${fmtDate(mr.date)}, ${bookName(mr.line)}", t(r.x, r.y))
    }
    return out.sortedBy { it.t }
}

/** Targets within [reach] layout units of a tap; capsules hit anywhere inside. */
fun hits(l: Layout, all: List<Placed>, x: Double, y: Double, reach: Double): List<MapTarget> {
    fun nearSeg(s: LSegment): Boolean {
        val dx = s.x2 - s.x1; val dy = s.y2 - s.y1
        val len2 = dx * dx + dy * dy
        val k = if (len2 == 0.0) 0.0 else (((x - s.x1) * dx + (y - s.y1) * dy) / len2).coerceIn(0.0, 1.0)
        return hypot(x - (s.x1 + k * dx), y - (s.y1 + k * dy)) <= reach / 2
    }
    val gaps = l.segments.filter { it.gapId != null && nearSeg(it) }.map { it.gapId }.toSet()
    val caps = l.interchanges.filter { x >= it.x - 4 && x <= it.x + it.w + 4 && y >= it.y - 4 && y <= it.y + it.h + 4 }.map { it.id }.toSet()
    return all.filter { p ->
        when (val tg = p.target) {
            is MapTarget.Gap -> tg.id in gaps
            is MapTarget.Visit -> tg.id in caps
            else -> hypot(p.x - x, p.y - y) <= reach
        }
    }.map { it.target }
}

/**
 * The RouteMap drawn from the shared layout (10 §6, §8.2, §8.4): "phone" is the vertical map, newest
 * at the top; "routemap" the tablet's horizontal one. Positions come from [layoutMap], never re-derived.
 * Each element also exists as an invisible TalkBack node in time order, so nothing needs the canvas.
 */
@Composable
fun rememberMapLayout(model: MapModel, kind: String, widthDp: Float): Layout {
    val fontScale = LocalDensity.current.fontScale
    // Labels are 13sp at any width: the layout sizes its label boxes for the rendered width in text units.
    return remember(model, kind, widthDp, fontScale) { layoutMap(model, LayoutOptions(kind, renderedWidth = (widthDp / fontScale).toDouble())) }
}

@Composable
fun RouteMapView(
    books: Books,
    model: MapModel,
    layout: Layout,
    onTarget: (MapTarget) -> Unit,
    modifier: Modifier = Modifier,
    selected: MapTarget? = null,
) {
    val c = MyTailLogTheme.colors
    val measurer = rememberTextMeasurer()
    val labelStyle = MaterialTheme.typography.labelMedium.copy(color = c.ink2, fontWeight = FontWeight(600))
    val tickStyle = MaterialTheme.typography.labelSmall.copy(color = c.ink3, fontWeight = FontWeight(600))
    var menu by remember { mutableStateOf<List<MapTarget>>(emptyList()) }
    BoxWithConstraints(modifier.fillMaxWidth()) {
        val widthDp = maxWidth.value
        val all = remember(books, model, layout) { targets(books, model, layout) }
        val unitDp = widthDp / layout.width.toFloat()
        Box(Modifier.fillMaxWidth().height((layout.height * unitDp).dp)) {
            Canvas(
                Modifier
                    .fillMaxWidth()
                    .height((layout.height * unitDp).dp)
                    .semantics { contentDescription = mapName(model) }
                    .pointerInput(layout, all) {
                        detectTapGestures { pos ->
                            val u = size.width / layout.width
                            val found = hits(layout, all, pos.x / u, pos.y / u, 22.dp.toPx() / u)
                            when (found.size) {
                                0 -> Unit
                                1 -> onTarget(found.single())
                                else -> menu = found
                            }
                        }
                    },
            ) { drawLayout(layout, model, c, (size.width / layout.width).toFloat(), measurer, labelStyle, tickStyle, selected) }
            // TalkBack: years as headings and every element as a node, newest first (05 §21, 10 §10).
            layout.ticks.forEach { t ->
                Box(
                    Modifier
                        .offset { IntOffset((t.x * unitDp).dp.roundToPx(), ((t.y - 10) * unitDp).dp.roundToPx()) }
                        .size(1.dp)
                        .semantics { heading(); contentDescription = t.label; traversalIndex = (t.y / 1000).toFloat() },
                )
            }
            all.forEachIndexed { i, p ->
                Box(
                    Modifier
                        .offset { IntOffset(((p.x * unitDp).dp - 22.dp).roundToPx(), ((p.y * unitDp).dp - 22.dp).roundToPx()) }
                        .size(44.dp)
                        .semantics {
                            contentDescription = p.name
                            traversalIndex = (p.y / 1000 + i * 1e-6).toFloat()
                            onClick(label = "Open") { onTarget(p.target); true }
                        },
                )
            }
            DropdownMenu(menu.isNotEmpty(), { menu = emptyList() }, containerColor = c.leaf) {
                menu.forEach { t ->
                    DropdownMenuItem(
                        text = { Text(all.firstOrNull { it.target == t }?.name ?: "", color = c.ink) },
                        onClick = { menu = emptyList(); onTarget(t) },
                    )
                }
            }
        }
    }
}

fun mapName(m: MapModel): String = "Route map of the logbooks, ${m.range.from.take(4)} to ${m.range.to.take(4)}. Use Show as list for every entry."

private fun DrawScope.drawLayout(
    l: Layout,
    m: MapModel,
    c: MyTailLogColors,
    u: Float,
    measurer: androidx.compose.ui.text.TextMeasurer,
    labelStyle: androidx.compose.ui.text.TextStyle,
    tickStyle: androidx.compose.ui.text.TextStyle,
    selected: MapTarget?,
) {
    fun o(x: Double, y: Double) = Offset(x.toFloat() * u, y.toFloat() * u)
    val ink = { lineId: String -> c.line(m.lines.firstOrNull { it.lineId == lineId }?.logbook) }
    val line = Tokens.Map.lineStroke.toPx()
    for (e in l.eras) drawRoundRect(ink(e.lineId).copy(alpha = 0.08f), o(e.x, e.y), Size(e.w.toFloat() * u, e.h.toFloat() * u), CornerRadius(4.dp.toPx()))
    for (s in l.segments) {
        val color = ink(s.lineId)
        val a = o(s.x1, s.y1); val b = o(s.x2, s.y2)
        when (s.kind) {
            "solid" -> drawLine(color, a, b, line, StrokeCap.Round)
            "future" -> drawLine(color, a, b, line, StrokeCap.Round, PathEffect.dashPathEffect(floatArrayOf(0.1f, Tokens.Map.futureDotSpacing.toPx())))
            "gap" -> drawLine(color, a, b, Tokens.Map.gapStroke.toPx(), StrokeCap.Butt, PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 6.dp.toPx())))
            else -> drawLine(color.copy(alpha = 0.6f), a, b, 3.dp.toPx())
        }
    }
    val stroke = Tokens.Map.stopStroke.toPx()
    val dotted = PathEffect.dashPathEffect(floatArrayOf(2.dp.toPx(), 2.5.dp.toPx()))
    for (v in l.visits) {
        val tl = o(v.x, v.y); val sz = Size(v.w.toFloat() * u, v.h.toFloat() * u); val r = CornerRadius(minOf(sz.width, sz.height) / 2)
        drawRoundRect(c.leaf2, tl, sz, r)
        drawRoundRect(c.ink, tl, sz, r, Stroke(stroke, pathEffect = if (v.state == "planned") null else PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 4.dp.toPx()))))
    }
    for (x in l.interchanges) {
        val tl = o(x.x, x.y); val sz = Size(x.w.toFloat() * u, x.h.toFloat() * u); val r = CornerRadius(minOf(sz.width, sz.height) / 2)
        val sel = selected is MapTarget.Visit && selected.id == x.id
        drawRoundRect(c.leaf, tl, sz, r)
        drawRoundRect(c.ink, tl, sz, r, Stroke(if (sel) Tokens.Map.capSelStroke.toPx() else Tokens.Map.capStroke.toPx(), pathEffect = if (x.dotted) dotted else null))
        for (d in x.dots) drawCircle(c.ink, 2.5.dp.toPx(), o(d.x, d.y))
    }
    for (s in l.stops) {
        val p = o(s.x, s.y); val r = s.r.toFloat() * u
        drawCircle(c.leaf, r, p)
        drawCircle(c.ink, r, p, style = Stroke(stroke, pathEffect = if (s.dotted) dotted else null))
        if (s.count > 1) drawCircle(c.ink, 1.5.dp.toPx(), p)
        if (selected is MapTarget.Stop && selected.stopIds.first() == s.id) drawCircle(c.section(Section.Books).boardInk, r + 4.dp.toPx(), p, style = Stroke(2.dp.toPx()))
    }
    for (r in l.rings) statusMark(markKind(r.status), o(r.x, r.y), r.r.toFloat() * u, c, Tokens.Map.ringStroke.toPx())
    for (q in l.squawks) {
        val p = o(q.x, q.y); val h = 4.dp.toPx()
        val path = Path().apply { moveTo(p.x, p.y - h); lineTo(p.x + h, p.y); lineTo(p.x, p.y + h); lineTo(p.x - h, p.y); close() }
        drawPath(path, if (q.open) c.ink else c.leaf)
        drawPath(path, c.ink, style = Stroke(1.5.dp.toPx()))
    }
    l.today?.let { drawLine(c.ink, o(it.x1, it.y1), o(it.x2, it.y2), 1.5.dp.toPx()) }
    l.scaleBreak?.let { b ->
        // The standard break mark: two short parallel rules across the lanes.
        val off = if (l.size == "phone") Offset(0f, 2.dp.toPx()) else Offset(2.dp.toPx(), 0f)
        drawLine(c.ink3, o(b.x1, b.y1) - off, o(b.x2, b.y2) - off, 1.dp.toPx())
        drawLine(c.ink3, o(b.x1, b.y1) + off, o(b.x2, b.y2) + off, 1.dp.toPx())
    }
    if (l.size != "phone") for (lane in l.lanes) text(measurer.measure(lane.name, labelStyle), o(lane.nameX, lane.nameY), "start")
    for (t in l.ticks) text(measurer.measure(t.label, tickStyle), o(t.x, t.y), t.anchor)
    for (lb in l.labels) text(measurer.measure(lb.text, labelStyle), o(lb.x, lb.y), lb.anchor)
}

/** Text with its baseline at [at], anchored like SVG text-anchor. */
private fun DrawScope.text(m: TextLayoutResult, at: Offset, anchor: String) {
    val dx = when (anchor) { "middle" -> m.size.width / 2f; "end" -> m.size.width.toFloat(); else -> 0f }
    drawText(m, topLeft = Offset((at.x - dx).coerceIn(0f, maxOf(0f, size.width - m.size.width)), at.y - m.firstBaseline))
}

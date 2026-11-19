package com.mytaillog.design

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** StatusMark kinds (02 §5.2). The kind comes from the server status. */
enum class MarkKind { Current, DueSoon, Overdue, NoRecord, Advisory, Neutral }

/**
 * The mark alone, drawn into [radius] around [center]: filled dot, alarm ring, dashed ring, ink ring.
 * Shared by StatusMark and the LineAhead's rings so the vocabulary is one drawing.
 */
fun DrawScope.statusMark(kind: MarkKind, center: Offset, radius: Float, c: MyTailLogColors, stroke: Float = 3.dp.toPx(), fill: Color = c.leaf) {
    fun ring(color: Color, width: Float, effect: PathEffect? = null) {
        drawCircle(fill, radius, center)
        drawCircle(color, radius - width / 2, center, style = Stroke(width, pathEffect = effect))
    }
    when (kind) {
        MarkKind.Current -> drawCircle(c.ink, radius, center)
        MarkKind.DueSoon -> ring(c.alarm, stroke)
        MarkKind.Overdue -> drawCircle(c.alarm, radius, center)
        MarkKind.NoRecord -> ring(c.ink3, 2.dp.toPx(), PathEffect.dashPathEffect(floatArrayOf(3.dp.toPx(), 3.dp.toPx())))
        MarkKind.Neutral -> ring(c.ink, 2.dp.toPx())
        MarkKind.Advisory -> Unit
    }
}

/** StatusMark (02 §5.2): mark plus word, never colour alone. Overdue is a slip with a white dot. */
@Composable
fun StatusMark(kind: MarkKind, label: String, modifier: Modifier = Modifier, compact: Boolean = false) {
    val c = MyTailLogTheme.colors
    val base = if (compact) MaterialTheme.typography.labelMedium else MaterialTheme.typography.bodyMedium
    val style = base.copy(fontWeight = FontWeight(if (kind == MarkKind.Advisory) 500 else 700))
    val markSize = if (compact) 10.dp else 12.dp
    if (kind == MarkKind.Overdue) {
        Row(
            modifier.clip(RoundedCornerShape(Tokens.Radius.s)).background(c.alarm).padding(start = 7.dp, end = 9.dp, top = 2.dp, bottom = 2.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(8.dp).clip(RoundedCornerShape(Tokens.Radius.pill)).background(c.onAlarm))
            Text(label, color = c.onAlarm, style = style, softWrap = false)
        }
        return
    }
    val color = when (kind) {
        MarkKind.DueSoon -> c.alarmText
        MarkKind.NoRecord -> c.ink3
        MarkKind.Advisory -> c.ink2
        else -> c.ink
    }
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(7.dp), verticalAlignment = Alignment.CenterVertically) {
        if (kind != MarkKind.Advisory) {
            Canvas(Modifier.size(markSize)) { statusMark(kind, center, size.minDimension / 2, c, stroke = (if (compact) 2.5f else 3f).dp.toPx()) }
        }
        Text(label, color = color, style = style, softWrap = false)
    }
}

enum class TrustLevel { AiRead, Confirmed, Signed }

/** TrustMark (02 §5.3): dotted ring read by AI, filled dot confirmed, diamond signed. The words carry the meaning. */
@Composable
fun TrustMark(level: TrustLevel, label: String, modifier: Modifier = Modifier) {
    val c = MyTailLogTheme.colors
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(5.dp), verticalAlignment = Alignment.CenterVertically) {
        val mark = Modifier.size(9.dp)
        when (level) {
            TrustLevel.AiRead -> Canvas(mark) {
                drawCircle(c.ink3, size.minDimension / 2 - 1.dp.toPx(), style = Stroke(2.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(1.5f.dp.toPx(), 1.5f.dp.toPx()))))
            }
            TrustLevel.Confirmed -> Box(mark.clip(RoundedCornerShape(Tokens.Radius.pill)).background(c.ink))
            TrustLevel.Signed -> Box(Modifier.size(7.dp).rotate(45f).clip(RoundedCornerShape(1.dp)).background(c.ink))
        }
        Text(label, color = c.ink2, style = MaterialTheme.typography.labelMedium, softWrap = false)
    }
}

/** The logbook ink for a line ("airframe", "engine", "propeller", "avionics", anything else is other). */
fun MyTailLogColors.line(line: String?): Color = when (line) {
    "airframe" -> lineAirframe
    "engine" -> lineEngine
    "propeller", "prop" -> linePropeller
    "avionics" -> lineAvionics
    else -> lineOther
}

/** LineChip (02 §5.5): the book's ink swatch and its name. */
@Composable
fun LineChip(line: String?, label: String, modifier: Modifier = Modifier) {
    val c = MyTailLogTheme.colors
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.width(16.dp).height(5.dp).clip(RoundedCornerShape(Tokens.Radius.s)).background(c.line(line)))
        Text(label, color = c.ink2, style = MaterialTheme.typography.labelMedium, softWrap = false)
    }
}

/** FirstBadge (02 §5.6): which limit bites first. TalkBack hears "comes first". */
@Composable
fun FirstBadge(text: String, spoken: String, modifier: Modifier = Modifier) {
    val c = MyTailLogTheme.colors
    Text(
        text,
        color = c.ink,
        style = MaterialTheme.typography.labelSmall,
        modifier = modifier
            .border(1.dp, c.ink, RoundedCornerShape(2.dp))
            .padding(horizontal = 4.dp)
            .clearAndSetSemantics { contentDescription = spoken },
    )
}

/**
 * PageCite (02 §5.4): "Airframe p. 58" in the board ink, underlined (Decision: solid on Android).
 * Spoken expanded. Null [label] is an owner's note without a page: "your note" in ink-3, not a link.
 */
@Composable
fun PageCite(label: String?, noteText: String, section: Section, modifier: Modifier = Modifier) {
    val c = MyTailLogTheme.colors
    val style = MaterialTheme.typography.labelMedium
    if (label == null) {
        Text(noteText, color = c.ink3, style = style, modifier = modifier)
        return
    }
    Text(
        label,
        color = c.section(section).boardInk,
        style = style.copy(textDecoration = TextDecoration.Underline),
        softWrap = false,
        modifier = modifier.semantics { contentDescription = label.replace(" p. ", " logbook, page ") },
    )
}

/**
 * Verdict (02 §5.1): the opening sentence in type.lede with the server's bold runs at 800.
 * A heading for TalkBack; wraps, never truncates.
 */
@Composable
fun Verdict(text: String, emphasis: List<IntRange>, modifier: Modifier = Modifier) {
    val c = MyTailLogTheme.colors
    val annotated = buildAnnotatedString {
        append(text)
        emphasis.forEach { r ->
            val from = r.first.coerceIn(0, text.length)
            val to = (r.last + 1).coerceIn(from, text.length)
            addStyle(SpanStyle(fontWeight = FontWeight(800)), from, to)
        }
    }
    Text(annotated, color = c.ink, style = MaterialTheme.typography.titleLarge, modifier = modifier.semantics { heading() })
}

/** PhoneGroupHeader (02 §9.6): 14/700 ink-3 over a 2dp ink rule; [count] after it at 400. */
@Composable
fun GroupHeader(title: String, modifier: Modifier = Modifier, count: String? = null) {
    val c = MyTailLogTheme.colors
    Column(modifier.fillMaxWidth().padding(top = Tokens.Space.s4).semantics(mergeDescendants = true) { heading() }) {
        Text(
            buildAnnotatedString {
                append(title)
                if (count != null) withStyle(SpanStyle(fontWeight = FontWeight(400))) { append("  $count") }
            },
            color = c.ink3,
            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight(700)),
            modifier = Modifier.padding(bottom = 6.dp),
        )
        Box(Modifier.fillMaxWidth().height(2.dp).background(c.ink))
    }
}

/** Skeleton (02 §8.3): a still leaf-2 block in the shape of what is coming. No shimmer (11: reduce motion). */
@Composable
fun Skeleton(fraction: Float, height: Dp, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth(fraction).height(height).clip(RoundedCornerShape(Tokens.Radius.s)).background(MyTailLogTheme.colors.leaf2))
}

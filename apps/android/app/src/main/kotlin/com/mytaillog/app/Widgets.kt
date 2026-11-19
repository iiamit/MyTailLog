package com.mytaillog.app

import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Canvas
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.drawscope.CanvasDrawScope
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.Action
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.updateAll
import androidx.glance.background
import androidx.glance.color.ColorProvider
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import com.mytaillog.core.domain.due.LineAhead
import com.mytaillog.design.DarkColors
import com.mytaillog.design.LightColors
import com.mytaillog.design.MyTailLogColors
import com.mytaillog.design.Tokens
import com.mytaillog.design.line
import com.mytaillog.design.statusMark
import java.time.Instant
import java.time.LocalDate

// Glance widgets (02 §9.14, 05 §11): Line ahead (4×2, resizable) and Next item (2×2). A white leaf in light and
// dark so the inks hold; status always as a word. Updates are pushed by the app (updatePeriodMillis 0).

private val leaf = ColorProvider(LightColors.leaf, DarkColors.leaf)
private val ink = ColorProvider(LightColors.ink, DarkColors.ink)
private val ink2 = ColorProvider(LightColors.ink2, DarkColors.ink2)
private val ink3 = ColorProvider(LightColors.ink3, DarkColors.ink3)
private val alarmText = ColorProvider(LightColors.alarmText, DarkColors.alarmText)

private fun palette(context: Context): MyTailLogColors =
    if ((context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES) DarkColors else LightColors

private fun open(context: Context, link: String): Action =
    actionStartActivity(Intent(Intent.ACTION_VIEW, Uri.parse(link), context, MainActivity::class.java))

/** Widget state from the snapshot file, with today's day counts. */
private fun current(context: Context): Pair<WidgetView, String?> {
    val data = WidgetData.load(context)
    return widgetView(data?.first, data?.second, LocalDate.now(), Instant.now()) to data?.second?.body?.aircraftId
}

/** Re-render every placed widget from the snapshot; after Status loads, after a sync, and on sign-out. */
suspend fun refreshWidgets(context: Context) {
    runCatching {
        LineAheadWidget().updateAll(context)
        NextItemWidget().updateAll(context)
    }
}

@Composable
private fun Leaf(summary: String, link: String, content: @Composable () -> Unit) {
    val context = LocalContext.current
    Column(
        GlanceModifier.fillMaxSize().background(leaf).cornerRadius(18.dp).padding(start = 14.dp, top = 11.dp, end = 14.dp, bottom = 12.dp)
            .clickable(open(context, link)).semantics { contentDescription = summary },
    ) { content() }
}

@Composable
private fun Head(view: WidgetView, right: String?) {
    Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.Vertical.Bottom) {
        Text(view.tail ?: "MyTailLog", style = TextStyle(color = ink, fontSize = 16.sp, fontWeight = FontWeight.Bold), maxLines = 1)
        Spacer(GlanceModifier.defaultWeight())
        right?.let { Text(it, style = TextStyle(color = ink3, fontSize = 14.sp), maxLines = 1) }
    }
    view.asOf?.let { Text(it, style = TextStyle(color = ink3, fontSize = 12.sp)) }
}

class LineAheadWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val (view, aircraftId) = current(context)
        provideContent { LineAheadContent(view, aircraftId) }
    }
}

@Composable
private fun LineAheadContent(view: WidgetView, aircraftId: String?) {
    val context = LocalContext.current
    val size = LocalSize.current
    Leaf(view.summary, appLink(aircraftId)) {
        Head(view, if (view.tail != null) "next 60 days" else null)
        val line = view.line
        if (line != null) {
            val h = if (size.height >= 200.dp) 76.dp else 44.dp
            val d = context.resources.displayMetrics.density
            val w = ((size.width.value - 28) * d).toInt().coerceAtLeast(1)
            Image(ImageProvider(lineBitmap(line, w, (h.value * d).toInt(), d, palette(context))), contentDescription = null, modifier = GlanceModifier.fillMaxWidth().height(h).padding(vertical = 4.dp))
        }
        view.rows.take(if (size.height >= 200.dp) 5 else 2).forEach { r ->
            val target = r.key?.let { appLink(aircraftId, "item/$it") } ?: appLink(aircraftId, "plan")
            Row(GlanceModifier.fillMaxWidth().clickable(open(context, target))) {
                Text(r.lead, style = TextStyle(color = ink, fontSize = 14.sp, fontWeight = FontWeight.Bold), maxLines = 1)
                Text(" " + r.rest, style = TextStyle(color = ink2, fontSize = 14.sp), maxLines = 1)
            }
        }
        view.empty?.let { Text(it, style = TextStyle(color = ink2, fontSize = 14.sp)) }
    }
}

class NextItemWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Single

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val (view, aircraftId) = current(context)
        provideContent { NextItemContent(view, aircraftId) }
    }
}

@Composable
private fun NextItemContent(view: WidgetView, aircraftId: String?) {
    val r = view.rows.firstOrNull { it.key != null }
    val summary = if (view.tail == null || r == null) view.summary else "${view.tail}. ${r.lead}, ${statusWord(r.status).lowercase()}, ${r.rest}."
    Leaf(summary, r?.key?.let { appLink(aircraftId, "item/$it") } ?: appLink(aircraftId)) {
        Head(view, null)
        if (r == null) {
            view.empty?.let { Text(it, style = TextStyle(color = ink2, fontSize = 14.sp)) }
        } else {
            Text(r.lead, style = TextStyle(color = ink2, fontSize = 14.sp), maxLines = 2)
            Text(r.value, style = TextStyle(color = ink, fontSize = 28.sp, fontWeight = FontWeight.Bold), maxLines = 1)
            r.about?.let { Text(it, style = TextStyle(color = ink2, fontSize = 13.sp), maxLines = 1) }
            val warn = r.status == "overdue" || r.status == "due_soon"
            Text(statusWord(r.status), style = TextStyle(color = if (warn) alarmText else ink, fontSize = 13.sp, fontWeight = FontWeight.Bold), maxLines = 1)
        }
    }
}

/**
 * The 60-day line as a bitmap (Glance has no canvas, 02 §9.14): the four book lines, solid to today then dotted,
 * and the listed items' rings drawn with the same StatusMark vocabulary as the phone's LineAhead.
 * shortcut: drawn in the theme of the moment it renders; a light/dark switch shows after the next refresh (hourly).
 */
fun lineBitmap(line: LineAhead, widthPx: Int, heightPx: Int, density: Float, c: MyTailLogColors): Bitmap {
    val img = ImageBitmap(widthPx, heightPx)
    CanvasDrawScope().draw(Density(density), LayoutDirection.Ltr, Canvas(img), Size(widthPx.toFloat(), heightPx.toFloat())) {
        val w = size.width
        val ringR = Tokens.Map.ringRadius.toPx() * 0.8f
        val gap = (size.height - 2 * ringR) / (LINES.size - 1)
        val today = LINE_PAST * w
        val stroke = 2.dp.toPx()
        val dots = PathEffect.dashPathEffect(floatArrayOf(0.1f, Tokens.Map.futureDotSpacing.toPx() / 2))
        LINES.forEachIndexed { i, (name, _) ->
            val y = ringR + i * gap
            val lineInk = c.line(name)
            drawLine(lineInk, Offset(0f, y), Offset(today, y), stroke, StrokeCap.Round)
            drawLine(lineInk, Offset(today, y), Offset(w, y), stroke, StrokeCap.Round, dots)
        }
        drawLine(c.ink3, Offset(today, 0f), Offset(today, size.height), 1.dp.toPx())
        line.rings.forEach { r ->
            val row = lineRow(r.line).takeIf { it >= 0 } ?: return@forEach
            val status = if (r.date < line.from) "overdue" else r.status
            val center = Offset((lineX(r.date, line) * w).coerceIn(ringR, w - ringR), ringR + row * gap)
            statusMark(markKind(status), center, ringR, c, 2.dp.toPx())
        }
    }
    return img.asAndroidBitmap()
}

class LineAheadReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = LineAheadWidget()
}

class NextItemReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = NextItemWidget()
}

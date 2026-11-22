package com.mytaillog.app

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.rememberTransformableState
import androidx.compose.foundation.gestures.transformable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.mytaillog.core.api.FieldBox
import com.mytaillog.design.MyTailLogTheme
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** A page image on its way: null while loading, [Missing] when it couldn't be fetched. */
sealed interface Scan {
    data object Loading : Scan
    data object Missing : Scan
    data class Ready(val image: ImageBitmap) : Scan
}

@Composable
fun rememberScan(vm: BooksViewModel, pageId: String?, thumb: Boolean = false): Scan {
    val s by produceState<Scan>(Scan.Loading, pageId, thumb) {
        value = Scan.Loading
        value = pageId?.let { vm.image(it, thumb) }?.let { Scan.Ready(it) } ?: Scan.Missing
    }
    return s
}

/** [b] grown by [m] on every side, kept on the page. */
fun FieldBox.grown(m: Double): FieldBox {
    val x0 = max(0.0, x - m); val y0 = max(0.0, y - m)
    return FieldBox(x0, y0, min(1.0, x + w + m) - x0, min(1.0, y + h + m) - y0)
}

/**
 * ScanViewer's still form (02): the page (or the [crop] of it) on the mat, the entry's lines outlined
 * in on-cover and the selected field's ink under the yellow highlight. Boxes are fractions of the page.
 */
@Composable
fun ScanCrop(
    scan: Scan,
    description: String,
    modifier: Modifier = Modifier,
    crop: FieldBox? = null,
    outline: FieldBox? = null,
    highlight: FieldBox? = null,
) {
    val c = MyTailLogTheme.colors
    Box(modifier.background(c.mat).semantics { contentDescription = description }, contentAlignment = Alignment.Center) {
        when (scan) {
            Scan.Loading -> Unit
            Scan.Missing -> Text(stringResource(R.string.books_page_missing), color = c.onCover2, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(16.dp))
            is Scan.Ready -> Canvas(Modifier.fillMaxSize()) { drawScan(scan.image, crop, outline, highlight) }
        }
    }
}

private fun DrawScope.drawScan(img: ImageBitmap, crop: FieldBox?, outline: FieldBox?, highlight: FieldBox?) {
    val c = crop ?: FieldBox(0.0, 0.0, 1.0, 1.0)
    val sx = (c.x * img.width).toFloat(); val sy = (c.y * img.height).toFloat()
    val sw = max(1f, (c.w * img.width).toFloat()); val sh = max(1f, (c.h * img.height).toFloat())
    val k = min(size.width / sw, size.height / sh)
    val dx = (size.width - sw * k) / 2; val dy = (size.height - sh * k) / 2
    drawImage(
        img,
        srcOffset = IntOffset(sx.roundToInt(), sy.roundToInt()),
        srcSize = IntSize(sw.roundToInt(), sh.roundToInt()),
        dstOffset = IntOffset(dx.roundToInt(), dy.roundToInt()),
        dstSize = IntSize((sw * k).roundToInt(), (sh * k).roundToInt()),
    )
    fun rect(b: FieldBox): Pair<Offset, Size> =
        Offset(dx + ((b.x * img.width).toFloat() - sx) * k, dy + ((b.y * img.height).toFloat() - sy) * k) to
            Size((b.w * img.width).toFloat() * k, (b.h * img.height).toFloat() * k)
    val colors = com.mytaillog.design.LightColors
    highlight?.let { b ->
        val (o, s) = rect(b.grown(0.004))
        drawRect(colors.highlight, o, s)
        drawRect(colors.highlightEdge, o, s, style = Stroke(1.5.dp.toPx()))
    }
    outline?.let { b -> val (o, s) = rect(b.grown(0.006)); drawRect(colors.cover, o, s, style = Stroke(1.5.dp.toPx())) }
}

/** The full-page ScanViewer: pinch 1–5×, pan when zoomed. Outlines and highlight as [ScanCrop]. */
@Composable
fun ScanViewer(scan: Scan, description: String, modifier: Modifier = Modifier, outline: FieldBox? = null, highlight: FieldBox? = null) {
    var scale by remember { mutableFloatStateOf(1f) }
    var pan by remember { mutableStateOf(Offset.Zero) }
    val state = rememberTransformableState { zoom, move, _ ->
        scale = (scale * zoom).coerceIn(1f, 5f)
        pan = if (scale == 1f) Offset.Zero else pan + move
    }
    ScanCrop(
        scan, description,
        modifier
            .transformable(state, canPan = { scale > 1f })
            .graphicsLayer { scaleX = scale; scaleY = scale; translationX = pan.x; translationY = pan.y },
        outline = outline, highlight = highlight,
    )
}

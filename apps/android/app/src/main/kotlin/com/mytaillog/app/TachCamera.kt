package com.mytaillog.app

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.mytaillog.core.api.AircraftAccess
import com.mytaillog.core.domain.Mutation
import com.mytaillog.core.sync.RowRef
import com.mytaillog.design.ButtonKind
import com.mytaillog.design.DButton
import com.mytaillog.design.LucideIcons
import com.mytaillog.design.MyTailLogTheme
import com.mytaillog.design.PhoneHeader
import com.mytaillog.design.PhoneLeaf
import com.mytaillog.design.Section
import com.mytaillog.design.Tokens
import com.mytaillog.design.dTextFieldColors
import com.mytaillog.design.section
import kotlinx.coroutines.delay
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.LocalDate
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.max
import kotlin.math.roundToInt

/** The last tach reading the phone knows: the server's meter, or a newer one saved on this phone. */
data class LastTach(val value: Double?, val date: String?, val onPhone: Boolean = false) {
    val days: Long get() = date?.let { runCatching { java.time.temporal.ChronoUnit.DAYS.between(LocalDate.parse(it.take(10)), LocalDate.now()) }.getOrNull() } ?: 1
}

/**
 * M-FLIGHT-02 Photograph the tach and the confirm step (M-FLIGHT-03, the tach part). ML Kit text
 * recognition (bundled, offline, outside the AI allowance) on frames inside the 280×120 guide; a
 * value is found when the same plausible candidate wins 3 frames. Nothing is saved until **Save flight**,
 * which queues `reading.create` (source tach_photo) in the outbox: works in airplane mode end to end.
 */
@Composable
fun TachScreen(recs: Recs, last: LastTach, onClose: () -> Unit) {
    val context = LocalContext.current
    var granted by remember { mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    var denied by rememberSaveable { mutableStateOf(false) }
    var confirm by rememberSaveable { mutableStateOf<String?>(null) } // the value text once on the confirm step
    var fromPhoto by rememberSaveable { mutableStateOf<Double?>(null) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted = it; if (!it) { denied = true; confirm = "" } }
    LaunchedEffect(Unit) { if (!granted) permission.launch(Manifest.permission.CAMERA) }

    if (confirm != null) {
        FlightConfirm(recs, last, confirm!!, fromPhoto, denied, onClose)
        return
    }
    BackHandler(onBack = onClose)
    if (granted) TachCamera(last, onFound = { v -> fromPhoto = v; confirm = fmtHours(v) }, onType = { confirm = "" }, onCancel = onClose)
}

@Composable
private fun TachCamera(last: LastTach, onFound: (Double) -> Unit, onType: () -> Unit, onCancel: () -> Unit) {
    val context = LocalContext.current
    val resources = LocalResources.current
    val lifecycle = LocalLifecycleOwner.current
    val view = LocalView.current
    val haptics = LocalHapticFeedback.current
    val density = LocalDensity.current
    val c = MyTailLogTheme.colors
    var found by remember { mutableStateOf<Double?>(null) }
    var slow by remember { mutableStateOf(false) }
    var torch by remember { mutableStateOf(false) }
    var camera by remember { mutableStateOf<Camera?>(null) }
    val viewSize = remember { intArrayOf(0, 0) }
    val stillRead = remember { AtomicBoolean(false) }
    val busy = remember { AtomicBoolean(false) }
    val vote = remember { FrameVote() }
    val worker = remember { Executors.newSingleThreadExecutor() }
    val recognizer = remember { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }
    DisposableEffect(Unit) { onDispose { worker.shutdown(); recognizer.close() } }
    val guide = with(density) { Size(280.dp.toPx(), 120.dp.toPx()) }

    LaunchedEffect(Unit) { delay(8_000); if (found == null) slow = true }
    LaunchedEffect(found) {
        val v = found ?: return@LaunchedEffect
        haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        view.announceForAccessibility(resources.getString(R.string.tach_found, last.value?.let(::fmtHours) ?: "–"))
        delay(800)
        onFound(v)
    }

    val analysis = remember {
        ImageAnalysis.Builder().setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build().also { a ->
            a.setAnalyzer(worker) { img ->
                if (found != null || busy.get() || viewSize[0] == 0) { img.close(); return@setAnalyzer }
                busy.set(true)
                val bmp = try { PageImages.rotate(img.toBitmap(), img.imageInfo.rotationDegrees) } finally { img.close() }
                val crop = guideCrop(bmp, viewSize[0], viewSize[1], guide.width, guide.height)
                recognizer.process(InputImage.fromBitmap(crop, 0))
                    .addOnSuccessListener { t ->
                        val v = TachReader.pick(t.text, last.value, last.days)
                        val win = if (stillRead.getAndSet(false)) v else vote.update(v)
                        if (win != null) found = win
                    }
                    .addOnCompleteListener { busy.set(false) }
            }
        }
    }

    Column(Modifier.fillMaxSize().background(c.cover).windowInsetsPadding(WindowInsets.safeDrawing)) {
        Row(Modifier.fillMaxWidth().height(56.dp).padding(horizontal = Tokens.Space.s2), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onCancel, Modifier.semantics { contentDescription = resources.getString(R.string.cancel) }) { Icon(LucideIcons.X, null, tint = c.onCover) }
            Text(stringResource(R.string.tach_title), color = c.onCover, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight(700)), modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            IconButton({ torch = !torch; camera?.cameraControl?.enableTorch(torch) }, Modifier.semantics { contentDescription = resources.getString(R.string.scan_torch) }) {
                Icon(LucideIcons.Zap, null, tint = if (torch) c.highlight else c.onCover)
            }
        }
        Box(Modifier.weight(1f).fillMaxWidth().onSizeChanged { s: IntSize -> viewSize[0] = s.width; viewSize[1] = s.height }) {
            AndroidView(factory = { ctx ->
                PreviewView(ctx).apply {
                    scaleType = PreviewView.ScaleType.FILL_CENTER
                    val f = ProcessCameraProvider.getInstance(ctx)
                    f.addListener({
                        runCatching {
                            val provider = f.get()
                            val preview = Preview.Builder().build().also { it.surfaceProvider = surfaceProvider }
                            provider.unbindAll()
                            camera = provider.bindToLifecycle(lifecycle, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
                        }.onFailure { onType() }
                    }, ContextCompat.getMainExecutor(ctx))
                }
            }, modifier = Modifier.fillMaxSize())
            Canvas(Modifier.fillMaxSize()) {
                drawRoundRect(c.onCover, Offset((size.width - guide.width) / 2, (size.height - guide.height) / 2), guide, CornerRadius(8.dp.toPx()), style = Stroke(2.dp.toPx()))
            }
            Column(Modifier.align(Alignment.BottomCenter).padding(bottom = Tokens.Space.s6), horizontalAlignment = Alignment.CenterHorizontally) {
                found?.let {
                    Text(fmtHours(it), color = c.onCover, fontSize = 34.sp, fontWeight = FontWeight(700), modifier = Modifier.clip(RoundedCornerShape(36.dp)).background(c.cover2).padding(horizontal = Tokens.Space.s5, vertical = Tokens.Space.s2))
                }
                Text(
                    when {
                        found != null -> stringResource(R.string.tach_found, last.value?.let(::fmtHours) ?: "–")
                        slow -> stringResource(R.string.tach_slow)
                        else -> stringResource(R.string.tach_looking)
                    },
                    color = c.onCover, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(Tokens.Space.s3),
                )
            }
        }
        Row(Modifier.fillMaxWidth().height(96.dp).padding(horizontal = Tokens.Space.s4), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) {
                TextButton(onType, Modifier.heightIn(min = 48.dp).then(if (slow) Modifier.border(2.dp, c.onCover, RoundedCornerShape(Tokens.Radius.m)) else Modifier)) {
                    Icon(LucideIcons.Keyboard, null, tint = c.onCover, modifier = Modifier.size(18.dp))
                    Text(" " + stringResource(R.string.tach_type_it), color = c.onCover, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight(700)))
                }
            }
            Box(
                Modifier.size(72.dp).clip(CircleShape).background(c.onCover).border(4.dp, c.cover2, CircleShape)
                    .clickable(role = Role.Button) { stillRead.set(true) }
                    .semantics { contentDescription = resources.getString(R.string.tach_still) },
            )
            Box(Modifier.weight(1f))
        }
    }
}

/** The part of the upright frame under the guide, for a preview that centre-crops the frame into the view. */
fun guideCrop(b: Bitmap, viewW: Int, viewH: Int, guideW: Float, guideH: Float): Bitmap {
    val r = guideRect(b.width, b.height, viewW, viewH, guideW, guideH)
    return Bitmap.createBitmap(b, r[0], r[1], r[2], r[3])
}

/** (x, y, w, h) in frame pixels of a centred guide of [guideW]×[guideH] view pixels, padded 10% for a shaky hand. */
fun guideRect(frameW: Int, frameH: Int, viewW: Int, viewH: Int, guideW: Float, guideH: Float): IntArray {
    val k = max(viewW.toFloat() / frameW, viewH.toFloat() / frameH)
    val w = (guideW * 1.2f / k).roundToInt().coerceIn(1, frameW)
    val h = (guideH * 1.2f / k).roundToInt().coerceIn(1, frameH)
    return intArrayOf((frameW - w) / 2, (frameH - h) / 2, w, h)
}

/** "Flight, tach 4212.4 to 4214.8" (06 M-SYS-01 waiting row). */
fun flightLabel(last: Double?, now: Double) = if (last != null) "Flight, tach ${fmtHours(last)} to ${fmtHours(now)}" else "Reading, tach ${fmtHours(now)}"

/** M-FLIGHT-04's first line: "Flight saved. Logged 2.4 h, tach 4214.8." */
fun savedLine(now: Double, last: Double?) =
    if (last != null && now >= last) "Flight saved. Logged ${fmtHours(now - last)} h, tach ${fmtHours(now)}." else "Reading saved. Tach ${fmtHours(now)}."

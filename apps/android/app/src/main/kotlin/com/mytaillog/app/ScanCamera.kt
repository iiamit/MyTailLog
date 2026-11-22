package com.mytaillog.app

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.mytaillog.design.ButtonKind
import com.mytaillog.design.DButton
import com.mytaillog.design.LucideIcons
import com.mytaillog.design.MyTailLogTheme
import com.mytaillog.design.Tokens
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Year
import java.util.concurrent.Executors
import kotlin.math.max
import kotlin.math.sqrt

/** One page taken in this session: its file job, page id and thumbnail. */
private class Taken(val jobId: String, val pageId: String, val thumb: ImageBitmap?)

/** True when the system asks for less motion (animator duration scale 0). */
fun reduceMotion(context: Context) = Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f

/**
 * M-SCAN-02: the page camera. CameraX preview, capture at full quality and 640px analysis frames for
 * [PageFinder]; auto-capture when steady ([SteadyShot] plus the gyroscope); every page is flattened,
 * written to the outbox and recorded before the next capture is accepted. Works offline.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScanCameraScreen(host: CaptureHost, target: ScanTarget, onDone: () -> Unit, onCancel: () -> Unit, onSystemScanner: () -> Unit, onPhotos: () -> Unit) {
    val context = LocalContext.current
    val c = MyTailLogTheme.colors
    val store = host.store
    val batchId = rememberSaveable { store.newBatchId() }
    var granted by remember { mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    var asked by rememberSaveable { mutableStateOf(false) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted = it; asked = true }
    LaunchedEffect(Unit) { if (!granted) permission.launch(Manifest.permission.CAMERA) }

    val taken = remember { mutableStateListOf<Taken>() }
    var confirmingCancel by remember { mutableStateOf(false) }
    var strip by remember { mutableStateOf(false) }
    var fiftyAsked by rememberSaveable { mutableStateOf(false) }

    fun finish() {
        if (taken.isEmpty()) return onCancel()
        store.finishSession(batchId)
        host.kick()
        onDone()
    }
    fun cancel() = if (taken.isEmpty()) onCancel() else confirmingCancel = true
    BackHandler { cancel() }

    Box(Modifier.fillMaxSize().background(c.cover)) {
        when {
            granted -> CameraBody(host, target, batchId, taken, ::cancel, ::finish, onOpenStrip = { strip = true }, onFailed = onSystemScanner)
            asked -> CameraDenied(onPhotos, onCancel)
        }
    }

    if (taken.size >= 50 && !fiftyAsked) {
        AlertDialog(
            onDismissRequest = { fiftyAsked = true },
            text = { Text(stringResource(R.string.scan_fifty)) },
            confirmButton = { TextButton({ fiftyAsked = true; finish() }) { Text(stringResource(R.string.scan_upload_these), color = c.ink) } },
            dismissButton = { TextButton({ fiftyAsked = true }) { Text(stringResource(R.string.scan_continue), color = c.ink) } },
            containerColor = c.leaf, textContentColor = c.ink,
        )
    }
    if (confirmingCancel) {
        AlertDialog(
            onDismissRequest = { confirmingCancel = false },
            title = { Text(stringResource(R.string.scan_keep_title, taken.size)) },
            confirmButton = { TextButton({ confirmingCancel = false; finish() }) { Text(stringResource(R.string.scan_keep_them), color = c.ink, fontWeight = FontWeight(700)) } },
            dismissButton = {
                TextButton({
                    confirmingCancel = false
                    taken.forEach { store.discardPage(it.jobId) }
                    onCancel()
                }) { Text(stringResource(R.string.scan_delete_them), color = c.alarmText) }
            },
            containerColor = c.leaf, titleContentColor = c.ink,
        )
    }
    if (strip) {
        ModalBottomSheet(onDismissRequest = { strip = false }, containerColor = c.leaf) {
            LazyRow(Modifier.padding(Tokens.Space.s4), horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s3)) {
                items(taken.toList(), key = { it.jobId }) { t ->
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        t.thumb?.let { Image(it, null, Modifier.size(84.dp, 110.dp).clip(RoundedCornerShape(3.dp)), contentScale = ContentScale.Crop) }
                        TextButton({ store.discardPage(t.jobId); taken.remove(t) }) { Text(stringResource(R.string.scan_delete_page), color = c.alarmText) }
                    }
                }
            }
        }
    }
}

@Composable
private fun CameraDenied(onPhotos: () -> Unit, onCancel: () -> Unit) {
    val context = LocalContext.current
    val c = MyTailLogTheme.colors
    Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing).padding(Tokens.Space.s6), verticalArrangement = Arrangement.spacedBy(Tokens.Space.s4, Alignment.CenterVertically)) {
        Text(stringResource(R.string.scan_camera_denied), color = c.onCover, style = MaterialTheme.typography.titleLarge)
        DButton(stringResource(R.string.open_settings), {
            context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null)))
        }, kind = ButtonKind.Secondary)
        DButton(stringResource(R.string.scan_photos_instead), onPhotos, kind = ButtonKind.Secondary)
        TextButton(onCancel) { Text(stringResource(R.string.cancel), color = c.onCover) }
    }
}

@Composable
private fun CameraBody(
    host: CaptureHost,
    target: ScanTarget,
    batchId: String,
    taken: MutableList<Taken>,
    onCancel: () -> Unit,
    onDone: () -> Unit,
    onOpenStrip: () -> Unit,
    onFailed: () -> Unit,
) {
    val context = LocalContext.current
    val resources = LocalResources.current
    val lifecycle = LocalLifecycleOwner.current
    val view = LocalView.current
    val haptics = LocalHapticFeedback.current
    val scope = rememberCoroutineScope()
    val c = MyTailLogTheme.colors
    val reduced = remember { reduceMotion(context) }
    val store = host.store

    var finding by remember { mutableStateOf(Finding(null, PageHint.Looking)) }
    var frameAspect by remember { mutableStateOf(3f / 4f) } // upright width / height
    var torch by remember { mutableStateOf(false) }
    var camera by remember { mutableStateOf<Camera?>(null) }
    var busy by remember { mutableStateOf(false) }
    var flash by remember { mutableIntStateOf(0) }
    var landsIn by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val lowStorage = remember { context.filesDir.usableSpace < 200L * 1024 * 1024 }

    val capture = remember {
        ImageCapture.Builder()
            .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
            .setResolutionSelector(ResolutionSelector.Builder().setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY).build())
            .build()
    }
    val worker = remember { Executors.newSingleThreadExecutor() }
    val recognizer = remember { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }
    DisposableEffect(Unit) { onDispose { worker.shutdown(); recognizer.close() } }

    // The phone is still when the gyroscope reads under 0.25 rad/s (05 §15.1); no gyroscope, assume still.
    val still = remember { booleanArrayOf(true) }
    DisposableEffect(Unit) {
        val sm = context.getSystemService(SensorManager::class.java)
        val gyro = sm?.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
        val listener = object : SensorEventListener {
            override fun onSensorChanged(e: SensorEvent) { still[0] = sqrt(e.values[0] * e.values[0] + e.values[1] * e.values[1] + e.values[2] * e.values[2]) < 0.25f }
            override fun onAccuracyChanged(s: Sensor?, a: Int) {}
        }
        if (gyro != null) sm.registerListener(listener, gyro, SensorManager.SENSOR_DELAY_UI)
        onDispose { sm?.unregisterListener(listener) }
    }

    fun take(quad: Quad?) {
        if (busy) return // each page is on disk before the next capture is accepted
        busy = true
        capture.takePicture(worker, object : ImageCapture.OnImageCapturedCallback() {
            override fun onCaptureSuccess(image: ImageProxy) {
                val rotation = image.imageInfo.rotationDegrees
                val raw = try { image.toBitmap() } finally { image.close() }
                scope.launch {
                    try {
                        val page = withContext(Dispatchers.Default) {
                            PageImages.prepare(PageImages.flatten(PageImages.rotate(raw, rotation), quad))
                        }
                        val pageId = withContext(Dispatchers.IO) { store.addPage(target, batchId, page.jpeg, page.thumb, page.phash) }
                        taken += Taken(pageId.first, pageId.second, android.graphics.BitmapFactory.decodeByteArray(page.thumb, 0, page.thumb.size)?.asImageBitmap())
                        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                        flash++
                        view.announceForAccessibility(resources.getString(R.string.scan_page_taken, taken.size))
                        recognizer.process(InputImage.fromBitmap(page.flat, 0)).addOnSuccessListener { text ->
                            val year = PageDates.median(PageDates.years(text.text, Year.now().value)) ?: return@addOnSuccessListener
                            scope.launch {
                                val line = withContext(Dispatchers.IO) { PageDates.landsIn(year, target.book, store.gapYears(target.logbookId), store.pageYears(target.logbookId)) }
                                landsIn = line
                                view.announceForAccessibility(line)
                            }
                        }
                    } catch (e: Exception) {
                        error = resources.getString(R.string.scan_not_saved)
                    } finally {
                        busy = false
                    }
                }
            }

            override fun onError(e: ImageCaptureException) { busy = false; error = resources.getString(R.string.scan_not_saved) }
        })
    }

    val steady = remember { SteadyShot() }
    val analysis = remember {
        ImageAnalysis.Builder()
            .setResolutionSelector(ResolutionSelector.Builder().setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY).build())
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()
    }
    LaunchedEffect(analysis) {
        var lastHint: PageHint? = null
        analysis.setAnalyzer(worker) { img ->
            try {
                val y = img.planes[0]
                val (lum, w, h) = sampleLuma(y.buffer, y.rowStride, y.pixelStride, img.width, img.height, max(1, img.width / 160))
                val f = PageFinder.find(lum, w, h)
                val rot = img.imageInfo.rotationDegrees
                val upright = Finding(f.quad?.rotated(rot), f.hint)
                val aspect = if (rot % 180 == 0) img.width.toFloat() / img.height else img.height.toFloat() / img.width
                val fire = steady.update(upright.quad, still[0], System.currentTimeMillis())
                view.post {
                    frameAspect = aspect
                    finding = upright
                    if (upright.hint == PageHint.HoldStill && lastHint != PageHint.HoldStill) view.announceForAccessibility(resources.getString(R.string.scan_page_found))
                    lastHint = upright.hint
                    if (fire) take(upright.quad)
                }
            } finally {
                img.close()
            }
        }
    }

    Column(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing)) {
        // Top bar: Cancel · "Airframe · 5 taken"
        Row(Modifier.fillMaxWidth().height(56.dp).padding(horizontal = Tokens.Space.s2), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onCancel, Modifier.semantics { contentDescription = resources.getString(R.string.cancel) }) { Icon(LucideIcons.X, null, tint = c.onCover) }
            Text(
                stringResource(R.string.scan_camera_title, target.book, taken.size),
                color = c.onCover, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight(700)),
                modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            )
            IconButton({ torch = !torch; camera?.cameraControl?.enableTorch(torch) }, Modifier.semantics { contentDescription = resources.getString(R.string.scan_torch) }) {
                Icon(LucideIcons.Zap, null, tint = if (torch) c.highlight else c.onCover)
            }
        }
        landsIn?.let { Pill(it, LucideIcons.Route, Modifier.align(Alignment.CenterHorizontally).padding(bottom = Tokens.Space.s2)) }
        if (lowStorage) Text(stringResource(R.string.scan_low_storage), color = c.onCover, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(horizontal = Tokens.Space.s4))
        Box(Modifier.weight(1f).fillMaxWidth()) {
            AndroidView(
                factory = { ctx ->
                    PreviewView(ctx).apply {
                        scaleType = PreviewView.ScaleType.FILL_CENTER
                        val providerFuture = ProcessCameraProvider.getInstance(ctx)
                        providerFuture.addListener({
                            try {
                                val provider = providerFuture.get()
                                val preview = Preview.Builder()
                                    .setResolutionSelector(ResolutionSelector.Builder().setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY).build())
                                    .build().also { it.surfaceProvider = surfaceProvider }
                                provider.unbindAll()
                                camera = provider.bindToLifecycle(lifecycle, CameraSelector.DEFAULT_BACK_CAMERA, preview, capture, analysis)
                            } catch (e: Exception) {
                                onFailed() // the custom camera can't start: the system scanner instead (05 §15.2)
                            }
                        }, ContextCompat.getMainExecutor(ctx))
                    }
                },
                modifier = Modifier.fillMaxSize(),
            )
            Outline(finding.quad, frameAspect, flash, reduced)
            Pill(
                stringResource(when (finding.hint) {
                    PageHint.HoldStill -> R.string.scan_hint_hold
                    PageHint.MoveBack -> R.string.scan_hint_back
                    PageHint.MoreLight -> R.string.scan_hint_light
                    PageHint.Looking -> R.string.scan_hint_looking
                }),
                LucideIcons.ScanLine,
                Modifier.align(Alignment.BottomCenter).padding(bottom = Tokens.Space.s4),
            )
            error?.let { Text(it, color = c.onAlarmBg, modifier = Modifier.align(Alignment.TopCenter).background(c.alarmBg).padding(Tokens.Space.s2).clickable { error = null }) }
        }
        // Bottom bar: last page with count · shutter · Done
        Row(Modifier.fillMaxWidth().height(120.dp).padding(horizontal = Tokens.Space.s4), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) {
                taken.lastOrNull()?.let { t ->
                    Box(
                        Modifier.size(56.dp, 74.dp).clickable(role = Role.Button, onClick = onOpenStrip)
                            .semantics { contentDescription = resources.getString(R.string.scan_review_strip, taken.size) },
                    ) {
                        t.thumb?.let { Image(it, null, Modifier.fillMaxSize().clip(RoundedCornerShape(3.dp)), contentScale = ContentScale.Crop) }
                        Text(
                            "${taken.size}", color = c.leaf, style = MaterialTheme.typography.labelLarge,
                            modifier = Modifier.align(Alignment.TopEnd).background(c.ink, CircleShape).padding(horizontal = 6.dp),
                        )
                    }
                }
            }
            Box(
                Modifier.size(72.dp).clip(CircleShape).background(c.onCover).border(4.dp, c.cover2, CircleShape)
                    .clickable(enabled = !busy, role = Role.Button) { take(finding.quad) }
                    .semantics { contentDescription = resources.getString(R.string.scan_shutter) },
            )
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterEnd) {
                TextButton(onDone, Modifier.heightIn(min = 44.dp).semantics { contentDescription = resources.getString(R.string.scan_done_spoken, taken.size) }) {
                    Text(stringResource(R.string.done), color = c.onCover, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight(700)))
                }
            }
        }
    }
}

/** The detected page drawn 3dp on-cover with a 40% cover tint outside it; a flash (or, with less motion, a pulse) on capture. */
@Composable
private fun Outline(quad: Quad?, frameAspect: Float, flash: Int, reduced: Boolean) {
    val c = MyTailLogTheme.colors
    var flashing by remember { mutableStateOf(false) }
    LaunchedEffect(flash) { if (flash > 0) { flashing = true; kotlinx.coroutines.delay(120); flashing = false } }
    Canvas(Modifier.fillMaxSize()) {
        // The preview fills the view, centre-cropped: map frame fractions to view pixels the same way.
        val k = max(size.width / frameAspect, size.height)
        val fw = k * frameAspect; val fh = k
        val ox = (size.width - fw) / 2; val oy = (size.height - fh) / 2
        if (quad != null) {
            val pts = quad.corners.map { Offset(ox + it.x * fw, oy + it.y * fh) }
            val page = Path().apply { moveTo(pts[0].x, pts[0].y); pts.drop(1).forEach { lineTo(it.x, it.y) }; close() }
            val outside = Path().apply {
                fillType = PathFillType.EvenOdd
                addRect(androidx.compose.ui.geometry.Rect(0f, 0f, size.width, size.height))
                addPath(page)
            }
            drawPath(outside, c.cover.copy(alpha = 0.4f))
            drawPath(page, c.onCover, style = Stroke(if (flashing && reduced) 6.dp.toPx() else 3.dp.toPx()))
        }
        if (flashing && !reduced) drawRect(Color.White.copy(alpha = 0.7f))
    }
}

@Composable
private fun Pill(text: String, icon: androidx.compose.ui.graphics.vector.ImageVector, modifier: Modifier = Modifier) {
    val c = MyTailLogTheme.colors
    Row(
        modifier.heightIn(min = 36.dp).clip(RoundedCornerShape(18.dp)).background(c.cover2).padding(horizontal = Tokens.Space.s3),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s2),
    ) {
        Icon(icon, null, tint = c.onCover, modifier = Modifier.size(16.dp))
        Text(text, color = c.onCover, style = MaterialTheme.typography.bodyMedium)
    }
}

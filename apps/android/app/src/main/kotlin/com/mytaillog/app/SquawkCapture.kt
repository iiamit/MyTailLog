package com.mytaillog.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.net.Uri
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.mytaillog.design.DButton
import com.mytaillog.design.LucideIcons
import com.mytaillog.design.MyTailLogTheme
import com.mytaillog.design.Section
import com.mytaillog.design.Tokens
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.time.Instant
import java.util.concurrent.Executors

// M-MAINT-03 New squawk: a photo first (skippable), then words, then a plain severity. Works offline:
// squawk.create, then per photo a file job and squawkPhoto.create waiting on it (C-SQ-02).

const val MAX_SQUAWK_PHOTOS = 4

fun squawkPhotoFile(store: OfflineStore, photoId: String) = File(store.dir, "squawk_photos/$photoId.jpg")

/** Keep the photo on this phone and queue its row behind the upload. */
fun addSquawkPhoto(recs: Recs, squawkId: String, jpeg: ByteArray) {
    val photoId = newId()
    val job = recs.store.addFile(OfflineStore.SQUAWK_PHOTO, recs.id, squawkPhotoFile(recs.store, photoId), jpeg, json("squawkId" to squawkId, "photoId" to photoId))
    recs.change("squawkPhoto.create", "squawk_photo", photoId, "Squawk photo", json("id" to photoId, "squawkId" to squawkId, "blobId" to photoId, "takenAt" to Instant.now().toString()), dependsOn = job)
}

/** The system photo picker (no storage permission), decoded upright and re-encoded as squawk photos. */
@Composable
fun rememberPhotoPicker(max: Int, onPicked: (List<ByteArray>) -> Unit): () -> Unit {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(max.coerceAtLeast(2))) { uris: List<Uri> ->
        scope.launch {
            val out = withContext(Dispatchers.Default) { uris.take(max).mapNotNull { u -> PageImages.decode(context, u)?.let(PageImages::photo) } }
            onPicked(out)
        }
    }
    return { launcher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
}

/** Photos in a strip; those still on this phone show, the others as a tile; a dashed **Add a photo** tile when allowed. */
@Composable
fun PhotoStrip(recs: Recs, photoIds: List<String>, onAdd: (() -> Unit)?, height: Int = 120) {
    val c = MyTailLogTheme.colors
    val addLabel = stringResource(R.string.maint_add_photo)
    if (photoIds.isEmpty() && onAdd == null) return
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(vertical = Tokens.Space.s2), horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s2)) {
        photoIds.forEach { pid ->
            val bmp = remember(pid) { squawkPhotoFile(recs.store, pid).takeIf { it.exists() }?.let { BitmapFactory.decodeFile(it.path, BitmapFactory.Options().apply { inSampleSize = 4 })?.asImageBitmap() } }
            Thumb(bmp, height, stringResource(R.string.maint_photo))
        }
        onAdd?.let {
            Box(
                Modifier.height(height.dp).width((height * 4 / 3).dp).clip(RoundedCornerShape(Tokens.Radius.m)).border(1.dp, c.controlBorder, RoundedCornerShape(Tokens.Radius.m))
                    .clickable(role = Role.Button, onClick = it).semantics { contentDescription = addLabel },
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(LucideIcons.Camera, null, tint = c.ink, modifier = Modifier.size(22.dp))
                    Note(stringResource(R.string.maint_add_photo))
                }
            }
        }
    }
}

@Composable
private fun Thumb(bmp: ImageBitmap?, height: Int, spoken: String) {
    val c = MyTailLogTheme.colors
    Box(Modifier.height(height.dp).width((height * 4 / 3).dp).clip(RoundedCornerShape(Tokens.Radius.m)).background(c.leaf2).semantics { contentDescription = spoken }, contentAlignment = Alignment.Center) {
        if (bmp != null) Image(bmp, null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        else Icon(LucideIcons.Image, null, tint = c.ink3, modifier = Modifier.size(22.dp))
    }
}

/** The full-screen cover: camera, then words (06 M-MAINT-03). */
@Composable
fun NewSquawk(recs: Recs, onClose: () -> Unit) {
    val context = LocalContext.current
    val photos = remember { mutableStateListOf<ByteArray>() }
    var words by rememberSaveable { mutableStateOf(false) }
    var granted by remember { mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    var denied by rememberSaveable { mutableStateOf(false) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted = it; denied = !it }
    LaunchedEffect(Unit) { if (!granted) permission.launch(Manifest.permission.CAMERA) }
    val library = rememberPhotoPicker(MAX_SQUAWK_PHOTOS) { photos.addAll(it.take(MAX_SQUAWK_PHOTOS - photos.size)); if (photos.isNotEmpty()) words = true }
    if (words) {
        SquawkWords(recs, photos, onBack = { words = false }, onClose = onClose, onAddPhoto = library)
        return
    }
    BackHandler(onBack = onClose)
    val c = MyTailLogTheme.colors
    Column(Modifier.fillMaxSize().background(c.cover).windowInsetsPadding(WindowInsets.safeDrawing)) {
        Row(Modifier.fillMaxWidth().height(56.dp).padding(horizontal = Tokens.Space.s2), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClose, Modifier.size(48.dp)) { Icon(LucideIcons.X, stringResource(R.string.cancel), tint = c.onCover) }
            Text(stringResource(R.string.maint_new_squawk), color = c.onCover, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f).padding(start = Tokens.Space.s2))
        }
        Text(stringResource(R.string.maint_photo_first), color = c.onCover, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(horizontal = Tokens.Space.s4))
        Box(Modifier.weight(1f).fillMaxWidth().padding(vertical = Tokens.Space.s2)) {
            if (granted) SquawkCamera(enabled = photos.size < MAX_SQUAWK_PHOTOS) { photos += it }
            else Column(Modifier.align(Alignment.Center).padding(Tokens.Space.s4), verticalArrangement = Arrangement.spacedBy(Tokens.Space.s3)) {
                Text(stringResource(R.string.maint_camera_denied), color = c.onCover, style = MaterialTheme.typography.bodyLarge)
                if (denied) DButton(stringResource(R.string.open_settings), {
                    context.startActivity(Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null)))
                })
            }
        }
        if (photos.isNotEmpty()) Row(Modifier.fillMaxWidth().padding(horizontal = Tokens.Space.s4), horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s2), verticalAlignment = Alignment.CenterVertically) {
            photos.forEach { b -> Thumb(remember(b) { BitmapFactory.decodeByteArray(b, 0, b.size, BitmapFactory.Options().apply { inSampleSize = 8 })?.asImageBitmap() }, 48, stringResource(R.string.maint_photo)) }
            Text("${photos.size} / $MAX_SQUAWK_PHOTOS", color = c.onCover, style = MaterialTheme.typography.bodyMedium)
        }
        Row(Modifier.fillMaxWidth().height(96.dp).padding(horizontal = Tokens.Space.s4), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { CoverButton(LucideIcons.Image, stringResource(R.string.maint_library), library) }
            Box(Modifier.size(72.dp))
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterEnd) {
                if (photos.isEmpty()) CoverButton(LucideIcons.Pencil, stringResource(R.string.maint_skip_photo)) { words = true }
                else CoverButton(LucideIcons.ChevronRight, stringResource(R.string.maint_next)) { words = true }
            }
        }
    }
}

@Composable
private fun CoverButton(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    val c = MyTailLogTheme.colors
    TextButton(onClick, Modifier.heightIn(min = 48.dp)) {
        Icon(icon, null, tint = c.onCover, modifier = Modifier.size(18.dp))
        Text(" $label", color = c.onCover, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight(700)))
    }
}

/** CameraX preview with a 72dp shutter ("Take photo") over it. */
@Composable
private fun SquawkCamera(enabled: Boolean, onPhoto: (ByteArray) -> Unit) {
    val c = MyTailLogTheme.colors
    val lifecycle = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    val capture = remember { ImageCapture.Builder().setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY).build() }
    val worker = remember { Executors.newSingleThreadExecutor() }
    DisposableEffect(Unit) { onDispose { worker.shutdown() } }
    var busy by remember { mutableStateOf(false) }
    val shutter = stringResource(R.string.maint_take_photo)
    Box(Modifier.fillMaxSize()) {
        AndroidView(factory = { ctx ->
            PreviewView(ctx).apply {
                scaleType = PreviewView.ScaleType.FILL_CENTER
                val f = ProcessCameraProvider.getInstance(ctx)
                f.addListener({
                    runCatching {
                        val provider = f.get()
                        val preview = Preview.Builder().build().also { it.surfaceProvider = surfaceProvider }
                        provider.unbindAll()
                        provider.bindToLifecycle(lifecycle, CameraSelector.DEFAULT_BACK_CAMERA, preview, capture)
                    }
                }, ContextCompat.getMainExecutor(ctx))
            }
        }, modifier = Modifier.fillMaxSize())
        Box(
            Modifier.align(Alignment.BottomCenter).padding(bottom = Tokens.Space.s4).size(72.dp).clip(CircleShape).background(if (enabled && !busy) c.onCover else c.onCover2)
                .border(4.dp, c.cover2, CircleShape)
                .clickable(enabled = enabled && !busy, role = Role.Button) {
                    busy = true
                    capture.takePicture(worker, object : ImageCapture.OnImageCapturedCallback() {
                        override fun onCaptureSuccess(image: ImageProxy) {
                            val rotation = image.imageInfo.rotationDegrees
                            val raw = try { image.toBitmap() } finally { image.close() }
                            val jpeg = PageImages.photo(PageImages.rotate(raw, rotation))
                            scope.launch { onPhoto(jpeg); busy = false }
                        }
                        override fun onError(e: ImageCaptureException) { scope.launch { busy = false } }
                    })
                }
                .semantics { contentDescription = shutter },
        )
    }
}

/** Step 2: the words (typed or dictated) and the severity; **Add squawk** once there is text or a photo and a severity. */
@Composable
private fun SquawkWords(recs: Recs, photos: MutableList<ByteArray>, onBack: () -> Unit, onClose: () -> Unit, onAddPhoto: () -> Unit) {
    val context = LocalContext.current
    var text by rememberSaveable { mutableStateOf("") }
    var severity by rememberSaveable { mutableStateOf<Int?>(null) }
    var asking by remember { mutableStateOf(false) }
    val canSpeak = remember { SpeechRecognizer.isRecognitionAvailable(context) }
    val speech = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        r.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()?.let { said -> text = listOf(text.trim(), said).filter { it.isNotEmpty() }.joinToString(" ") }
    }
    val dirty = text.isNotBlank() || photos.isNotEmpty()
    val addLabel = stringResource(R.string.maint_add_photo)
    BackHandler { if (dirty) asking = true else onBack() }
    val c = MyTailLogTheme.colors
    Board(
        stringResource(R.string.maint_new_squawk), Section.Maint, back = stringResource(R.string.maint_photo_back) to onBack,
        footer = {
            DButton(stringResource(R.string.maint_add_squawk), {
                val id = newId()
                recs.change("squawk.create", "squawk", id, "Squawk: ${text.trim().ifEmpty { "photo" }.take(40)}", json(
                    "id" to id, "description" to text.trim().ifEmpty { recs.str(R.string.maint_see_photo) }, "severity" to SEVERITIES[severity!!], "reportedAt" to Instant.now().toString(),
                ))
                photos.forEach { addSquawkPhoto(recs, id, it) }
                recs.toast = Toast(recs.str(R.string.maint_squawk_added).format(recs.tail) + if (recs.online) "" else " " + recs.str(R.string.rec_saved_on_phone))
                onClose()
            }, enabled = (text.isNotBlank() || photos.isNotEmpty()) && severity != null)
        },
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) {
                Row(horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s2)) {
                    photos.forEach { b -> Thumb(remember(b) { BitmapFactory.decodeByteArray(b, 0, b.size, BitmapFactory.Options().apply { inSampleSize = 8 })?.asImageBitmap() }, 70, stringResource(R.string.maint_photo)) }
                    if (photos.size < MAX_SQUAWK_PHOTOS) Box(
                        Modifier.height(70.dp).width(70.dp).clip(RoundedCornerShape(Tokens.Radius.m)).border(1.dp, c.controlBorder, RoundedCornerShape(Tokens.Radius.m))
                            .clickable(role = Role.Button, onClick = onAddPhoto).semantics { contentDescription = addLabel },
                        contentAlignment = Alignment.Center,
                    ) { Icon(LucideIcons.Camera, null, tint = c.ink) }
                }
            }
            Text(recs.tail, color = c.ink, style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight(700)), modifier = Modifier.border(1.dp, c.ink, RoundedCornerShape(Tokens.Radius.s)).padding(horizontal = 6.dp, vertical = 2.dp))
        }
        Field(stringResource(R.string.maint_what_noticed), text, { text = it }, lines = 4, placeholder = stringResource(R.string.maint_what_noticed_hint))
        if (canSpeak) Row(
            Modifier.fillMaxWidth().heightIn(min = 44.dp).clickable(role = Role.Button) {
                runCatching {
                    speech.launch(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM).putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true))
                }
            },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(44.dp).clip(CircleShape).background(c.sectionMaint), contentAlignment = Alignment.Center) { Icon(LucideIcons.Mic, null, tint = c.leaf) }
            Text("  " + stringResource(R.string.maint_tap_to_speak), color = c.ink, style = MaterialTheme.typography.bodyLarge)
        }
        Note(stringResource(R.string.maint_how_serious), Modifier.padding(top = Tokens.Space.s3))
        RadioRows(severityOptions(), severity) { severity = it }
    }
    if (asking) Confirm(stringResource(R.string.maint_discard_squawk), null, stringResource(R.string.rec_discard), onClose, { asking = false }, keep = stringResource(R.string.rec_keep_editing))
}

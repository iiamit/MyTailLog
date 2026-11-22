package com.mytaillog.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import com.mytaillog.design.ButtonKind
import com.mytaillog.design.DButton
import com.mytaillog.design.GroupHeader
import com.mytaillog.design.LucideIcons
import com.mytaillog.design.MyTailLogTheme
import com.mytaillog.design.PageCite
import com.mytaillog.design.Section
import com.mytaillog.design.Tokens
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

// 06 §8 Documents (M-DOCS-01..03): the vault with the carry-aboard four first. Adding works offline
// (a file job of kind document, uploaded by the sync run); metadata edits go through the outbox.

const val MAX_DOC_BYTES = 25L * 1024 * 1024

/** A document waiting on this phone (not uploaded yet): its job id and what the add sheet said. */
data class HeldDoc(val jobId: String, val type: String, val title: String, val failed: String?)

fun heldDocs(store: OfflineStore, aircraftId: String): List<HeldDoc> = store.recordFiles().filter { it.kind == OfflineStore.DOCUMENT && it.aircraft_id == aircraftId }.map {
    val m = kotlinx.serialization.json.Json.parseToJsonElement(it.meta) as kotlinx.serialization.json.JsonObject
    HeldDoc(it.id, m.s("type") ?: "other", m.s("title") ?: m.s("fileName") ?: "Document", it.error)
}

/** The offline copy of a document, when this phone has it. */
fun localDoc(store: OfflineStore, d: Rec): File? = store.docFile(d.id, d.s("file_name")).takeIf { it.exists() }

/** M-DOCS-01 Documents and carry-aboard. */
@Composable
fun DocumentsScreen(recs: Recs, back: Pair<String, () -> Unit>?) {
    val nav = LocalRecNav.current
    val docs = recs.watch { recs.store.records("document", recs.id) }
    val held = recs.watch { heldDocs(recs.store, recs.id) }
    val sync by recs.store.sync.collectAsStateWithLifecycleCompat()
    var q by rememberSaveable { mutableStateOf("") }
    var adding by remember { mutableStateOf<String?>(null) } // the type to start with, "" for none
    var deleting by remember { mutableStateOf<Rec?>(null) }
    // The carry-aboard four open offline once added (C-DOCS-02): fetch their files while there is signal.
    LaunchedEffect(sync.online, docs.size) {
        if (!sync.online) return@LaunchedEffect
        docs.filter { it.s("type") in CARRY_ABOARD && localDoc(recs.store, it) == null && !it.pending }.forEach { d ->
            runCatching { val bytes = recs.api.documentFile(d.id); withContext(Dispatchers.IO) { OfflineStore.writeAtomically(recs.store.docFile(d.id, d.s("file_name")), bytes) } }
        }
    }
    Board(stringResource(R.string.section_docs), Section.Docs, back = back, toast = recs.toast, onToastDone = { recs.toast = null }, footer = if (!recs.canEdit) null else ({
        DButton(stringResource(R.string.docs_add), { adding = "" }, icon = LucideIcons.FilePlus2)
    })) {
        if (docs.isEmpty() && held.isEmpty()) {
            Empty(stringResource(R.string.docs_empty))
        }
        Field(stringResource(R.string.rec_search), q, { q = it })
        if (held.isNotEmpty()) Well {
            Lede(pluralsText(held.size, stringResource(R.string.docs_held_one), stringResource(R.string.docs_held_many, held.size)))
            held.forEach { h -> Note("${docTypeName(h.type)} · ${h.title}" + (h.failed?.let { " · $it" } ?: ""), alarm = h.failed != null) }
        }
        val match: (Rec) -> Boolean = { d -> q.isBlank() || listOfNotNull(d.s("title"), docTypeName(d.s("type")), d.s("reference"), d.s("file_name")).any { it.contains(q, ignoreCase = true) } }
        val missing = CARRY_ABOARD.count { t -> docs.none { it.s("type") == t } }
        GroupHeader(stringResource(R.string.docs_carry), count = if (missing == 0) stringResource(R.string.docs_all_here) else "$missing missing")
        CARRY_ABOARD.forEach { t ->
            val d = docs.filter { it.s("type") == t }.maxByOrNull { it.s("document_date") ?: it.s("created_at") ?: "" }
            if (d == null) RecRow(docTypeName(t), listOf(stringResource(R.string.docs_not_yet)), below = {
                if (recs.canEdit) DButton(stringResource(R.string.docs_add_it), { adding = t }, kind = ButtonKind.Secondary)
            })
            else if (match(d)) DocRow(recs, d, sync.online) { deleting = it }
        }
        val rest = docs.filter { it.s("type") !in CARRY_ABOARD || docs.filter { o -> o.s("type") == it.s("type") }.maxByOrNull { o -> o.s("document_date") ?: o.s("created_at") ?: "" } != it }.filter(match)
            .sortedByDescending { it.s("created_at") ?: "" }
        GroupHeader(stringResource(R.string.docs_everything_else), count = rest.size.toString())
        rest.forEach { DocRow(recs, it, sync.online) { d -> deleting = d } }
        ViewerLine(recs)
    }
    adding?.let { t -> AddDocSheet(recs, t.ifEmpty { null }) { adding = null } }
    deleting?.let { d -> RemoveDoc(recs, d, {}) { deleting = null } }
}

private fun pluralsText(n: Int, one: String, many: String) = if (n == 1) one else many

@Composable
private fun DocRow(recs: Recs, d: Rec, online: Boolean, onRemove: (Rec) -> Unit) {
    val nav = LocalRecNav.current
    val context = LocalContext.current
    val local = localDoc(recs.store, d)
    val expiry = d.s("expires_on")?.let { "Expires ${longDate(it)}" } ?: if (d.s("type") in EXPIRING || d.b("track_expiry")) stringResource(R.string.docs_no_expiry) else null
    RecRow(
        d.s("title") ?: docTypeName(d.s("type")),
        listOfNotNull(
            listOfNotNull(docTypeName(d.s("type")).takeIf { it != d.s("title") }, docMeta(d.s("mime_type"), d.s("created_at"))).joinToString(" · ").ifEmpty { null },
            d.s("log_entry_id")?.let { recs.entryLine(it)?.let { l -> "linked to $l" } },
            expiry,
            stringResource(R.string.docs_not_on_phone).takeIf { local == null && !online },
        ),
        d, onClick = { nav.open(Routes.of(Routes.DOC, d.id)) },
        menu = buildList {
            if (local != null) add(stringResource(R.string.rec_share) to { shareFile(context, local, d.s("mime_type"), d.s("file_name")) })
            if (recs.canEdit) add(stringResource(R.string.docs_remove) to { onRemove(d) })
        },
    )
}

@Composable
private fun RemoveDoc(recs: Recs, d: Rec, onRemoved: () -> Unit, onDone: () -> Unit) {
    Confirm(stringResource(R.string.docs_remove_title, d.s("title") ?: docTypeName(d.s("type"))), stringResource(R.string.docs_remove_body), stringResource(R.string.docs_remove), {
        recs.delete("document.delete", "document", d.id, "Remove ${d.s("title") ?: "document"}", json("documentId" to d.id))
        recs.store.docFile(d.id, d.s("file_name")).delete()
        onRemoved()
    }, onDone)
}

/** Copies the file under cache/share and opens the share sheet (the FileProvider only exposes that folder). */
fun shareFile(context: Context, f: File, mime: String?, name: String?) {
    val dir = File(context.cacheDir, "share").apply { mkdirs() }
    val out = File(dir, (name ?: f.name).replace(Regex("[^A-Za-z0-9._ -]"), "_"))
    f.copyTo(out, overwrite = true)
    val uri = FileProvider.getUriForFile(context, context.packageName + ".share", out)
    context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType(mime ?: "application/octet-stream").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION), null))
}

// --- Viewer (M-DOCS-02) ---------------------------------------------------------------------------------

@Composable
fun DocViewer(recs: Recs, id: String) {
    val nav = LocalRecNav.current
    val context = LocalContext.current
    val sync by recs.store.sync.collectAsStateWithLifecycleCompat()
    val d = recs.watch(id) { recs.store.records("document", recs.id).firstOrNull { it.id == id } }
    var details by remember { mutableStateOf(false) }
    var fetchFailed by remember { mutableStateOf<String?>(null) }
    var version by remember { mutableStateOf(0) }
    val back = stringResource(R.string.section_docs) to nav.back
    if (d == null) { Board(stringResource(R.string.section_docs), Section.Docs, back = back) { Empty(stringResource(R.string.rec_gone)) }; return }
    val file = remember(id, version) { localDoc(recs.store, d) }
    LaunchedEffect(id, sync.online, file) {
        if (file == null && sync.online && !d.pending) try {
            val bytes = recs.api.documentFile(id)
            withContext(Dispatchers.IO) { OfflineStore.writeAtomically(recs.store.docFile(id, d.s("file_name")), bytes) }
            version++
        } catch (e: CancellationException) { throw e } catch (e: Exception) { fetchFailed = e.message }
    }
    Board(d.s("title") ?: docTypeName(d.s("type")), Section.Docs, back = back, scroll = false, toast = recs.toast, onToastDone = { recs.toast = null }, footer = {
        Row(horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s2)) {
            DButton(stringResource(R.string.rec_share), { file?.let { shareFile(context, it, d.s("mime_type"), d.s("file_name")) } }, kind = ButtonKind.Secondary, enabled = file != null, modifier = Modifier.weight(1f))
            DButton(stringResource(R.string.docs_print), { file?.let { printPdf(context, it, d.s("title") ?: "Document") } }, kind = ButtonKind.Secondary, icon = LucideIcons.Printer,
                enabled = file != null && d.s("mime_type")?.contains("pdf") == true, modifier = Modifier.weight(1f))
            DButton(stringResource(R.string.docs_details), { details = true }, kind = ButtonKind.Secondary, enabled = recs.canEdit, modifier = Modifier.weight(1f))
        }
    }) {
        when {
            file == null && fetchFailed != null -> Empty(stringResource(R.string.docs_cant_open))
            file == null -> Empty(stringResource(R.string.docs_not_cached))
            d.s("mime_type")?.contains("pdf") == true -> PdfPages(file)
            else -> ZoomImage(file)
        }
    }
    if (details) DocDetailsSheet(recs, d) { details = false }
}

@Composable
private fun PdfPages(file: File) {
    val resources = LocalResources.current
    val pages by produceState<List<Bitmap>?>(null, file) {
        value = withContext(Dispatchers.IO) {
            runCatching {
                ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
                    PdfRenderer(fd).use { r ->
                        (0 until minOf(r.pageCount, 60)).map { i ->
                            r.openPage(i).use { p ->
                                val w = 1400
                                val bmp = Bitmap.createBitmap(w, (w.toFloat() * p.height / p.width).toInt().coerceAtLeast(1), Bitmap.Config.ARGB_8888)
                                bmp.eraseColor(android.graphics.Color.WHITE)
                                p.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY); bmp
                            }
                        }
                    }
                }
            }.getOrDefault(emptyList())
        }
    }
    val list = pages ?: return
    if (list.isEmpty()) { Empty(resources.getString(R.string.docs_cant_open)); return }
    val pager = rememberPagerState { list.size }
    Column(Modifier.fillMaxSize()) {
        Note("${pager.currentPage + 1} / ${list.size}")
        HorizontalPager(pager, Modifier.weight(1f).fillMaxWidth()) { i -> Zoomable { Image(list[i].asImageBitmap(), "Page ${i + 1} of ${list.size}", Modifier.fillMaxSize(), contentScale = ContentScale.Fit) } }
    }
}

@Composable
private fun ZoomImage(file: File) {
    val bmp = remember(file) { BitmapFactory.decodeFile(file.path)?.asImageBitmap() }
    if (bmp == null) { Empty(stringResource(R.string.docs_cant_open)); return }
    Zoomable { Image(bmp, null, Modifier.fillMaxSize(), contentScale = ContentScale.Fit) }
}

/** Pinch to zoom 1–5× (06 §1.7). */
@Composable
private fun Zoomable(content: @Composable () -> Unit) {
    var scale by remember { mutableFloatStateOf(1f) }
    var dx by remember { mutableFloatStateOf(0f) }
    var dy by remember { mutableFloatStateOf(0f) }
    Box(
        Modifier.fillMaxSize().pointerInput(Unit) {
            detectTransformGestures { _, pan, zoom, _ ->
                scale = (scale * zoom).coerceIn(1f, 5f)
                if (scale == 1f) { dx = 0f; dy = 0f } else { dx += pan.x; dy += pan.y }
            }
        }.graphicsLayer(scaleX = scale, scaleY = scale, translationX = dx, translationY = dy),
    ) { content() }
}

/** Print a PDF through the system print service (M-DOCS-02). */
fun printPdf(context: Context, f: File, name: String) {
    val pm = context.getSystemService(android.print.PrintManager::class.java) ?: return
    pm.print(name, object : android.print.PrintDocumentAdapter() {
        override fun onLayout(old: android.print.PrintAttributes?, new: android.print.PrintAttributes?, cancel: android.os.CancellationSignal?, cb: LayoutResultCallback, extras: android.os.Bundle?) {
            cb.onLayoutFinished(android.print.PrintDocumentInfo.Builder(f.name).setContentType(android.print.PrintDocumentInfo.CONTENT_TYPE_DOCUMENT).build(), true)
        }
        override fun onWrite(pages: Array<out android.print.PageRange>?, dest: ParcelFileDescriptor, cancel: android.os.CancellationSignal?, cb: WriteResultCallback) {
            runCatching { f.inputStream().use { i -> java.io.FileOutputStream(dest.fileDescriptor).use { o -> i.copyTo(o) } } }
                .onSuccess { cb.onWriteFinished(arrayOf(android.print.PageRange.ALL_PAGES)) }.onFailure { cb.onWriteFailed(it.message) }
        }
    }, null)
}

/** Details (M-DOCS-02): title, type, date, expiry, reference, linked entry, notes; remove. Works offline. */
@Composable
private fun DocDetailsSheet(recs: Recs, d: Rec, onDone: () -> Unit) {
    val nav = LocalRecNav.current
    var title by rememberSaveable { mutableStateOf(d.s("title") ?: "") }
    var type by rememberSaveable { mutableStateOf(d.s("type") ?: "other") }
    var date by rememberSaveable { mutableStateOf(d.s("document_date")) }
    var track by rememberSaveable { mutableStateOf(d.b("track_expiry")) }
    var expires by rememberSaveable { mutableStateOf(d.s("expires_on")) }
    var reference by rememberSaveable { mutableStateOf(d.s("reference") ?: "") }
    var entry by rememberSaveable { mutableStateOf(d.s("log_entry_id")) }
    var notes by rememberSaveable { mutableStateOf(d.s("notes") ?: "") }
    var removing by remember { mutableStateOf(false) }
    val c = MyTailLogTheme.colors
    Sheet(stringResource(R.string.docs_details), onDone, full = true) {
        Field(stringResource(R.string.docs_title), title, { title = it })
        Choice(stringResource(R.string.docs_type), DOC_TYPES, type) { type = it }
        DateRow(stringResource(R.string.rec_date), date, { date = it }, clearable = true)
        Row(Modifier.fillMaxWidth().heightIn(min = 52.dp), verticalAlignment = Alignment.CenterVertically) {
            Lede(stringResource(R.string.docs_track_expiry), Modifier.weight(1f))
            Switch(track, { track = it }, colors = SwitchDefaults.colors(checkedTrackColor = c.ink, checkedThumbColor = c.leaf))
        }
        if (track) DateRow(stringResource(R.string.docs_expires), expires, { expires = it }, clearable = true)
        Field(stringResource(R.string.docs_reference), reference, { reference = it })
        EntryChoice(recs, stringResource(R.string.docs_linked_entry), entry, allowNone = stringResource(R.string.docs_no_entry)) { entry = it }
        Field(stringResource(R.string.maint_notes), notes, { notes = it }, lines = 2)
        DButton(stringResource(R.string.save), {
            recs.change("document.update", "document", d.id, "Document details", json("documentId" to d.id, "fields" to json(
                "title" to title.trim().ifEmpty { null }, "type" to type, "document_date" to date, "reference" to reference.trim().ifEmpty { null }, "notes" to notes.trim().ifEmpty { null },
            )))
            if (track != d.b("track_expiry") || expires != d.s("expires_on")) recs.change("document.setExpiry", "document", d.id, "Document expiry", json("documentId" to d.id, "trackExpiry" to track, "expiresOn" to expires))
            if (entry != d.s("log_entry_id")) recs.change("document.setEntry", "document", d.id, "Attach document", json("documentId" to d.id, "entryId" to entry))
            onDone()
        }, modifier = Modifier.padding(top = Tokens.Space.s2))
        DButton(stringResource(R.string.docs_remove), { removing = true }, kind = ButtonKind.Quiet)
    }
    if (removing) RemoveDoc(recs, d, { onDone(); nav.back() }) { removing = false }
}

// --- Add a document (M-DOCS-03) ---------------------------------------------------------------------------

/** A file chosen in the add sheet, read into memory (≤ 25 MB). */
class Picked(val name: String, val mime: String, val bytes: ByteArray, val tooBig: Long? = null)

fun readPicked(context: Context, uri: Uri): Picked? {
    val cr = context.contentResolver
    val name = cr.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { if (it.moveToFirst()) it.getString(0) else null } ?: uri.lastPathSegment ?: "document"
    val mime = cr.getType(uri) ?: if (name.endsWith(".pdf", true)) "application/pdf" else "image/jpeg"
    val size = cr.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { if (it.moveToFirst()) it.getLong(0) else -1 } ?: -1
    if (size > MAX_DOC_BYTES) return Picked(name, mime, ByteArray(0), size)
    val bytes = cr.openInputStream(uri)?.use { it.readBytes() } ?: return null
    return Picked(name, mime, bytes, bytes.size.toLong().takeIf { it > MAX_DOC_BYTES })
}

private val Picked.mb get() = String.format(java.util.Locale.US, "%.1f MB", (tooBig ?: bytes.size.toLong()) / 1048576.0)

@Composable
fun AddDocSheet(recs: Recs, startType: String?, onDone: () -> Unit) {
    val context = LocalContext.current
    val resources = LocalResources.current
    val scope = rememberCoroutineScope()
    val ready = remember { mutableStateListOf<Picked>() }
    var type by rememberSaveable { mutableStateOf(startType) }
    var name by rememberSaveable { mutableStateOf("") }
    var expires by rememberSaveable { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val files = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        scope.launch { ready += withContext(Dispatchers.IO) { uris.mapNotNull { runCatching { readPicked(context, it) }.getOrNull() } } }
    }
    val scanner = rememberLauncherForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { r ->
        val pdf = GmsDocumentScanningResult.fromActivityResultIntent(r.data)?.pdf ?: return@rememberLauncherForActivityResult
        scope.launch { withContext(Dispatchers.IO) { runCatching { readPicked(context, pdf.uri) }.getOrNull() }?.let { ready += Picked("Scan ${java.time.LocalDate.now()}.pdf", "application/pdf", it.bytes) } }
    }
    val c = MyTailLogTheme.colors
    Sheet(stringResource(R.string.docs_add), onDone, dirty = ready.isNotEmpty(), discardWhat = stringResource(R.string.docs_document), full = true) {
        Row(horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s2)) {
            SourceTile(LucideIcons.Camera, stringResource(R.string.docs_camera), stringResource(R.string.docs_camera_sub), Modifier.weight(1f)) {
                val opts = GmsDocumentScannerOptions.Builder().setGalleryImportAllowed(false).setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_PDF)
                    .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL).build()
                (context as? Activity)?.let { act ->
                    GmsDocumentScanning.getClient(opts).getStartScanIntent(act).addOnSuccessListener { scanner.launch(IntentSenderRequest.Builder(it).build()) }
                        .addOnFailureListener { error = resources.getString(R.string.scan_no_system_scanner) }
                }
            }
            SourceTile(LucideIcons.FileText, stringResource(R.string.docs_choose_file), stringResource(R.string.docs_choose_file_sub), Modifier.weight(1f)) {
                files.launch(arrayOf("application/pdf", "image/*"))
            }
        }
        if (ready.isNotEmpty()) {
            GroupHeader(stringResource(R.string.docs_ready))
            ready.toList().forEach { p ->
                RecRow(p.name, listOf(p.mb + (p.tooBig?.let { " · " + resources.getString(R.string.docs_too_big) } ?: "")), menu = listOf(stringResource(R.string.rec_remove) to { ready.remove(p) }),
                    trailing = { androidx.compose.material3.TextButton({ ready.remove(p) }) { Icon(LucideIcons.X, stringResource(R.string.rec_remove), tint = c.ink) } })
            }
        }
        Note(stringResource(R.string.docs_what_is_it), Modifier.padding(top = Tokens.Space.s3))
        Choice(stringResource(R.string.docs_type), DOC_TYPES, type) { type = it }
        Field(stringResource(R.string.docs_name_it), name, { name = it })
        if (type in EXPIRING) DateRow(stringResource(R.string.docs_expires), expires, { expires = it }, clearable = true)
        error?.let { Note(it, alarm = true) }
        Note(stringResource(R.string.docs_limit))
        val ok = ready.filter { it.tooBig == null && it.bytes.isNotEmpty() }
        DButton(stringResource(R.string.docs_add_to), {
            ok.forEachIndexed { i, p ->
                val title = name.trim().ifEmpty { null }?.let { if (ok.size > 1) "$it ${i + 1}" else it } ?: p.name.substringBeforeLast('.')
                val meta = json(
                    "type" to (type ?: "other"), "title" to title, "fileName" to p.name, "mimeType" to p.mime,
                    "trackExpiry" to (type in EXPIRING), "expiresOn" to expires,
                )
                recs.store.addFile(OfflineStore.DOCUMENT, recs.id, File(recs.store.dir, "outbox/docs/${newId()}"), p.bytes, meta)
            }
            recs.kick()
            recs.toast = Toast(if (recs.online) recs.str(R.string.docs_added) else recs.str(R.string.docs_added_offline))
            onDone()
        }, enabled = ok.isNotEmpty() && type != null)
    }
}

@Composable
private fun SourceTile(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, sub: String, modifier: Modifier, onClick: () -> Unit) {
    val c = MyTailLogTheme.colors
    Column(
        modifier.heightIn(min = 96.dp).clip(RoundedCornerShape(Tokens.Radius.m)).border(1.dp, c.controlBorder, RoundedCornerShape(Tokens.Radius.m))
            .clickable(role = Role.Button, onClick = onClick).padding(Tokens.Space.s3),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Icon(icon, null, tint = c.ink, modifier = Modifier.size(22.dp))
        Text(title, color = c.ink, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = androidx.compose.ui.text.font.FontWeight(700)))
        Note(sub)
    }
}

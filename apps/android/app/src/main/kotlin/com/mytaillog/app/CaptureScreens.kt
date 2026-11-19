package com.mytaillog.app

import android.app.Activity
import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import com.mytaillog.core.api.AircraftAccess
import com.mytaillog.core.domain.Mutation
import com.mytaillog.core.sync.RowRef
import com.mytaillog.design.ButtonKind
import com.mytaillog.design.DButton
import com.mytaillog.design.GroupHeader
import com.mytaillog.design.LucideIcons
import com.mytaillog.design.MyTailLogTheme
import com.mytaillog.design.PhoneHeader
import com.mytaillog.design.PhoneLeaf
import com.mytaillog.design.PhoneRow
import com.mytaillog.design.Section
import com.mytaillog.design.Tokens
import com.mytaillog.design.section
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.util.UUID

/** Capture's shared state for the signed-in user: the store, the phone routes and the scan being set up. */
class CaptureHost(val store: OfflineStore, val api: CaptureApi, private val context: Context) {
    /** The book chosen on M-SCAN-01, read by the camera route. */
    var target by mutableStateOf<ScanTarget?>(null)

    /** Upload and sync now if there is a network, or as soon as there is (05 §6.7). */
    fun kick() = SyncWorker.now(context)

    /** Photos or system-scanner pages: through the same file-job path as the camera, as one scan. */
    suspend fun import(t: ScanTarget, uris: List<Uri>): Int = withContext(Dispatchers.Default) {
        val batch = store.newBatchId()
        var n = 0
        for (u in uris) {
            val b = PageImages.decode(context, u) ?: continue
            val p = PageImages.prepare(b)
            withContext(Dispatchers.IO) { store.addPage(t, batch, p.jpeg, p.thumb, p.phash) }
            n++
        }
        if (n > 0) { store.finishSession(batch); kick() }
        n
    }
}

/** A logbook to scan into: id and its name ("Airframe", or its title). */
data class BookChoice(val id: String, val name: String)

fun bookName(type: String, title: String?) = title?.takeIf { it.isNotBlank() } ?: type.replaceFirstChar { it.uppercase() }

/** One Add row (06 M-FLIGHT-01): a 40dp tile in the colour of the tab it files into, title and subline, 64 tall. */
@Composable
private fun AddRow(section: Section, icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, sub: String, onClick: () -> Unit) {
    val c = MyTailLogTheme.colors
    Row(
        Modifier.fillMaxWidth().heightIn(min = 64.dp).clickable(role = Role.Button, onClick = onClick),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s3),
    ) {
        com.mytaillog.design.SectionIcon(section, icon, Modifier.size(40.dp))
        Column {
            Text(title, color = c.ink, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight(700)))
            Text(sub, color = c.ink3, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

/** The Add sheet (06 M-FLIGHT-01) in its fixed order; viewers get only "Report a squawk" (07 B-VIEWER). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddSheet(
    tail: String, canEdit: Boolean, onDismiss: () -> Unit,
    onFlight: () -> Unit = {}, onOil: () -> Unit = {}, onSquawk: () -> Unit = {}, onScan: () -> Unit = {}, onDocument: () -> Unit = {},
) {
    val c = MyTailLogTheme.colors
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = c.leaf) {
        Column(Modifier.padding(horizontal = Tokens.Space.s4).padding(bottom = Tokens.Space.s4)) {
            Title(stringResource(R.string.add_to, tail), Modifier.padding(bottom = Tokens.Space.s2))
            fun go(f: () -> Unit): () -> Unit = { onDismiss(); f() }
            if (canEdit) {
                AddRow(Section.Aircraft, LucideIcons.PlaneLanding, stringResource(R.string.add_flight), stringResource(R.string.add_flight_sub), go(onFlight))
                AddRow(Section.Aircraft, LucideIcons.Droplet, stringResource(R.string.add_oil), stringResource(R.string.add_oil_sub), go(onOil))
            }
            AddRow(Section.Maint, LucideIcons.Flag, stringResource(R.string.add_squawk), stringResource(R.string.add_squawk_sub), go(onSquawk))
            if (canEdit) {
                AddRow(Section.Books, LucideIcons.Camera, stringResource(R.string.add_scan), stringResource(R.string.add_scan_sub), go(onScan))
                AddRow(Section.Docs, LucideIcons.FilePlus2, stringResource(R.string.add_document), stringResource(R.string.add_document_sub), go(onDocument))
            }
            Text(stringResource(R.string.add_footer), color = c.ink3, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = Tokens.Space.s2))
        }
    }
}

/**
 * M-SCAN-01 Choose the logbook: the book, where the pages go, handwritten, the reading allowance,
 * then **Open the camera** (or the system scanner, or photos).
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ScanSetupSheet(host: CaptureHost, aircraft: AircraftAccess, books: List<BookChoice>, onCamera: (ScanTarget) -> Unit, onImported: () -> Unit, onDismiss: () -> Unit) {
    val c = MyTailLogTheme.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val sync by host.store.sync.collectAsStateWithLifecycle()
    var bookId by rememberSaveable { mutableStateOf(books.firstOrNull()?.id) }
    var handwritten by rememberSaveable { mutableStateOf(true) }
    var message by remember { mutableStateOf<String?>(null) }
    val book = books.firstOrNull { it.id == bookId }
    fun target() = book?.let { ScanTarget(aircraft.aircraft.id, aircraft.aircraft.tailNumber, it.id, it.name, handwritten) }

    val allowance by produceState<Allowance?>(null, sync.online) {
        value = if (sync.online) runCatching { host.api.readingQueue(aircraft.aircraft.id).allowance }.getOrNull() else null
    }
    val soFar by produceState(0L, bookId, sync.version) {
        value = bookId?.let { id -> withContext(Dispatchers.IO) { host.store.pageCount(id) + host.store.pageJobs().count { it.logbookId == id } } } ?: 0
    }

    fun imported(uris: List<Uri>) {
        val t = target() ?: return
        if (uris.isEmpty()) return
        scope.launch {
            val n = host.import(t, uris)
            if (n > 0) { onDismiss(); onImported() } else message = context.getString(R.string.scan_not_saved)
        }
    }
    val photos = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(24)) { imported(it) }
    val scanner = rememberLauncherForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { r ->
        if (r.resultCode == Activity.RESULT_OK) imported(GmsDocumentScanningResult.fromActivityResultIntent(r.data)?.pages?.map { it.imageUri }.orEmpty())
    }
    fun systemScanner() {
        val activity = context as? Activity ?: return
        val options = GmsDocumentScannerOptions.Builder()
            .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
            .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
            .setPageLimit(24)
            .setGalleryImportAllowed(false)
            .build()
        GmsDocumentScanning.getClient(options).getStartScanIntent(activity)
            .addOnSuccessListener { scanner.launch(IntentSenderRequest.Builder(it).build()) }
            .addOnFailureListener { message = context.getString(R.string.scan_no_system_scanner) }
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = c.leaf) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = Tokens.Space.s4).padding(bottom = Tokens.Space.s6), verticalArrangement = Arrangement.spacedBy(Tokens.Space.s3)) {
            Text(stringResource(R.string.scan_title), color = c.ink, style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
            Text(stringResource(R.string.scan_which_book), color = c.ink3, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight(700)))
            if (books.isEmpty()) Text(stringResource(R.string.scan_no_books), color = c.ink, style = MaterialTheme.typography.bodyLarge)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s2), verticalArrangement = Arrangement.spacedBy(Tokens.Space.s2)) {
                books.forEach { b ->
                    val on = b.id == bookId
                    Text(
                        b.name,
                        color = if (on) c.leaf else c.ink,
                        style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight(600)),
                        modifier = Modifier.heightIn(min = 44.dp).clip(RoundedCornerShape(Tokens.Radius.m))
                            .background(if (on) c.ink else c.leaf).border(1.dp, c.controlBorder, RoundedCornerShape(Tokens.Radius.m))
                            .clickable(role = Role.RadioButton) { bookId = b.id }.padding(horizontal = Tokens.Space.s4, vertical = 10.dp),
                    )
                }
            }
            if (book != null) Text(stringResource(R.string.scan_where, soFar, soFar + 1), color = c.ink, style = MaterialTheme.typography.bodyLarge)
            Row(Modifier.fillMaxWidth().heightIn(min = 58.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(stringResource(R.string.scan_handwritten), color = c.ink, style = MaterialTheme.typography.bodyLarge)
                    Text(stringResource(R.string.scan_handwritten_note), color = c.ink3, style = MaterialTheme.typography.bodyMedium)
                }
                Switch(handwritten, { handwritten = it }, colors = SwitchDefaults.colors(checkedTrackColor = c.ink, checkedThumbColor = c.leaf))
            }
            Text(allowanceLine(allowance, sync.online), color = c.ink3, style = MaterialTheme.typography.bodySmall)
            message?.let { Text(it, color = c.alarmText, style = MaterialTheme.typography.bodyMedium) }
            DButton(stringResource(R.string.scan_open_camera), { target()?.let { onDismiss(); onCamera(it) } }, enabled = book != null, icon = LucideIcons.Camera)
            DButton(stringResource(R.string.scan_system_scanner), ::systemScanner, kind = ButtonKind.Quiet, enabled = book != null)
            DButton(stringResource(R.string.scan_choose_photos), { photos.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, kind = ButtonKind.Quiet, enabled = book != null)
        }
    }
}

/** 06 M-SCAN-01 allowance line and 07 B-ALLOWANCE. */
fun allowanceLine(a: Allowance?, online: Boolean): String = when {
    !online || a == null -> "Pages are read when you have signal."
    a.ownKey -> "Reading with your own key."
    a.paused -> "Reading is paused for everyone until tomorrow. Everything else keeps working."
    else -> "Reading allowance today: ${a.pagesUsed} of ${a.pagesCap} pages used, shared by your aircraft. Pages past it wait for tomorrow."
}

/**
 * M-SCAN-03 Pages in progress: every page has a place. On this phone (held and uploading), then the
 * server's reading queue polled every 5 s while open (offline: this phone's copy, "as of 9:44"),
 * duplicates to decide, and the allowance where it is spent.
 * shortcut: no mini map above the groups yet; the lands-in line for system-scanner pages isn't shown here.
 */
@Composable
fun ScanQueueScreen(host: CaptureHost, aircraft: AircraftAccess, onBack: () -> Unit, onReview: () -> Unit) {
    val c = MyTailLogTheme.colors
    val store = host.store
    val sync by store.sync.collectAsStateWithLifecycle()
    val id = aircraft.aircraft.id
    var queue by remember { mutableStateOf<ReadingQueue?>(null) }
    LaunchedEffect(id, sync.online) {
        while (sync.online) {
            try { queue = host.api.readingQueue(id) } catch (e: CancellationException) { throw e } catch (_: Exception) {}
            delay(5_000)
        }
    }
    val held = remember(sync.version) { store.pageJobs().filter { it.aircraftId == id } }
    val local = remember(sync.version) { localBatches(store, id) }
    val batches = if (sync.online && queue != null) queue!!.batches else local
    val dupes = remember(sync.version) {
        store.rows("page", "aircraft_id = ? AND duplicate_of_page_id IS NOT NULL AND extraction_status IN ('queued', 'pending')", id)
    }

    Column(Modifier.fillMaxSize().background(c.section(Section.Books).board)) {
        PhoneHeader(stringResource(R.string.queue_title), Section.Books, back = stringResource(R.string.section_books) to onBack)
        SyncBars(sync, onOpen = null)
        PhoneLeaf {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                if (held.isNotEmpty()) {
                    GroupHeader(stringResource(R.string.queue_on_phone), count = "${held.size}")
                    val up = sync.uploading
                    Text(
                        when {
                            up != null -> stringResource(R.string.queue_uploading, up.first + 1, up.second)
                            !sync.online -> stringResource(R.string.queue_upload_later)
                            else -> stringResource(R.string.queue_waiting_to_upload)
                        },
                        color = c.ink, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(top = Tokens.Space.s2),
                    )
                    if (up != null) LinearProgressIndicator(progress = { (up.first.toFloat() / up.second.coerceAtLeast(1)) }, color = c.ink, trackColor = c.rule, modifier = Modifier.fillMaxWidth().padding(vertical = Tokens.Space.s2))
                    Thumbs(store, held.map { it.pageId })
                    held.filter { it.gaveUp }.forEach { j ->
                        Text(j.error ?: stringResource(R.string.queue_not_uploaded), color = c.alarmText, style = MaterialTheme.typography.bodyMedium)
                        Row {
                            TextButton({ store.retryPage(j.id); host.kick() }) { Text(stringResource(R.string.try_again), color = c.ink) }
                            TextButton({ store.discardPage(j.id) }) { Text(stringResource(R.string.queue_remove), color = c.alarmText) }
                        }
                    }
                    if (sync.online && !sync.syncing) DButton(stringResource(R.string.queue_upload_now), host::kick, kind = ButtonKind.Quiet)
                }
                val reading = batches.sumOf { it.queued + it.reading }
                val read = batches.sumOf { it.read }
                if (reading > 0) {
                    GroupHeader(stringResource(R.string.queue_being_read), count = "$reading")
                    Text(stringResource(R.string.queue_read_of, read, read + reading), color = c.ink, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(top = Tokens.Space.s2))
                    LinearProgressIndicator(progress = { read.toFloat() / (read + reading) }, color = c.ink, trackColor = c.rule, modifier = Modifier.fillMaxWidth().padding(vertical = Tokens.Space.s2))
                    if (!sync.online) sync.lastSync?.let { Text(stringResource(R.string.queue_as_of, clock(it)), color = c.ink3, style = MaterialTheme.typography.bodySmall) }
                }
                val waitAllowance = batches.sumOf { it.waitingAllowance }
                if (waitAllowance > 0) {
                    GroupHeader(stringResource(R.string.queue_wait_allowance), count = "$waitAllowance")
                    Text(stringResource(R.string.queue_own_key), color = c.ink, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = Tokens.Space.s2))
                }
                val failed = batches.sumOf { it.failed }
                if (failed > 0) Text(stringResource(R.string.queue_failed, failed), color = c.alarmText, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(top = Tokens.Space.s3))
                if (dupes.isNotEmpty()) {
                    GroupHeader(stringResource(R.string.queue_dupes), count = "${dupes.size}")
                    dupes.forEach { p ->
                        val pageId = p["id"]!!.jsonPrimitive.content
                        Text(stringResource(R.string.queue_dupe_line), color = c.ink, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(top = Tokens.Space.s2))
                        Row {
                            TextButton({ duplicate(host, id, pageId, "keep_both") }) { Text(stringResource(R.string.queue_keep_both), color = c.ink) }
                            TextButton({ duplicate(host, id, pageId, "skip") }) { Text(stringResource(R.string.queue_skip), color = c.ink) }
                        }
                    }
                }
                val review = batches.sumOf { it.read }
                GroupHeader(stringResource(R.string.queue_review), count = "$review")
                if (review > 0) DButton(stringResource(R.string.queue_review_button), onReview, kind = ButtonKind.Secondary, modifier = Modifier.padding(top = Tokens.Space.s2))
                else Text(stringResource(R.string.queue_review_empty), color = c.ink, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(top = Tokens.Space.s2))
                queue?.allowance?.takeIf { !it.ownKey }?.let { a ->
                    Column(Modifier.fillMaxWidth().padding(top = Tokens.Space.s4).clip(RoundedCornerShape(Tokens.Radius.m)).background(c.leaf2).padding(Tokens.Space.s3)) {
                        Text(stringResource(R.string.queue_allowance, a.pagesUsed, a.pagesCap), color = c.ink, style = MaterialTheme.typography.bodyLarge)
                        Text(stringResource(R.string.queue_allowance_note), color = c.ink3, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }
    }
}

private fun duplicate(host: CaptureHost, aircraftId: String, pageId: String, decision: String) {
    host.store.enqueue(
        Mutation(UUID.randomUUID().toString(), "page.duplicateDecision", aircraftId, buildJsonObject { put("pageId", pageId); put("decision", decision) }),
        if (decision == "skip") "Skip a duplicate page" else "Keep a duplicate page",
        RowRef("page", pageId),
    )
    host.kick()
}

/** The queue from this phone's copy: recent scans and their pages (09 §4.8 counts). */
fun localBatches(store: OfflineStore, aircraftId: String): List<BatchProgress> =
    store.mirror.db.mirrorQueries.batchesForAircraft(aircraftId).executeAsList().take(20).map { b ->
        val pages = store.mirror.db.mirrorQueries.pagesInBatch(b.id).executeAsList().map { Triple(it.extraction_status, it.needs_look == 1L, it.duplicate_of_page_id != null) }
        batchProgress(b.id, null, b.expected_pages?.toInt() ?: pages.size, pages)
    }

@Composable
private fun Thumbs(store: OfflineStore, pageIds: List<String>) {
    Row(Modifier.horizontalScroll(rememberScrollState()).padding(vertical = Tokens.Space.s2), horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s2)) {
        pageIds.take(30).forEach { id ->
            val img by produceState<ImageBitmap?>(null, id) {
                value = withContext(Dispatchers.IO) { store.thumb(id)?.let { BitmapFactory.decodeFile(it.path)?.asImageBitmap() } }
            }
            img?.let { Image(it, null, Modifier.size(42.dp, 56.dp).clip(RoundedCornerShape(3.dp)), contentScale = ContentScale.Crop) }
        }
    }
}

fun clock(epochMs: Long): String = java.time.Instant.ofEpochMilli(epochMs).atZone(java.time.ZoneId.systemDefault())
    .format(java.time.format.DateTimeFormatter.ofPattern("H:mm", java.util.Locale.US))

/** Logbooks to offer on M-SCAN-01: this phone's copy, or the loaded Logbooks data before the first pull lands. */
fun scanBooks(store: OfflineStore, aircraftId: String, loaded: List<com.mytaillog.core.api.LogbookRow>?): List<BookChoice> {
    val mirror = store.rows("logbook", "aircraft_id = ? ORDER BY type", aircraftId).map {
        BookChoice(it["id"]!!.jsonPrimitive.content, bookName(it["type"]?.jsonPrimitive?.contentOrNull ?: "Logbook", it["title"]?.jsonPrimitive?.contentOrNull))
    }
    return mirror.ifEmpty { loaded.orEmpty().map { BookChoice(it.id, bookName(it.type, it.title)) } }
}

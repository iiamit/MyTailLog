package com.mytaillog.app

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Checkbox
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.Saver
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import com.mytaillog.design.MyTailLogTheme
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.mytaillog.design.ButtonKind
import com.mytaillog.design.DButton
import com.mytaillog.design.GroupHeader
import com.mytaillog.design.Section
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import java.io.ByteArrayOutputStream
import java.io.File
import java.math.BigDecimal
import java.time.LocalDate
import java.util.Base64

internal fun JsonObject.rows(key: String): List<JsonObject> = (this[key] as? JsonArray).orEmpty().mapNotNull { it as? JsonObject }
internal val expenseCurrencies = listOf("USD", "CAD", "EUR", "GBP", "AUD", "NZD", "CHF", "JPY", "CNY", "HKD", "SGD", "INR", "ZAR", "SEK", "NOK", "DKK", "AED", "ILS", "BRL", "MXN", "KWD", "BHD", "OMR")
internal fun currencyDigits(currency: String) = when (currency) { "JPY" -> 0; "KWD", "BHD", "OMR" -> 3; else -> 2 }
internal fun expenseMinor(value: String, currency: String = "USD"): Long? {
    if (currency !in expenseCurrencies || !Regex("-?(?:[0-9]+(?:\\.[0-9]+)?|\\.[0-9]+)").matches(value.trim())) return null
    return runCatching { BigDecimal(value.trim()).movePointRight(currencyDigits(currency)).longValueExact() }.getOrNull()?.takeIf { it != 0L && it in -9000000000000L..9000000000000L }
}
internal fun moneyMinor(value: Long, currency: String = "USD"): String = BigDecimal.valueOf(value, currencyDigits(currency)).toPlainString()
internal fun validExpensePeriod(from: String?, through: String?): Boolean = runCatching {
    from != null && through != null && !LocalDate.parse(from).isAfter(LocalDate.parse(through))
}.getOrDefault(false)
internal fun expensePath(from: String?, through: String?, csv: Boolean = false): String {
    require((from == null && through == null) || validExpensePeriod(from, through)) { "Choose a valid reporting period." }
    val query = listOfNotNull(if (csv) "format=csv" else null, from?.let { "from=$it" }, through?.let { "to=$it" })
    return "expenses" + if (query.isEmpty()) "" else "?" + query.joinToString("&")
}
internal fun compressionLine(row: JsonObject): String = row.rows("readings").joinToString(" · ") { "C${it.s("cylinder")}: ${fmtNum(it.d("psi"))}/${fmtNum(it.d("reference"))}" }
private val ownerJsonSaver = Saver<JsonObject, String>(save = { it.toString() }, restore = { Json.parseToJsonElement(it).jsonObject })
private val optionalOwnerJsonSaver = Saver<JsonObject?, String>(save = { it?.toString() ?: "" }, restore = { if (it.isBlank()) null else Json.parseToJsonElement(it).jsonObject })
internal val inboxKinds = listOf("unclassified", "logbook", "invoice", "oil_report")

/** Keep online actions cancellable, and leave drafts intact after refused or interrupted requests. */
private class OwnerRequest {
    var busy by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)
    suspend fun run(action: suspend () -> Unit) {
        if (busy) return
        busy = true; error = null
        try { action() } catch (e: CancellationException) { throw e }
        catch (e: Exception) { error = e.message ?: "The request did not finish. Please retry." }
        finally { busy = false }
    }
}

@Composable
private fun RequestNote(request: OwnerRequest, online: Boolean, offlineText: String = "Offline. Reconnect to review or approve this document.") {
    if (request.busy) LinearProgressIndicator(Modifier.fillMaxWidth().padding(vertical = 8.dp))
    request.error?.let { Note(it, alarm = true) }
    if (!online) Note(offlineText)
}

@Composable
fun AnnualPacketScreen(recs: Recs) {
    val nav = LocalRecNav.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val request = remember(recs.id) { OwnerRequest() }
    var packet by remember(recs.id) { mutableStateOf<JsonObject?>(null) }
    var selected by rememberSaveable(recs.id) { mutableStateOf(listOf<String>()) }
    val online by recs.store.sync.collectAsStateWithLifecycleCompat()
    suspend fun refresh() = request.run { packet = recs.api.ownerData(recs.id, "annual-packet?format=json") }
    LaunchedEffect(recs.id, online.online) { if (online.online) refresh() }
    Board("Prepare annual packet", Section.Share, back = "Share" to nav.back) {
        Note("A dated summary for your IA. Only the evidence you select is included in the ZIP. Review records and unresolved items before sharing.")
        RequestNote(request, online.online, "Connect to generate a current annual packet or download selected evidence.")
        DButton("Refresh packet", { scope.launch { refresh() } }, kind = ButtonKind.Secondary, enabled = online.online && !request.busy)
        packet?.let { p ->
            Note("Generated ${p.s("generatedAt") ?: ""} · records cutoff ${p.s("cutoff") ?: "today"}")
            (p["warnings"] as? JsonArray).orEmpty().forEach { Note((it as? JsonPrimitive)?.contentOrNull ?: it.toString(), alarm = true) }
            GroupHeader("Select supporting evidence", count = "${selected.size} selected")
            p.rows("evidence").forEach { e ->
                val key = "${e.s("kind")}:${e.id}"
                RecRow(e.s("label") ?: e.id, listOf(if (e.b("available")) "Available" else "Missing file"), onClick = if (e.b("available")) ({ selected = if (key in selected) selected - key else selected + key }) else null,
                    trailing = { Checkbox(key in selected, onCheckedChange = null, enabled = e.b("available")) })
            }
            DButton("Download annual PDF", { scope.launch { request.run { val file = sharedFile(context, "${recs.tail} annual packet.pdf"); recs.api.ownerFile(recs.id, "annual-packet?format=pdf&cutoff=${p.s("cutoff") ?: LocalDate.now()}", file); openFile(context, file) } } }, enabled = online.online && !request.busy)
            DButton("Share selected evidence ZIP", { scope.launch { request.run {
                val body = json("format" to "zip", "cutoff" to p.s("cutoff"), "pageIds" to JsonArray(selected.filter { it.startsWith("page:") }.map { JsonPrimitive(it.substringAfter(':')) }), "documentIds" to JsonArray(selected.filter { it.startsWith("document:") }.map { JsonPrimitive(it.substringAfter(':')) }))
                val file = sharedFile(context, "${recs.tail} annual evidence.zip")
                recs.api.ownerFile(recs.id, "annual-packet", file, body)
                openFile(context, file)
            } } }, enabled = online.online && !request.busy && selected.size in 1..100, kind = ButtonKind.Secondary)
        }
    }
}

@Composable
fun DocumentInboxScreen(recs: Recs) {
    val nav = LocalRecNav.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val request = remember(recs.id) { OwnerRequest() }
    val sync by recs.store.sync.collectAsStateWithLifecycleCompat()
    var data by remember(recs.id) { mutableStateOf<JsonObject?>(null) }
    var review by rememberSaveable(recs.id, stateSaver = optionalOwnerJsonSaver) { mutableStateOf<JsonObject?>(null) }
    val held = recs.watch { recs.store.recordFiles().filter { it.kind == OfflineStore.INBOX && it.aircraft_id == recs.id } }
    suspend fun refresh() { data = recs.api.ownerData(recs.id, "inbox") }
    LaunchedEffect(recs.id, sync.online, sync.lastSync) { if (sync.online) request.run { refresh() } }
    fun queue(uris: List<android.net.Uri>) {
        scope.launch { request.run {
            for (uri in uris) {
            val file = withContext(Dispatchers.IO) { readPicked(context, uri) } ?: error("This file could not be opened.")
            require(file.tooBig == null) { "Choose a file no larger than 25 MB." }
            require(file.mime in listOf("application/pdf", "image/jpeg", "image/png", "image/webp")) { "Choose a PDF, JPEG, PNG or WebP image." }
            val id = newId()
            withContext(Dispatchers.IO) { recs.store.addFile(OfflineStore.INBOX, recs.id, File(recs.store.dir, "outbox/inbox/$id"), file.bytes, json("id" to id, "fileName" to file.name, "mimeType" to file.mime)) }
            recs.kick()
            }
        } }
    }
    val files = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { queue(it) }
    val photos = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { queue(it) }
    Board("Document inbox", Section.Docs, back = "Aircraft" to nav.back) {
        Note("Upload once, then review where each document belongs. Originals are retained. Nothing updates maintenance or expenses until you approve it.")
        RequestNote(request, sync.online, "Offline. Originals stay on this phone and upload when connected. Review and approval need a connection.")
        if (recs.canEdit) {
            DButton("Choose files", { files.launch(arrayOf("application/pdf", "image/*")) }, enabled = !request.busy)
            DButton("Choose photos", { photos.launch("image/*") }, kind = ButtonKind.Secondary, enabled = !request.busy)
        }
        DButton("Refresh inbox", { scope.launch { request.run { refresh() } } }, kind = ButtonKind.Quiet, enabled = sync.online && !request.busy)
        held.forEach { h ->
            val meta = Json.parseToJsonElement(h.meta).jsonObject
            RecRow(meta.s("fileName") ?: "Upload", listOf(h.error ?: "Saved on this phone · waiting to upload"), below = {
                if (h.error != null) DButton("Retry upload", { recs.store.retryRecordFile(h.id); recs.kick() }, kind = ButtonKind.Secondary)
            })
        }
        val items = data?.rows("items").orEmpty()
        if (data != null && items.isEmpty() && held.isEmpty()) Empty("No documents waiting. Add logbook pages, maintenance invoices or oil reports.")
        items.forEach { item ->
            RecRow(item.s("file_name") ?: "Document", listOfNotNull(item.s("kind"), item.s("state"), item.s("error")), onClick = { review = item })
        }
    }
    review?.let { item -> InboxReviewSheet(recs, item, data?.rows("logbooks").orEmpty(), onDone = { review = null }, onChanged = { scope.launch { request.run { refresh() } } }) }
}

@Composable
private fun InboxReviewSheet(recs: Recs, item: JsonObject, books: List<JsonObject>, onDone: () -> Unit, onChanged: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val request = remember(item.id) { OwnerRequest() }
    var current by rememberSaveable(item.id, stateSaver = ownerJsonSaver) { mutableStateOf(item) }
    var kind by rememberSaveable(item.id) { mutableStateOf(item.s("kind") ?: "unclassified") }
    var book by rememberSaveable(item.id) { mutableStateOf<String?>(null) }
    var proposal by rememberSaveable(item.id) { mutableStateOf((item["proposal"] as? JsonObject)?.toString() ?: "{}") }
    var component by rememberSaveable(item.id) { mutableStateOf<String?>(null) }
    var progress by remember { mutableStateOf<String?>(null) }
    val components = recs.watch { recs.store.records("component", recs.id).filter { com.mytaillog.core.domain.isCompleteEngine(it.s("name").orEmpty(), it.s("category"), it.s("component_kind"), it.s("model")) } }
    val online by recs.store.sync.collectAsStateWithLifecycleCompat()
    val editable = recs.canEdit && current.s("state") != "approved"
    Sheet(current.s("file_name") ?: "Review document", onDone, full = true, dirty = editable && (kind != item.s("kind") || proposal != ((item["proposal"] as? JsonObject)?.toString() ?: "{}"))) {
        RequestNote(request, online.online)
        progress?.let { Note(it) }
        Note("Review extracted values against the original. Possible duplicate pages pause in the logbook review queue for your decision.")
        DButton("Open original", { scope.launch { request.run {
            openFile(context, recs.api.file(recs.id, "inbox/${item.id}/file"), current.s("file_name") ?: "document.pdf")
        } } }, enabled = online.online && !request.busy, kind = ButtonKind.Secondary)
        DButton("Reload review", { scope.launch { request.run {
            current = recs.api.ownerData(recs.id, "inbox").rows("items").firstOrNull { it.id == item.id } ?: error("This document is no longer in the inbox.")
            kind = current.s("kind") ?: "unclassified"
            proposal = (current["proposal"] as? JsonObject)?.toString() ?: "{}"
            onChanged()
        } } }, enabled = online.online && !request.busy, kind = ButtonKind.Quiet)
        if (editable) {
            Choice("Destination", inboxKinds.map { it to it.replace('_', ' ') }, kind) { kind = it }
            if (kind == "logbook") Choice("Logbook", books.map { it.id to (it.s("title") ?: it.s("type") ?: it.id) }, book) { book = it }
            if (kind == "oil_report") Choice("Engine", components.map { it.id to (it.s("name") ?: it.id) }, component) { component = it }
            val values = runCatching { Json.parseToJsonElement(proposal).jsonObject }.getOrDefault(json())
            InboxProposalFields(kind, values) { proposal = it.toString() }
            Note("Correct dates, values and units against the original before approving. AI analysis uses your reading allowance.")
            DButton(if (current.s("state") == "failed") "Retry analysis" else "Analyze document", { scope.launch { request.run {
                val result = recs.api.ownerMutation(recs.id, "inbox/${item.id}/analyze", json())
                current = (result["item"] as? JsonObject) ?: result
                kind = current.s("kind") ?: kind
                proposal = (current["proposal"] as? JsonObject)?.toString() ?: proposal
                onChanged()
            } } }, enabled = online.online && !request.busy, kind = ButtonKind.Secondary)
            DButton("Approve routing", { scope.launch { request.run {
                val values = Json.parseToJsonElement(proposal) as? JsonObject ?: error("Proposed values must be an object.")
                var pageCount: Int? = null
                if (kind == "logbook" && current.s("mime_type") == "application/pdf") {
                    progress = "Preparing PDF pages…"
                    pageCount = stageInboxPdf(recs, current) { progress = it }
                }
                val body = json("base" to current.s("updated_at"), "kind" to kind, "logbookId" to book, "componentId" to component, "pageCount" to pageCount, "proposal" to values)
                recs.api.ownerMutation(recs.id, "inbox/${item.id}/approve", body)
                recs.kick(); onChanged(); onDone()
            }; progress = null } }, enabled = online.online && !request.busy && kind != "unclassified" && (kind != "logbook" || book != null), modifier = Modifier.padding(top = 8.dp))
        } else Note("Already approved. The original remains available here.")
    }
}

/** Render one page at a time; stable indexes make interrupted staging safe to resume. */
private suspend fun stageInboxPdf(recs: Recs, item: JsonObject, progress: (String) -> Unit): Int {
    val file = File(recs.store.dir, "inbox-pdf-${item.id}.pdf")
    try {
        val bytes = recs.api.file(recs.id, "inbox/${item.id}/file")
        withContext(Dispatchers.IO) { OfflineStore.writeAtomically(file, bytes) }
        return withContext(Dispatchers.IO) {
            ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
                PdfRenderer(fd).use { pdf ->
                    require(pdf.pageCount in 1..100) { "Choose a PDF with 1–100 pages." }
                    val existing = item.rows("rendered_pages").mapNotNull { it.s("index")?.toIntOrNull() }.toSet()
                    for (index in 0 until pdf.pageCount) {
                        if (index + 1 in existing) continue
                        withContext(Dispatchers.Main) { progress("Preparing page ${index + 1} of ${pdf.pageCount}") }
                        val image = pdf.openPage(index).use { page ->
                            val scale = minOf(2f, 2000f / maxOf(page.width, page.height))
                            val bitmap = Bitmap.createBitmap((page.width * scale).toInt().coerceAtLeast(1), (page.height * scale).toInt().coerceAtLeast(1), Bitmap.Config.ARGB_8888)
                            try { bitmap.eraseColor(Color.WHITE); page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                                ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.JPEG, 85, it) }.toByteArray()
                            } finally { bitmap.recycle() }
                        }
                        recs.api.ownerMutation(recs.id, "inbox/${item.id}/pages", json("index" to index + 1, "image" to Base64.getEncoder().encodeToString(image)))
                    }
                    pdf.pageCount
                }
            }
        }
    } finally { withContext(Dispatchers.IO) { file.delete() } }
}

val LocalOwnerBooks = compositionLocalOf<BooksViewModel?> { null }

@Composable
fun OwnerSourceScreen(recs: Recs, id: String, page: Boolean) {
    val nav = LocalRecNav.current
    val vm = LocalOwnerBooks.current
    val state = vm?.ui?.collectAsStateWithLifecycleCompat()?.value
    val available = if (page) state?.books?.pages?.any { it.id == id } else state?.books?.entries?.any { it.id == id }
    if (vm != null && available == true) {
        val to = BooksNav(openEntry = { nav.open(Routes.of(Routes.SOURCE_ENTRY, it)) }, openPage = { nav.open(Routes.of(Routes.SOURCE_PAGE, it)) }, back = nav.back)
        if (page) PageScreen(vm, id, to) else EntryScreen(vm, id, to)
    } else Board(if (page) "Source page" else "Source entry", Section.Books, back = "Back" to nav.back) {
        Note(if (state?.loading == true) "Loading the source records…" else "This source has not reached this phone's logbooks yet. Refresh records to load it.")
        if (!page) recs.store.mirror.raw("log_entry", id)?.let { row -> Lede(row.s("description") ?: row.s("work_performed") ?: "") }
        DButton("Refresh records", { vm?.refresh(); recs.kick() }, enabled = recs.online)
    }
}

@Composable
private fun SourceEntryButton(recs: Recs, source: JsonObject) {
    val nav = LocalRecNav.current
    val entry = source.s("entryId") ?: source.s("source_entry_id")
    if (entry != null && recs.store.mirror.raw("log_entry", entry) != null) DButton(recs.entryLine(entry) ?: "Open source entry", { nav.open(Routes.of(Routes.SOURCE_ENTRY, entry)) }, kind = ButtonKind.Quiet)
}

@Composable
fun EngineHistoryScreen(recs: Recs) {
    val nav = LocalRecNav.current
    val scope = rememberCoroutineScope()
    val request = remember(recs.id) { OwnerRequest() }
    val file = remember(recs.id) { File(recs.store.dir, "engine-history/${recs.id}.json") }
    var data by remember(recs.id) { mutableStateOf(runCatching { Json.parseToJsonElement(file.readText()).jsonObject }.getOrNull()) }
    var selected by rememberSaveable(recs.id) { mutableStateOf<String?>(null) }
    var adding by rememberSaveable { mutableStateOf(false) }
    var oiling by rememberSaveable { mutableStateOf(false) }
    var editingEvent by rememberSaveable(recs.id, stateSaver = optionalOwnerJsonSaver) { mutableStateOf<JsonObject?>(null) }
    var deletingEvent by rememberSaveable(recs.id, stateSaver = optionalOwnerJsonSaver) { mutableStateOf<JsonObject?>(null) }
    val sync by recs.store.sync.collectAsStateWithLifecycleCompat()
    suspend fun refresh() {
        val result = recs.api.ownerData(recs.id, "engine-history")
        withContext(Dispatchers.IO) { file.parentFile?.mkdirs(); OfflineStore.writeAtomically(file, result.toString().toByteArray()) }
        data = result
    }
    LaunchedEffect(data) {
        val groups = data?.rows("groups").orEmpty()
        if (selected == null && groups.mapNotNull { it.s("componentId") }.distinct().size == 1) selected = groups.maxByOrNull { it.s("start") ?: "" }?.s("segmentId")
    }
    LaunchedEffect(recs.id, sync.online, sync.lastSync) {
        if (sync.online) request.run { try { refresh() } catch (e: UploadHttpException) { if (e.status == 401 || e.status == 403) { data = null; file.delete() }; throw e } }
    }
    Board("Engine history", Section.Aircraft, back = "Aircraft" to nav.back) {
        RequestNote(request, sync.online, "Offline. Showing the last saved engine history; reconnect to update it.")
        if (!sync.online && file.exists()) Note("Saved ${java.time.Instant.ofEpochMilli(file.lastModified())}")
        DButton("Refresh history", { scope.launch { request.run { refresh() } } }, kind = ButtonKind.Secondary, enabled = sync.online && !request.busy)
        val groups = data?.rows("groups").orEmpty()
        val components = data?.rows("components").orEmpty()
        Choice("Engine", listOf("" to "Unassigned · needs review") + groups.map { group ->
            val component = components.firstOrNull { it.id == group.s("componentId") }
            (group.s("segmentId") ?: "") to listOfNotNull(group.s("position"), component?.s("name") ?: group.s("name"), component?.s("serial_number"), "${group.s("start") ?: "unknown start"} → ${group.s("end") ?: "present"}").joinToString(" · ")
        }, selected ?: "") { selected = it }
        val selectedGroup = groups.firstOrNull { it.s("segmentId") == selected }
        val group = selectedGroup ?: data?.get("unassigned") as? JsonObject
        if (selected.isNullOrEmpty()) Note("Observations without an unambiguous engine remain here. Do not compare them across replacements or overhauls.")
        if (recs.canEdit && !selected.isNullOrEmpty()) DButton("Record engine event", { adding = true }, enabled = sync.online && !request.busy)
        GroupHeader("Lifecycle")
        val events = data?.rows("events").orEmpty().filter { it.s("component_id") == selectedGroup?.s("componentId") }
        events.forEach { event ->
            RecRow("${event.s("event_date") ?: ""} · ${(event.s("kind") ?: "event").replace('_', ' ')}", listOfNotNull(event.s("notes")),
                onClick = if (recs.canEdit) ({ editingEvent = event }) else null,
                menu = if (recs.canEdit) listOf("Edit event" to { editingEvent = event }, "Delete event" to { deletingEvent = event }) else emptyList())
            SourceEntryButton(recs, event)
        }
        if (events.isEmpty()) Note("No recorded lifecycle events for this selection.")
        GroupHeader("Compression · measured pressures")
        val compression = group?.rows("compression").orEmpty()
        if (compression.isEmpty()) Note("No compression observations for this engine.")
        CompressionHistoryChart(compression, events)
        compression.reversed().forEach { test ->
            RecRow(test.s("date") ?: test.s("event_date") ?: "Undated reading", listOf(compressionLine(test), if (test.b("confirmed")) "Verified source" else "Review source"))
            SourceEntryButton(recs, test)
            if (recs.canEdit && selected.isNullOrEmpty()) DButton("Assign observation to an engine", { editingEvent = test }, kind = ButtonKind.Secondary, enabled = sync.online)
        }
        Note("Each value retains its reference pressure. Different reference pressures are not interchangeable. These are records, not an airworthiness assessment.")
        GroupHeader("Oil changes")
        group?.rows("oilChanges").orEmpty().reversed().forEach { oil ->
            RecRow(oil.s("date") ?: "Undated oil change", listOfNotNull(oil.s("tach")?.let { "Tach $it" }, oil.s("hobbs")?.let { "Hobbs $it" }))
            SourceEntryButton(recs, oil)
        }
        GroupHeader("Oil service intervals")
        group?.rows("oilIntervals").orEmpty().forEach { interval ->
            val from = interval["from"] as? JsonObject
            val to = interval["to"] as? JsonObject
            RecRow("${interval.s("hours") ?: "—"} ${interval.s("meter") ?: ""} hours", listOf("${from?.s("date") ?: "?"} → ${to?.s("date") ?: "?"}"))
        }
        GroupHeader("Oil analysis samples")
        group?.rows("samples").orEmpty().forEach { sample ->
            RecRow(sample.s("sample_date") ?: "Undated sample", listOfNotNull(sample.s("lab"), sample.s("lab_comments"), sample.s("engine_hours")?.let { "Engine hours $it" }))
            (sample["elements_ppm"] as? JsonObject)?.let { elements -> Note(elements.entries.joinToString(" · ") { "${it.key} ${it.value} ppm" }) }
            sample.s("document_id")?.let { id -> DButton("Open oil report", { nav.open(Routes.of(Routes.DOC, id)) }, kind = ButtonKind.Quiet) }
        }
        if (recs.canEdit && selectedGroup != null) DButton("Add oil for this engine", { oiling = true }, kind = ButtonKind.Secondary)
        GroupHeader("Oil consumption")
        engineConsumption(group?.rows("additions").orEmpty())?.let { (basis, rate) ->
            Lede("Overall ${fmt1(rate)} $basis hours per quart")
            Note("Hours across the recorded interval divided by quarts added after its first reading. This uses one engine period and one meter basis; unrecorded oil is not included.")
        } ?: Note("At least two dated additions with consistent, increasing readings on the same meter are needed. No rate is inferred across engine or meter changes.")
        GroupHeader("Oil additions")
        group?.rows("additions").orEmpty().forEach { add ->
            RecRow("${add.s("quarts") ?: "—"} qt · ${add.s("added_date") ?: ""}", listOfNotNull(add.s("tach")?.let { "Tach $it" }, add.s("hobbs")?.let { "Hobbs $it" }, add.s("notes")))
        }
        data?.rows("needsReview").orEmpty().forEach { unresolved ->
            Note(unresolved.s("reason") ?: "An observation needs review.", alarm = true)
            SourceEntryButton(recs, unresolved)
        }
    }
    if (oiling) AddOilSheet(recs, data?.rows("groups")?.firstOrNull { it.s("segmentId") == selected }?.s("componentId")) { oiling = false }
    editingEvent?.let { event -> EngineEventSheet(recs, event.s("component_id") ?: "", event, onDone = { editingEvent = null }) { scope.launch { request.run { refresh() } } } }
    deletingEvent?.let { event -> Confirm("Delete this engine event?", "Source logbook entries are retained.", "Delete", {
        scope.launch { request.run { recs.api.ownerDelete(recs.id, "engine-history/${event.id}", event.s("updated_at") ?: error("Reload the engine history first.")); refresh() } }
    }, { deletingEvent = null }) }
    if (adding && selected != null) EngineEventSheet(recs, data?.rows("groups")?.firstOrNull { it.s("segmentId") == selected }?.s("componentId") ?: "", onDone = { adding = false }) { scope.launch { request.run { refresh() } } }
}

@Composable
private fun EngineEventSheet(recs: Recs, componentId: String, event: JsonObject? = null, onDone: () -> Unit, onSaved: () -> Unit) {
    val scope = rememberCoroutineScope()
    val request = remember { OwnerRequest() }
    val id = rememberSaveable(event?.id) { event?.s("id") ?: newId() }
    var engine by rememberSaveable { mutableStateOf(componentId) }
    val components = recs.watch { recs.store.records("component", recs.id).filter { com.mytaillog.core.domain.isCompleteEngine(it.s("name").orEmpty(), it.s("category"), it.s("component_kind"), it.s("model")) } }
    var kind by rememberSaveable { mutableStateOf(event?.s("kind") ?: if (event?.rows("readings")?.isNotEmpty() == true) "compression" else "overhaul") }
    var date by rememberSaveable { mutableStateOf<String?>(event?.s("event_date") ?: event?.s("date") ?: LocalDate.now().toString()) }
    var notes by rememberSaveable { mutableStateOf(event?.s("notes") ?: "") }
    var source by rememberSaveable { mutableStateOf(event?.s("source_entry_id") ?: event?.s("entryId")?.takeIf { recs.store.mirror.raw("log_entry", it) != null }) }
    var cylinders by rememberSaveable { mutableStateOf((event?.get("cylinders") as? JsonArray)?.joinToString { it.jsonPrimitive.content } ?: "") }
    var readings by rememberSaveable { mutableStateOf(event?.rows("readings")?.joinToString { "${it.s("psi")}/${it.s("reference")}" }?.takeIf { it.isNotEmpty() } ?: "") }
    var basis by rememberSaveable { mutableStateOf(event?.s("meter_basis") ?: "tach") }
    var meter by rememberSaveable { mutableStateOf(event?.s("meter_reading") ?: "") }
    var position by rememberSaveable { mutableStateOf("") }
    Sheet("Engine event", onDone, dirty = notes.isNotEmpty(), full = true) {
        Choice("Engine", components.map { it.id to (it.s("name") ?: it.id) }, engine) { engine = it }
        Choice("Event", listOf("overhaul" to "Overhaul", "cylinder_replacement" to "Cylinder replacement", "compression" to "Compression test"), kind) { kind = it }
        DateRow("Date", date, { date = it }, pastOnly = true)
        EntryChoice(recs, "Supporting entry", source, allowNone = "No source entry") { source = it }
        if (kind == "cylinder_replacement") Field("Cylinders replaced (e.g. 1, 3)", cylinders, { cylinders = it })
        if (kind == "compression") {
            Field("Readings in cylinder order", readings, { readings = it }, lines = 2, placeholder = "76/80, 77/80")
            Choice("Meter basis", listOf("tach" to "Tach", "hobbs" to "Hobbs"), basis) { basis = it }
            Field("Meter reading", meter, { meter = it }, number = true)
        }
        Field("Notes", notes, { notes = it }, lines = 3)
        request.error?.let { Note(it, alarm = true) }
        DButton("Save event", { scope.launch { request.run {
            val cylinderIds = if (kind == "cylinder_replacement") cylinders.split(',').map { it.trim().toIntOrNull() ?: error("Enter cylinder numbers separated by commas.") }.also { require(it.all { c -> c in 1..12 } && it.distinct().size == it.size) { "Use unique cylinder numbers from 1 to 12." } } else emptyList()
            val measured = if (kind == "compression") parseCompressionInput(readings) ?: error("Enter one pressure/reference pair per cylinder, for example 76/80, 77/80.") else emptyList()
            val body = json("id" to id, "component_id" to engine, "event_date" to date, "kind" to kind, "notes" to notes, "source_entry_id" to source, "cylinders" to JsonArray(cylinderIds.map(::JsonPrimitive)), "readings" to JsonArray(measured), "meter_basis" to basis, "meter_reading" to num(meter))
            if (event?.s("id") == null) recs.api.ownerMutation(recs.id, "engine-history", body)
            else recs.api.ownerUpdate(recs.id, "engine-history/$id", JsonObject(body + ("base" to JsonPrimitive(event.s("updated_at") ?: error("Reload this event before editing.")))))
            recs.kick(); onSaved(); onDone()
        } } }, enabled = recs.online && !request.busy && date != null && engine.isNotEmpty() && (kind != "compression" || parseCompressionInput(readings) != null))
        GroupHeader("Engine position")
        Field("Position (e.g. left, right, single)", position, { position = it })
        DButton("Save position", { scope.launch { request.run {
            recs.api.ownerMutation(recs.id, "engine-history/components/$engine/position", json("position" to position.trim()))
            onSaved(); onDone()
        } } }, kind = ButtonKind.Secondary, enabled = recs.online && !request.busy && position.isNotBlank() && engine.isNotEmpty())
    }
}

internal fun parseCompressionInput(value: String): List<JsonObject>? {
    val pairs = value.split(',').map { it.trim().split('/') }
    if (pairs.size !in 1..12) return null
    return pairs.mapIndexed { index, pair ->
        if (pair.size != 2) return null
        val psi = pair[0].trim().toDoubleOrNull() ?: return null
        val reference = pair[1].trim().toDoubleOrNull() ?: return null
        if (!psi.isFinite() || !reference.isFinite() || reference <= 0 || reference > 120 || psi < 0 || psi > reference) return null
        json("cylinder" to index + 1, "psi" to psi, "reference" to reference)
    }
}

@Composable
fun ExpensesScreen(recs: Recs) {
    val nav = LocalRecNav.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val request = remember(recs.id) { OwnerRequest() }
    var data by remember(recs.id) { mutableStateOf<JsonObject?>(null) }
    var adding by rememberSaveable { mutableStateOf(false) }
    var importing by rememberSaveable { mutableStateOf(false) }
    var editing by rememberSaveable(recs.id, stateSaver = optionalOwnerJsonSaver) { mutableStateOf<JsonObject?>(null) }
    var deleting by rememberSaveable(recs.id, stateSaver = optionalOwnerJsonSaver) { mutableStateOf<JsonObject?>(null) }
    var currency by rememberSaveable { mutableStateOf<String?>(null) }
    var from by rememberSaveable(recs.id) { mutableStateOf<String?>(LocalDate.now().withDayOfYear(1).toString()) }
    var through by rememberSaveable(recs.id) { mutableStateOf<String?>(LocalDate.now().toString()) }
    var appliedFrom by rememberSaveable(recs.id) { mutableStateOf<String?>(null) }
    var appliedThrough by rememberSaveable(recs.id) { mutableStateOf<String?>(null) }
    val sync by recs.store.sync.collectAsStateWithLifecycleCompat()
    suspend fun refresh(start: String? = appliedFrom, end: String? = appliedThrough) {
        data = null
        try { data = recs.api.ownerData(recs.id, expensePath(start, end)) }
        catch (e: Exception) { data = null; throw e }
    }
    LaunchedEffect(recs.id, sync.online) { if (sync.online && recs.isOwner) request.run { refresh() } else data = null }
    Board("Ownership costs", Section.Aircraft, back = "Aircraft" to nav.back) {
        if (!recs.isOwner) { Note("Financial records are private to the aircraft owner."); return@Board }
        RequestNote(request, sync.online, "Financial records are available online only. Reconnect to load this ledger.")
        Note("Recorded spending and reserve estimates are separate. Currencies are never combined. Financial data is loaded online and is not shared with record-room viewers.")
        DButton("Refresh costs", { scope.launch { request.run { refresh() } } }, kind = ButtonKind.Secondary, enabled = sync.online && !request.busy)
        if (data?.b("canManage") == true) {
            DButton("Add expense", { adding = true }, enabled = sync.online && !request.busy)
            DButton("Import expense CSV", { importing = true }, kind = ButtonKind.Secondary, enabled = sync.online && !request.busy)
            DButton("Export expense CSV", { scope.launch { request.run { openFile(context, recs.api.file(recs.id, expensePath(appliedFrom, appliedThrough, csv = true)), "${recs.tail} expenses.csv") } } }, kind = ButtonKind.Quiet, enabled = sync.online && !request.busy)
        }
        val totals = data?.rows("totals").orEmpty()
        Choice("Currency", listOf("" to "All currencies (separate totals)") + totals.mapNotNull { it.s("currency") }.distinct().map { it to it }, currency ?: "") { currency = it }
        DateRow("From", from, { from = it }, pastOnly = true)
        DateRow("Through", through, { through = it }, pastOnly = true)
        DButton("Apply period", {
            val start = from; val end = through
            scope.launch { request.run { appliedFrom = start; appliedThrough = end; refresh(start, end) } }
        }, kind = ButtonKind.Secondary, enabled = sync.online && !request.busy && validExpensePeriod(from, through))
        if (appliedFrom != null) DButton("Show all dates", {
            scope.launch { request.run { appliedFrom = null; appliedThrough = null; refresh(null, null) } }
        }, kind = ButtonKind.Quiet, enabled = sync.online && !request.busy)
        Note(if (appliedFrom != null) "Applied period: $appliedFrom through $appliedThrough. CSV export uses these dates." else "Showing all dates. Apply a period to calculate cost per hour from its reviewed meter readings.")
        val expenses = data?.rows("expenses").orEmpty().filter { currency.isNullOrEmpty() || it.s("currency") == currency }
        val currencies = expenses.mapNotNull { it.s("currency") }.distinct().sorted()
        currencies.forEach { code ->
            val rows = expenses.filter { it.s("currency") == code }
            val actual = rows.filter { it.s("basis") == "actual" }.sumOf { it.s("amount_minor")?.toLongOrNull() ?: 0L }
            val reserve = rows.filter { it.s("basis") == "reserve" }.sumOf { it.s("amount_minor")?.toLongOrNull() ?: 0L }
            GroupHeader(code)
            Lede("Recorded ${moneyMinor(actual, code)} · reserves ${moneyMinor(reserve, code)}")
            val rate = totals.firstOrNull { it.s("currency") == code }?.d("actual_per_hour_minor")
            if (appliedFrom != null && rate != null && rate.isFinite()) Note("About $code ${BigDecimal.valueOf(rate).movePointLeft(currencyDigits(code)).setScale(currencyDigits(code), java.math.RoundingMode.HALF_UP).toPlainString()} per measured hour · spending within the measured dates")
        }
        val denominator = data?.get("denominator") as? JsonObject
        Note(denominator?.s("source") ?: "Cost per hour needs at least two verified readings within this period. Meter replacements cannot be used as a usage interval.")
        if (appliedFrom != null && denominator?.d("hours") != null) Note("${fmt1(denominator.d("hours"))} ${denominator.s("meter") ?: ""} hours · ${denominator.s("from") ?: ""} → ${denominator.s("to") ?: ""}")
        if (data != null && expenses.isEmpty()) Empty("No expenses in this period. Add one or import a CSV.")
        expenses.forEach { expense ->
            RecRow("${expense.s("currency")} ${moneyMinor(expense.s("amount_minor")?.toLongOrNull() ?: 0, expense.s("currency") ?: "USD")} · ${expense.s("vendor") ?: expense.s("category")}", listOfNotNull(expense.s("date"), expense.s("category"), expense.s("basis"), expense.s("cost_type"), expense.s("payer"), expense.s("notes")), onClick = { editing = expense },
                menu = listOf("Edit expense" to { editing = expense }, "Delete expense" to { deleting = expense }))
            expense.s("document_id")?.let { id -> DButton("Open invoice", { nav.open(Routes.of(Routes.DOC, id)) }, kind = ButtonKind.Quiet) }
            expense.s("log_entry_id")?.let { id -> DButton("Open maintenance entry", { nav.open(Routes.of(Routes.SOURCE_ENTRY, id)) }, kind = ButtonKind.Quiet) }
        }
    }
    if (adding) ExpenseForm(recs, references = data, onDone = { adding = false }) { scope.launch { request.run { refresh() } } }
    editing?.let { expense -> ExpenseForm(recs, expense, references = data, onDone = { editing = null }) { scope.launch { request.run { refresh() } } } }
    deleting?.let { expense -> Confirm("Delete this expense?", "This removes the ledger record. The original document is retained.", "Delete", {
        scope.launch { request.run { recs.api.ownerDelete(recs.id, "expenses/${expense.id}", expense.s("updated_at") ?: error("Reload this expense before deleting.")); refresh() } }
    }, { deleting = null }) }
    if (importing) ExpenseImport(recs, onDone = { importing = false }) { scope.launch { request.run { refresh() } } }
}

@Composable
private fun ExpenseForm(recs: Recs, expense: JsonObject? = null, references: JsonObject? = null, onDone: () -> Unit, onSaved: () -> Unit) {
    val scope = rememberCoroutineScope()
    val request = remember { OwnerRequest() }
    val id = rememberSaveable(expense?.id) { expense?.id ?: newId() }
    var date by rememberSaveable { mutableStateOf<String?>(expense?.s("date") ?: LocalDate.now().toString()) }
    var amount by rememberSaveable { mutableStateOf(expense?.s("amount_minor")?.toLongOrNull()?.let { moneyMinor(it, expense.s("currency") ?: "USD") } ?: "") }
    var currency by rememberSaveable { mutableStateOf(expense?.s("currency") ?: "USD") }
    var category by rememberSaveable { mutableStateOf(expense?.s("category") ?: "maintenance") }
    var costType by rememberSaveable { mutableStateOf(expense?.s("cost_type") ?: "variable") }
    var basis by rememberSaveable { mutableStateOf(expense?.s("basis") ?: "actual") }
    var vendor by rememberSaveable { mutableStateOf(expense?.s("vendor") ?: "") }
    var payer by rememberSaveable { mutableStateOf(expense?.s("payer") ?: "") }
    var notes by rememberSaveable { mutableStateOf(expense?.s("notes") ?: "") }
    var entry by rememberSaveable { mutableStateOf(expense?.s("log_entry_id")) }
    var document by rememberSaveable { mutableStateOf(expense?.s("document_id")) }
    val docs = recs.watch { recs.store.records("document", recs.id) }
    val documentOptions = (references?.rows("documents").orEmpty().map { it.id to (it.s("title") ?: it.id) } + docs.map { it.id to (it.s("title") ?: it.id) }).distinctBy { it.first }
    val entryOptions = (references?.rows("entries").orEmpty().map { it.id to listOfNotNull(it.s("date"), it.s("description")?.take(80)).joinToString(" · ") } + recs.entries()).distinctBy { it.first }
    Sheet(if (expense == null) "Add expense" else "Edit expense", onDone, dirty = amount.isNotEmpty() || vendor.isNotEmpty(), full = true) {
        Note("Negative amounts record refunds. Reserve estimates are kept separate from actual spending.")
        DateRow("Date", date, { date = it }, pastOnly = true)
        Choice("Entry type", listOf("charge" to "Expense", "refund" to "Refund"), if (amount.startsWith('-')) "refund" else "charge") { amount = if (it == "refund") "-" + amount.trimStart('-') else amount.trimStart('-') }
        Field("Amount", amount, { amount = it }, number = true, signed = true)
        Choice("Currency", expenseCurrencies.map { it to it }, currency) { currency = it }
        Choice("Category", listOf("maintenance", "fuel", "oil", "insurance", "hangar", "other").map { it to it.replaceFirstChar(Char::uppercase) }, category) { category = it }
        Choice("Cost type", listOf("fixed" to "Fixed", "variable" to "Variable"), costType) { costType = it }
        Choice("Basis", listOf("actual" to "Recorded spending", "reserve" to "Reserve estimate"), basis) { basis = it }
        Field("Vendor", vendor, { vendor = it })
        Field("Paid by", payer, { payer = it })
        Choice("Invoice or receipt", listOf("" to "No attachment") + documentOptions, document ?: "") { document = it.ifEmpty { null } }
        Choice("Maintenance entry", listOf("" to "No linked entry") + entryOptions, entry ?: "") { entry = it.ifEmpty { null } }
        Field("Notes", notes, { notes = it }, lines = 3)
        request.error?.let { Note(it, alarm = true) }
        DButton("Save expense", { scope.launch { request.run {
            val minor = expenseMinor(amount, currency) ?: error("Use the correct number of decimal places for $currency.")
            val body = json("id" to id, "date" to date, "currency" to currency, "amount_minor" to minor, "category" to category, "cost_type" to costType, "basis" to basis, "vendor" to vendor.trim().ifEmpty { null }, "payer" to payer.trim().ifEmpty { null }, "notes" to notes.trim().ifEmpty { null }, "document_id" to document, "log_entry_id" to entry)
            if (expense == null) recs.api.ownerMutation(recs.id, "expenses", body)
            else recs.api.ownerUpdate(recs.id, "expenses/$id", JsonObject(body + ("base" to JsonPrimitive(expense.s("updated_at") ?: error("Reload this expense before editing.")))))
            onSaved(); onDone()
        } } }, enabled = recs.online && !request.busy && date != null && expenseMinor(amount, currency) != null && currency in expenseCurrencies)
    }
}

@Composable
private fun ExpenseImport(recs: Recs, onDone: () -> Unit, onSaved: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val request = remember { OwnerRequest() }
    var csv by rememberSaveable { mutableStateOf("") }
    var result by rememberSaveable { mutableStateOf<String?>(null) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) scope.launch { request.run {
            val file = withContext(Dispatchers.IO) { readPicked(context, uri) } ?: error("Could not read this CSV.")
            require(file.tooBig == null && file.bytes.size <= 1024 * 1024) { "Choose a CSV no larger than 1 MB." }
            csv = file.bytes.toString(Charsets.UTF_8)
        } }
    }
    Sheet("Import expenses", onDone, dirty = csv.isNotBlank(), full = true) {
        Note("Use columns date,currency,amount_minor,category,cost_type,basis,vendor,notes,payer. Amounts are integer minor units for their currency (USD cents, JPY yen). Import repeats are detected by the server.")
        DButton("Choose CSV", { picker.launch(arrayOf("text/csv", "text/plain", "application/octet-stream")) }, kind = ButtonKind.Secondary, enabled = !request.busy)
        Field("CSV contents", csv, { csv = it.take(1024 * 1024) }, lines = 8)
        request.error?.let { Note(it, alarm = true) }
        result?.let { Note(it) }
        DButton("Import reviewed rows", { scope.launch { request.run {
            val answer = recs.api.ownerMutation(recs.id, "expenses/import", json("csv" to csv))
            result = "Accepted ${answer.s("count") ?: "0"} rows. Repeated imports are safe to retry."
            csv = ""; onSaved()
        } } }, enabled = recs.online && !request.busy && csv.isNotBlank())
    }
}


@Composable
private fun InboxProposalFields(kind: String, value: JsonObject, onChange: (JsonObject) -> Unit) {
    fun changed(key: String, input: JsonElement) = onChange(JsonObject(value + (key to input)))
    when (kind) {
        "invoice" -> {
            DateRow("Invoice date", value.s("date"), { changed("date", it?.let(::JsonPrimitive) ?: JsonNull) }, pastOnly = true)
            Choice("Currency", expenseCurrencies.map { it to it }, value.s("currency") ?: "USD") { changed("currency", JsonPrimitive(it)) }
            var amount by remember(value.s("currency")) { mutableStateOf(value.s("amount_minor")?.toLongOrNull()?.let { moneyMinor(it, value.s("currency") ?: "USD") } ?: "") }
            Field("Invoice amount", amount, { amount = it; changed("amount_minor", expenseMinor(it, value.s("currency") ?: "USD")?.let(::JsonPrimitive) ?: JsonNull) }, number = true, signed = true)
            Choice("Category", listOf("maintenance", "fuel", "oil", "insurance", "hangar", "other").map { it to it }, value.s("category") ?: "maintenance") { changed("category", JsonPrimitive(it)) }
            Field("Vendor", value.s("vendor") ?: "", { changed("vendor", JsonPrimitive(it)) })
            Field("Notes", value.s("notes") ?: "", { changed("notes", JsonPrimitive(it)) }, lines = 3)
        }
        "oil_report" -> {
            Field("Laboratory", value.s("lab") ?: "", { changed("lab", JsonPrimitive(it)) })
            Field("Oil type", value.s("oil_type") ?: "", { changed("oil_type", JsonPrimitive(it)) })
            Field("Lab comments", value.s("lab_comments") ?: "", { changed("lab_comments", JsonPrimitive(it)) }, lines = 3)
            val samples = value.rows("samples")
            if (samples.isEmpty()) Note("Analyze the report to propose its dated samples before approval.")
            samples.forEachIndexed { index, sample ->
                GroupHeader("Sample ${index + 1}")
                fun update(key: String, input: JsonElement) {
                    changed("samples", JsonArray(samples.mapIndexed { i, row -> if (i == index) JsonObject(row + (key to input)) else row }))
                }
                DateRow("Sample date", sample.s("sample_date"), { update("sample_date", it?.let(::JsonPrimitive) ?: JsonNull) }, pastOnly = true)
                listOf("oil_hours" to "Oil hours", "engine_hours" to "Engine hours", "oil_added_quarts" to "Oil added (qt)").forEach { (key, label) ->
                    Field(label, sample.s(key) ?: "", { update(key, num(it)?.let(::JsonPrimitive) ?: JsonNull) }, number = true)
                }
                listOf("elements_ppm" to "ppm", "oil_properties" to "").forEach { (collection, unit) ->
                    val values = sample[collection] as? JsonObject ?: json()
                    values.forEach { (key, amount) ->
                        Field("$key $unit".trim(), (amount as? JsonPrimitive)?.contentOrNull ?: "", { input -> update(collection, JsonObject(values + (key to (num(input)?.let(::JsonPrimitive) ?: JsonNull)))) }, number = true)
                    }
                }
            }
        }
        "logbook" -> Note("Choose the destination logbook. Its pages will enter the existing extraction and verification queue; this does not confirm entries.")
        else -> Note("Choose a destination or leave this document unclassified for later.")
    }
}


internal fun engineConsumption(additions: List<JsonObject>): Pair<String, Double>? {
    if (additions.size < 2 || additions.any { it.s("added_date") == null }) return null
    val rows = additions.sortedBy { it.s("added_date") }
    val basis = listOf("tach", "hobbs").firstOrNull { key -> rows.all { it.d(key)?.let { n -> n.isFinite() && n >= 0 } == true } } ?: return null
    val readings = rows.map { it.d(basis)!! }
    if (readings.zipWithNext().any { (a, b) -> b <= a }) return null
    val amounts = rows.drop(1).map { it.d("quarts") ?: return null }
    if (amounts.any { !it.isFinite() || it <= 0 }) return null
    return basis to ((readings.last() - readings.first()) / amounts.sum())
}

internal fun connectsCompression(from: String?, to: String?, cylinder: Int, events: List<JsonObject>): Boolean {
    if (from == null || to == null) return false
    return events.none { event -> event.s("kind") == "cylinder_replacement" && event.s("event_date")?.let { it in from..to } == true &&
        (event["cylinders"] as? JsonArray).orEmpty().any { (it as? JsonPrimitive)?.contentOrNull?.toIntOrNull() == cylinder } }
}

@Composable
private fun CompressionHistoryChart(tests: List<JsonObject>, events: List<JsonObject>) {
    val ink = MyTailLogTheme.colors.ink
    val rule = MyTailLogTheme.colors.rule2
    val textMeasurer = rememberTextMeasurer()
    val valueStyle = MaterialTheme.typography.labelSmall.copy(color = ink)
    val sorted = tests.sortedBy { it.s("date") }
    val series = sorted.map { it.rows("readings") }
    val cylinders = series.flatten().mapNotNull { it.s("cylinder")?.toIntOrNull() }.distinct().sorted()
    var selected by rememberSaveable { mutableStateOf("1") }
    val cylinder = selected.toIntOrNull()?.takeIf { it in cylinders } ?: cylinders.firstOrNull() ?: return
    if (series.size < 2) return
    Choice("Chart cylinder", cylinders.map { it.toString() to "Cylinder $it" }, cylinder.toString()) { selected = it }
    val references = series.flatten().filter { it.s("cylinder")?.toIntOrNull() == cylinder }.mapNotNull { it.d("reference") }.distinct().sorted()
    references.forEach { reference ->
        val values = series.mapNotNull { row -> row.firstOrNull { it.s("cylinder")?.toIntOrNull() == cylinder && it.d("reference") == reference }?.d("psi") }
        val lower = ((values.minOrNull() ?: 0.0) - 10).coerceAtLeast(0.0)
        Note("Cylinder $cylinder · reference ${fmtNum(reference)} psi · scale ${fmtNum(lower)}–${fmtNum(reference)} psi")
        Row(Modifier.fillMaxWidth()) {
        Column(Modifier.width(36.dp).height(140.dp).padding(vertical = 8.dp), verticalArrangement = Arrangement.SpaceBetween) { Note(fmtNum(reference)); Note(fmtNum(lower)) }
        Canvas(Modifier.weight(1f).height(140.dp).padding(vertical = 8.dp).semantics {
            contentDescription = "Cylinder $cylinder compression history with ${fmtNum(reference)} psi reference. Exact readings and dates follow. Lines break at cylinder replacement. Different references use separate charts."
        }) {
            drawLine(rule, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx())
            drawLine(rule, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx())
            var previous: Offset? = null
            var previousDate: String? = null
            series.forEachIndexed { index, readings ->
                val reading = readings.firstOrNull { it.s("cylinder")?.toIntOrNull() == cylinder && it.d("reference") == reference }
                val psi = reading?.d("psi")
                val date = sorted[index].s("date")
                if (psi == null || date == null) { previous = null; previousDate = null; return@forEachIndexed }
                val point = Offset(4.dp.toPx() + index.toFloat() / (series.size - 1) * (size.width - 8.dp.toPx()), size.height * (1f - ((psi - lower) / (reference - lower)).toFloat().coerceIn(0f, 1f)))
                previous?.takeIf { connectsCompression(previousDate, date, cylinder, events) }?.let { drawLine(ink, it, point, 2.dp.toPx()) }
                drawCircle(ink, 3.dp.toPx(), point)
                if (index == 0 || index == series.lastIndex) {
                    val label = textMeasurer.measure(fmtNum(psi), valueStyle)
                    drawText(label, topLeft = Offset((point.x - label.size.width / 2).coerceIn(0f, (size.width - label.size.width).coerceAtLeast(0f)), (point.y + 6.dp.toPx()).coerceAtMost((size.height - label.size.height).coerceAtLeast(0f))))
                }
                previous = point
                previousDate = date
            }
        }
        }
        Row(Modifier.fillMaxWidth().padding(start = 36.dp)) { Note(sorted.firstOrNull()?.s("date") ?: "", Modifier.weight(1f)); Note(sorted.lastOrNull()?.s("date") ?: "") }
    }
}

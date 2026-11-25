package com.mytaillog.app

import android.app.Activity
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.mytaillog.core.api.AircraftRole
import com.mytaillog.core.api.Books
import com.mytaillog.design.ButtonKind
import com.mytaillog.design.DButton
import com.mytaillog.design.GroupHeader
import com.mytaillog.design.LightColors
import com.mytaillog.design.LucideIcons
import com.mytaillog.design.MyTailLogTheme
import com.mytaillog.design.PhoneRow
import com.mytaillog.design.Section
import com.mytaillog.design.StateLayerIndication
import com.mytaillog.design.Tokens
import com.mytaillog.design.focusRing
import com.mytaillog.design.line
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import java.time.Instant
import java.time.LocalDate

// Share (06 M-SHARE-01..03, T- Share in the binder): start from who receives it, make a read-only record room
// link, show its QR, follow its opens, revoke it; people with access; the summary, dossier and due list files.
// Links and files are made on the server, so they need signal (14 D1); the last list stays on the phone so a
// link's QR and copy still work offline.

/** The record room links of the open aircraft: this phone's copy at once, the server's when there is signal. */
class RoomsState(private val recs: Recs) {
    private val file = File(recs.store.dir, "rooms/${recs.id}.json")
    var rooms by mutableStateOf(runCatching { parseRooms(file.readText()) }.getOrDefault(emptyList()))
        private set

    suspend fun refresh() {
        val t = recs.api.roomsJson(recs.id)
        if (!isRoomList(t)) return
        file.parentFile?.mkdirs()
        file.writeText(t)
        rooms = parseRooms(t)
    }

    /** What a create or a change answered, laid over the list, so the screens follow even when the list can't be re-read. */
    fun put(room: Room) { rooms = listOf(room) + rooms.filter { it.id != room.id } }

    fun changed(o: kotlinx.serialization.json.JsonObject) {
        val r = rooms.firstOrNull { it.id == o.s("id") } ?: return
        val revoked = o.s("revokedAt")
        put(r.copy(expiresAt = o.s("expiresAt") ?: r.expiresAt, revokedAt = revoked, active = revoked == null && Instant.parse(o.s("expiresAt") ?: r.expiresAt).isAfter(Instant.now())))
    }

    companion object {
        private val open = mutableMapOf<String, RoomsState>()
        /** One list per aircraft for every Share screen. */
        fun of(recs: Recs) = synchronized(open) { open.getOrPut("${recs.store.dir.path}/${recs.id}") { RoomsState(recs) } }
    }
}

@Composable
fun rememberRooms(recs: Recs): RoomsState {
    val rooms = remember(recs.id) { RoomsState.of(recs) }
    val online = recs.store.sync.collectAsStateWithLifecycleCompat().value.online
    LaunchedEffect(recs.id, online) { if (online && recs.isOwner) runCatching { rooms.refresh() } }
    return rooms
}

private val draftSaver = Saver<RoomDraft?, String>(
    save = { d -> d?.let { json("a" to it.audience.name, "l" to it.label, "d" to it.days, "s" to it.summary, "c" to it.scans, "q" to it.squawks, "b" to JsonArray(it.logbookIds.map(::JsonPrimitive)), "o" to JsonArray(it.documentIds.map(::JsonPrimitive))).toString() } ?: "" },
    restore = { s ->
        runCatching {
            val o = Json.parseToJsonElement(s).jsonObject
            fun ids(k: String) = (o[k] as JsonArray).map { it.jsonPrimitive.content }.toSet()
            RoomDraft(Audience.valueOf(o.s("a")!!), o.s("l") ?: "", o.d("d")!!.toInt(), o.b("s"), ids("b"), o.b("c"), ids("o"), o.b("q"))
        }.getOrNull()
    },
)

private data class Pick(val audience: Audience, val title: Int, val sub: Int, val icon: androidx.compose.ui.graphics.vector.ImageVector)

private val PICKS = listOf(
    Pick(Audience.Ia, R.string.share_ia, R.string.share_ia_sub, LucideIcons.ClipboardCheck),
    Pick(Audience.Buyer, R.string.share_buyer, R.string.share_buyer_sub, LucideIcons.Scale),
    Pick(Audience.Insurer, R.string.share_insurer, R.string.share_insurer_sub, LucideIcons.ShieldCheck),
    Pick(Audience.People, R.string.share_people, R.string.share_people_sub, LucideIcons.Users),
)

/**
 * M-SHARE-01 Who is it for: four people to pick from; for the first three, a preview of what the room opens on,
 * what it holds (changeable), and **Make the link**. The fourth invites a co-owner or mechanic instead.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ShareHome(recs: Recs, status: StatusHost?, books: Books?, preset: Audience? = null, onMade: (String) -> Unit, onLinks: () -> Unit, onReview: () -> Unit) {
    val c = MyTailLogTheme.colors
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val sync by recs.store.sync.collectAsStateWithLifecycleCompat()
    val rooms = rememberRooms(recs)
    val logbooks = recs.watch { recs.store.records("logbook", recs.id).filter { it.s("deleted_at") == null } }
    val documents = recs.watch { recs.store.records("document", recs.id).filter { !it.pending } }
    var draft by rememberSaveable(recs.id, stateSaver = draftSaver) { mutableStateOf(preset?.let { RoomDraft.of(it, recs.tail, logbooks.map { b -> b.id }, documents.map { d -> d.id }) }) }
    var options by rememberSaveable { mutableStateOf(false) }
    var inviting by rememberSaveable { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var toast by remember { mutableStateOf<Toast?>(null) }
    val viewer = recs.aircraft.role == AircraftRole.Viewer || recs.aircraft.aircraft.isDemo
    val d = draft
    Board(
        stringResource(R.string.section_share), Section.Share, status = status, toast = toast, onToastDone = { toast = null },
        footer = if (d == null || viewer || !recs.isOwner) null else ({
            DButton(
                stringResource(R.string.share_make_link), {
                    busy = true; error = null
                    scope.launch {
                        try {
                            val made = recs.api.createRoom(recs.id, d.body())
                            val id = made.s("id")!!
                            rooms.put(Room(id, d.label.trim(), d.audience.key, made.s("url"), Instant.now().toString(), made.s("expiresAt")!!, null, true, 0, null, d.logbookIds.size, d.documentIds.size, d.scans, d.summary, d.squawks, d.audience.mapWindow))
                            runCatching { rooms.refresh() }
                            onMade(id)
                        } catch (e: CancellationException) { throw e } catch (e: Exception) { error = e.message } finally { busy = false }
                    }
                },
                enabled = sync.online && !busy && d.label.isNotBlank() && d.holdsSomething, icon = LucideIcons.Link,
                busyText = if (busy) stringResource(R.string.share_making) else null,
            )
            if (!sync.online) Note(stringResource(R.string.share_needs_signal))
        }),
    ) {
        if (!viewer) {
            Text(stringResource(R.string.share_who), color = c.ink, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight(800)), modifier = Modifier.padding(bottom = Tokens.Space.s2).semantics { heading() })
            PICKS.forEach { p ->
                AudienceRow(p, selected = d?.audience == p.audience) {
                    if (p.audience == Audience.People) inviting = true
                    else draft = RoomDraft.of(p.audience, recs.tail, logbooks.map { it.id }, documents.map { it.id })
                }
            }
        }
        if (d != null && !viewer) {
            if (!recs.isOwner) Note(stringResource(R.string.share_owner_only), Modifier.padding(top = Tokens.Space.s3))
            RoomPreview(recs, d, books)
            status?.ui?.snapshot?.body?.counts?.pagesToReview?.takeIf { it > 0 }?.let { n ->
                Well {
                    Note(androidx.compose.ui.res.pluralStringResource(R.plurals.share_unconfirmed, n, n))
                    DButton(stringResource(R.string.share_review), onReview, kind = ButtonKind.Secondary)
                }
            }
            PhoneRow(stringResource(if (options) R.string.share_hide_options else R.string.share_options), { options = !options })
            if (options) {
                Field(stringResource(R.string.share_label), d.label, { draft = d.copy(label = it.take(80)) })
                Toggle(stringResource(R.string.share_include_summary), d.summary) { draft = d.copy(summary = it) }
                if (logbooks.isNotEmpty()) {
                    Note(stringResource(R.string.share_logbooks), Modifier.padding(top = Tokens.Space.s2))
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s2)) {
                        logbooks.forEach { b ->
                            val on = b.id in d.logbookIds
                            Chip(bookName(b.s("type") ?: "logbook", b.s("title")), on) { draft = d.copy(logbookIds = if (on) d.logbookIds - b.id else d.logbookIds + b.id) }
                        }
                    }
                    Toggle(stringResource(R.string.share_include_scans), d.scans) { draft = d.copy(scans = it) }
                }
                if (documents.isNotEmpty()) {
                    Note(stringResource(R.string.share_documents), Modifier.padding(top = Tokens.Space.s2))
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s2)) {
                        documents.forEach { doc ->
                            val on = doc.id in d.documentIds
                            Chip(doc.s("title") ?: docTypeName(doc.s("type")), on) { draft = d.copy(documentIds = if (on) d.documentIds - doc.id else d.documentIds + doc.id) }
                        }
                    }
                }
                Toggle(stringResource(R.string.share_include_squawks), d.squawks) { draft = d.copy(squawks = it) }
                Note(stringResource(R.string.share_expires), Modifier.padding(top = Tokens.Space.s2))
                Segmented(ROOM_DAYS.map { "$it d" }, ROOM_DAYS.indexOf(d.days)) { draft = d.copy(days = ROOM_DAYS[it]) }
            }
            if (!d.holdsSomething) Note(stringResource(R.string.share_holds_nothing), alarm = true)
            error?.let { Note(it, Modifier.padding(top = Tokens.Space.s2), alarm = true) }
        }
        // Below the fold: live links and people, then the files.
        if (recs.isOwner) {
            val live = rooms.rooms.count { it.active }
            PhoneRow(androidx.compose.ui.res.pluralStringResource(R.plurals.share_live_links, live, live), onLinks)
            if (live > 0) rooms.rooms.firstOrNull { it.active }?.let { Note("${it.label} · ${roomLine(it)}") }
        }
        FileButtons(recs, sync.online, viewer) { toast = Toast(it) }
    }
    if (inviting) InviteSheet(recs, sync.online, onDone = { inviting = false }) { toast = Toast(it) }
}

@Composable
private fun AudienceRow(p: Pick, selected: Boolean, onClick: () -> Unit) {
    val c = MyTailLogTheme.colors
    Row(
        Modifier.fillMaxWidth().heightIn(min = 64.dp).focusRing()
            .selectable(selected, role = Role.RadioButton, interactionSource = null, indication = StateLayerIndication(c.ink), onClick = onClick)
            .padding(vertical = Tokens.Space.s2),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s3),
    ) {
        Box(Modifier.size(40.dp).clip(RoundedCornerShape(Tokens.Radius.m)).background(c.leaf2), contentAlignment = Alignment.Center) {
            Icon(p.icon, null, tint = c.ink, modifier = Modifier.size(20.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(stringResource(p.title), color = c.ink, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight(700)))
            Text(stringResource(p.sub), color = c.ink2, style = MaterialTheme.typography.bodyMedium)
        }
        if (selected) Icon(LucideIcons.Check, null, tint = c.ink, modifier = Modifier.size(20.dp))
    }
}

/**
 * What the recipient opens first (M-SHARE-01 preview): the records as of today, a whole-life strip with the
 * marked gap, the room's tabs, and that it is read only.
 */
@Composable
private fun RoomPreview(recs: Recs, d: RoomDraft, books: Books?) {
    val c = MyTailLogTheme.colors
    val measurer = rememberTextMeasurer()
    val label = MaterialTheme.typography.labelSmall.copy(color = c.ink3, fontWeight = FontWeight(600))
    val today = LocalDate.now()
    val map = books?.map
    val gap = map?.gaps?.filter { it.status != "explained" }?.maxByOrNull { java.time.temporal.ChronoUnit.DAYS.between(LocalDate.parse(it.from), LocalDate.parse(it.to)) }
    Note(stringResource(R.string.share_opens_first, stringResource(recipient(d.audience))), Modifier.padding(top = Tokens.Space.s4))
    Well {
        Text(stringResource(R.string.share_as_of, recs.tail, longDate(today.toString())), color = c.ink, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight(700)))
        if (d.audience == Audience.Ia) {
            Note(stringResource(R.string.share_opens_line_ahead))
        } else if (map != null) {
            val from = LocalDate.parse(map.range.from.take(10))
            val start = if (d.audience == Audience.Insurer) today.minusYears(5) else from
            val span = java.time.temporal.ChronoUnit.DAYS.between(start, today).coerceAtLeast(1).toFloat()
            Canvas(Modifier.fillMaxWidth().height(64.dp).semantics { contentDescription = "Whole-life map, ${start.year} to today" + (gap?.let { ", gap ${it.from.take(4)} to ${it.to.take(4)}" } ?: "") }) {
                val y = 22.dp.toPx()
                fun x(date: String) = (java.time.temporal.ChronoUnit.DAYS.between(start, LocalDate.parse(date.take(10))).coerceIn(0, span.toLong()) / span) * size.width
                drawLine(c.line("airframe"), Offset(0f, y), Offset(size.width, y), 3.dp.toPx())
                gap?.let { g ->
                    drawLine(c.leaf2, Offset(x(g.from), y), Offset(x(g.to), y), 5.dp.toPx())
                    drawLine(c.ink3, Offset(x(g.from), y), Offset(x(g.to), y), 2.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 4.dp.toPx())))
                }
                val first = measurer.measure(start.year.toString(), label)
                drawText(first, topLeft = Offset(0f, y + 12.dp.toPx()))
                val end = measurer.measure("Today", label)
                drawText(end, topLeft = Offset(size.width - end.size.width, y + 12.dp.toPx()))
            }
        }
        Note(stringResource(R.string.share_room_tabs))
        Note(gap?.let { stringResource(R.string.share_gap_marked, it.from.take(4), it.to.take(4)) } ?: stringResource(R.string.share_read_only))
    }
}

private fun recipient(a: Audience) = when (a) { Audience.Ia -> R.string.share_your_ia; Audience.Buyer -> R.string.share_the_buyer; Audience.Insurer -> R.string.share_the_insurer; Audience.People -> R.string.share_they }

/** A labelled switch row: the whole row toggles, so TalkBack reads the label with the state. */
@Composable
internal fun Toggle(label: String, on: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    val c = MyTailLogTheme.colors
    Row(
        Modifier.fillMaxWidth().heightIn(min = 52.dp)
            .toggleable(on, enabled = enabled, role = androidx.compose.ui.semantics.Role.Switch, onValueChange = onChange),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Lede(label, Modifier.weight(1f))
        Switch(on, null, enabled = enabled, colors = SwitchDefaults.colors(checkedTrackColor = c.ink, checkedThumbColor = c.leaf))
    }
}

@Composable
private fun Chip(label: String, on: Boolean, onClick: () -> Unit) {
    val c = MyTailLogTheme.colors
    FilterChip(
        on, onClick, { Text(label) }, modifier = Modifier.heightIn(min = 44.dp),
        leadingIcon = if (on) ({ Icon(LucideIcons.Check, null, modifier = Modifier.size(16.dp)) }) else null,
        colors = FilterChipDefaults.filterChipColors(containerColor = c.leaf, labelColor = c.ink, selectedContainerColor = c.ink, selectedLabelColor = c.leaf, selectedLeadingIconColor = c.leaf),
    )
}

/** Share a summary (PDF), the pre-buy dossier (PDF) and the due list (CSV): made by the server, so online only. */
@Composable
private fun FileButtons(recs: Recs, online: Boolean, viewer: Boolean, onToast: (String) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf<String?>(null) }
    val files = buildList {
        add(Triple("summary", R.string.share_summary, "${recs.tail} maintenance summary.pdf"))
        if (!viewer) add(Triple("dossier", R.string.share_dossier, "${recs.tail} pre-buy dossier.pdf"))
        add(Triple("export?type=due", R.string.share_due_csv, "${recs.tail} due list.csv"))
    }
    GroupHeader(stringResource(R.string.share_files))
    val nav = LocalRecNav.current
    DButton("Prepare annual packet", { nav.open(Routes.ANNUAL_PACKET) }, kind = ButtonKind.Secondary, enabled = online)
    files.forEach { (path, label, name) ->
        DButton(
            stringResource(label), {
                busy = path
                scope.launch {
                    try { openFile(context, recs.api.file(recs.id, path), name) } catch (e: CancellationException) { throw e } catch (e: Exception) { onToast(e.message ?: recs.str(R.string.share_file_failed)) } finally { busy = null }
                }
            },
            kind = ButtonKind.Quiet, icon = LucideIcons.Download, enabled = online && busy == null, busyText = if (busy == path) stringResource(R.string.share_making) else null,
        )
    }
    if (!online) Note(stringResource(R.string.share_files_need_signal))
}

/** Writes [bytes] under cache/share and opens it: a PDF in the viewer (print and share from there), the CSV in the share sheet. */
internal fun sharedFile(context: Context, name: String) = File(File(context.cacheDir, "share").apply { mkdirs() }, name.replace(Regex("[^A-Za-z0-9._ -]"), "_"))

fun openFile(context: Context, bytes: ByteArray, name: String) {
    val file = sharedFile(context, name)
    file.writeBytes(bytes)
    openFile(context, file)
}

fun openFile(context: Context, f: File) {
    val name = f.name
    val uri = androidx.core.content.FileProvider.getUriForFile(context, context.packageName + ".share", f)
    val mime = when {
        name.endsWith(".pdf", true) -> "application/pdf"
        name.endsWith(".zip", true) -> "application/zip"
        name.endsWith(".csv", true) -> "text/csv"
        else -> java.net.URLConnection.guessContentTypeFromName(name) ?: "application/octet-stream"
    }
    val intent = if (mime == "application/pdf" || mime.startsWith("image/")) Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime)
        else Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, uri)
    context.startActivity(Intent.createChooser(intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION), name))
}

// --- Link made, and one link (M-SHARE-02, M-SHARE-03 link detail) -------------------------------------------

/**
 * One link: its QR (white in dark mode too), the link to copy, when it ends, what it opens on and holds, and
 * **Send the link**. Opened from the list it also shows the open log, **Change expiry** and **Revoke link**.
 */
@Composable
fun LinkScreen(recs: Recs, roomId: String, made: Boolean, back: Pair<String, () -> Unit>?) {
    val c = MyTailLogTheme.colors
    val context = LocalContext.current
    val resources = LocalResources.current
    val scope = rememberCoroutineScope()
    val rooms = rememberRooms(recs)
    val online = recs.store.sync.collectAsStateWithLifecycleCompat().value.online
    val room = rooms.rooms.firstOrNull { it.id == roomId }
    var opens by remember { mutableStateOf<List<RoomOpen>?>(null) }
    var toast by remember { mutableStateOf<Toast?>(null) }
    var busy by remember { mutableStateOf(false) }
    var revoking by remember { mutableStateOf(false) }
    var big by remember { mutableStateOf(false) }
    LaunchedEffect(roomId, online) { if (online && !made) runCatching { recs.api.roomOpens(recs.id, roomId) }.onSuccess { opens = it } }
    fun patch(body: kotlinx.serialization.json.JsonObject, done: Int) {
        busy = true
        scope.launch {
            try { rooms.changed(recs.api.updateRoom(recs.id, roomId, body)); runCatching { rooms.refresh() }; toast = Toast(recs.str(done)) }
            catch (e: CancellationException) { throw e } catch (e: Exception) { toast = Toast(e.message ?: recs.str(R.string.share_needs_signal)) } finally { busy = false }
        }
    }
    val url = room?.url
    Board(
        if (made) stringResource(R.string.share_link_made) else room?.label ?: stringResource(R.string.share_link), Section.Share, back = back, toast = toast, onToastDone = { toast = null },
        footer = if (url == null || room?.active != true) null else ({
            DButton(stringResource(R.string.share_send_link), {
                context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_SUBJECT, room.label).putExtra(Intent.EXTRA_TEXT, resources.getString(R.string.share_send_text, recs.tail, url)), null))
            }, icon = LucideIcons.Send)
        }),
    ) {
        if (room == null) { Empty(stringResource(R.string.share_link_missing)); return@Board }
        if (made) Title(room.label)
        Note(stringResource(R.string.share_room_note), Modifier.padding(bottom = Tokens.Space.s3))
        if (url != null && room.active) {
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                QrCard(url, Modifier.focusRing().clickable(role = Role.Button, onClickLabel = stringResource(R.string.share_qr_big)) { big = true })
            }
            Row(Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(top = Tokens.Space.s3), verticalAlignment = Alignment.CenterVertically) {
                Text(shortUrl(url), color = c.ink, style = MaterialTheme.typography.bodyLarge.copy(fontFeatureSettings = "tnum"), maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.MiddleEllipsis, modifier = Modifier.weight(1f))
                DButton(stringResource(R.string.share_copy), {
                    val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                    cm.setPrimaryClip(ClipData.newPlainText(room.label, url))
                    toast = Toast(recs.str(R.string.share_copied))
                }, kind = ButtonKind.Secondary, icon = LucideIcons.Copy, modifier = Modifier.padding(start = Tokens.Space.s2).fillMaxWidth(0.4f))
            }
        }
        Kv(stringResource(R.string.share_kv_expires), roomExpiry(room))
        if (room.active) {
            DButton(stringResource(R.string.share_extend), { patch(json("extendDays" to 30), R.string.share_extended) }, kind = ButtonKind.Quiet, enabled = online && !busy)
        }
        Kv(stringResource(R.string.share_kv_opens_on), roomOpensOn(room.mapWindow))
        Kv(stringResource(R.string.share_kv_holds), roomHolds(room))
        if (made) Note(stringResource(R.string.share_opens_logged), Modifier.padding(top = Tokens.Space.s3))
        else {
            GroupHeader(stringResource(R.string.share_opens), count = room.opens.toString())
            when {
                opens == null && !online -> Note(stringResource(R.string.share_opens_offline))
                opens.isNullOrEmpty() -> Note(stringResource(R.string.share_not_opened))
                else -> opens!!.forEach { Note(openLine(it), Modifier.padding(vertical = Tokens.Space.s1)) }
            }
            if (room.active) {
                DButton(stringResource(R.string.share_revoke), { revoking = true }, kind = ButtonKind.Quiet, enabled = online && !busy, modifier = Modifier.padding(top = Tokens.Space.s4))
                if (!online) Note(stringResource(R.string.share_revoke_offline))
            }
        }
    }
    if (revoking) Confirm(stringResource(R.string.share_revoke_title), stringResource(R.string.share_revoke_body), stringResource(R.string.share_revoke), { patch(json("revoke" to true), R.string.share_revoked) }, { revoking = false })
    if (big && url != null) BigQr(url) { big = false }
}

@Composable
private fun Kv(key: String, value: String) {
    val c = MyTailLogTheme.colors
    Row(Modifier.fillMaxWidth().heightIn(min = 32.dp).padding(vertical = Tokens.Space.s1).semantics(mergeDescendants = true) {}, horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s3)) {
        Text(key, color = c.ink3, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.width(88.dp))
        Text(value, color = c.ink, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
    }
}

/** The QR code bitmap of [text]: ink modules, no margin (the card draws the quiet zone). */
fun qrMatrix(text: String): com.google.zxing.common.BitMatrix = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, 0, 0, mapOf(EncodeHintType.MARGIN to 0))

fun qrBitmap(text: String): Bitmap {
    val m = qrMatrix(text)
    val dark = LightColors.ink.toArgbInt()
    val light = LightColors.leaf.toArgbInt()
    val px = IntArray(m.width * m.height) { i -> if (m[i % m.width, i / m.width]) dark else light }
    return Bitmap.createBitmap(px, m.width, m.height, Bitmap.Config.ARGB_8888)
}

private fun androidx.compose.ui.graphics.Color.toArgbInt() = android.graphics.Color.argb((alpha * 255).toInt(), (red * 255).toInt(), (green * 255).toInt(), (blue * 255).toInt())

/** QRCard (M-SHARE-02): 220 square on white with a 16 quiet zone, white in dark mode too. */
@Composable
private fun QrCard(url: String, modifier: Modifier = Modifier, side: androidx.compose.ui.unit.Dp = 220.dp) {
    val bitmap = remember(url) { qrBitmap(url).asImageBitmap() }
    Box(modifier.clip(RoundedCornerShape(Tokens.Radius.m)).background(LightColors.leaf).padding(16.dp)) {
        Image(bitmap, stringResource(R.string.share_qr_spoken, shortUrl(url)), Modifier.size(side), filterQuality = FilterQuality.None)
    }
}

/** The QR full screen at full brightness, for showing a buyer in person. */
@Composable
private fun BigQr(url: String, onDismiss: () -> Unit) {
    val activity = androidx.activity.compose.LocalActivity.current
    DisposableEffect(Unit) {
        val w = activity?.window
        val before = w?.attributes?.screenBrightness
        w?.attributes = w?.attributes?.apply { screenBrightness = 1f }
        onDispose { w?.attributes = w?.attributes?.apply { screenBrightness = before ?: -1f } }
    }
    Dialog(onDismiss, DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(LightColors.leaf).clickable(role = Role.Button, onClickLabel = stringResource(R.string.close), onClick = onDismiss), contentAlignment = Alignment.Center) {
            QrCard(url, side = 300.dp)
        }
    }
}

// --- Links and people (M-SHARE-03) ---------------------------------------------------------------------------

/** Live links with expiry and opens, the expired and revoked ones folded, and the people with access and their roles. */
@Composable
fun LinksScreen(recs: Recs, back: Pair<String, () -> Unit>?, onLink: (String) -> Unit) {
    val c = MyTailLogTheme.colors
    val scope = rememberCoroutineScope()
    val rooms = rememberRooms(recs)
    val online = recs.store.sync.collectAsStateWithLifecycleCompat().value.online
    var people by remember { mutableStateOf<List<Person>?>(null) }
    var peopleError by remember { mutableStateOf<String?>(null) }
    var showEnded by rememberSaveable { mutableStateOf(false) }
    var inviting by remember { mutableStateOf(false) }
    var removing by remember { mutableStateOf<Person?>(null) }
    var toast by remember { mutableStateOf<Toast?>(null) }
    var version by remember { mutableStateOf(0) }
    LaunchedEffect(online, version) {
        if (online && recs.isOwner) runCatching { recs.api.people(recs.id) }.onSuccess { people = it; peopleError = null }.onFailure { peopleError = it.message }
    }
    fun act(block: suspend () -> Unit, done: Int) = scope.launch {
        try { block(); version++; toast = Toast(recs.str(done)) } catch (e: CancellationException) { throw e } catch (e: Exception) { toast = Toast(e.message ?: recs.str(R.string.share_needs_signal)) }
    }
    Board(stringResource(R.string.share_links_title), Section.Share, back = back, toast = toast, onToastDone = { toast = null }) {
        val (live, ended) = rooms.rooms.partition { it.active }
        GroupHeader(stringResource(R.string.share_live), count = live.size.toString())
        if (live.isEmpty()) Note(stringResource(R.string.share_no_live))
        live.forEach { r -> RecRow(r.label, listOf(roomLine(r)), onClick = { onLink(r.id) }) }
        if (ended.isNotEmpty()) {
            PhoneRow(stringResource(if (showEnded) R.string.share_hide_ended else R.string.share_show_ended, ended.size), { showEnded = !showEnded })
            if (showEnded) ended.forEach { r -> RecRow(r.label, listOf(roomLine(r)), onClick = { onLink(r.id) }) }
        }
        if (!online) Note(stringResource(R.string.share_list_offline), Modifier.padding(top = Tokens.Space.s2))
        GroupHeader(stringResource(R.string.share_people_group), count = people?.let { (it.size + 1).toString() })
        RecRow(stringResource(R.string.share_you), listOf(roleWord("owner")))
        people?.forEach { p ->
            val other = if (p.role == "editor") "viewer" else "editor"
            RecRow(
                p.email, listOf(roleWord(p.role)),
                menu = if (!online) emptyList() else listOf(
                    stringResource(R.string.share_make_role, roleWord(other)) to { act({ recs.api.setPerson(recs.id, recs.store.userId, p.email, other) }, R.string.share_role_changed) },
                    stringResource(R.string.share_remove_access) to { removing = p },
                ),
            )
        }
        when {
            !online -> Note(stringResource(R.string.share_people_offline))
            peopleError != null -> Note(peopleError!!, alarm = true)
        }
        DButton(stringResource(R.string.share_invite), { inviting = true }, kind = ButtonKind.Secondary, icon = LucideIcons.Users, enabled = online, modifier = Modifier.padding(top = Tokens.Space.s4))
    }
    removing?.let { p ->
        Confirm(stringResource(R.string.share_remove_title, p.email), stringResource(R.string.share_remove_body, recs.tail), stringResource(R.string.share_remove_access), {
            act({ recs.api.removePerson(recs.id, p.email) }, R.string.share_removed)
        }, { removing = null })
    }
    if (inviting) InviteSheet(recs, online, onDone = { inviting = false }) { toast = Toast(it); version++ }
}

/**
 * Invite a co-owner or mechanic (M-SHARE-01): email and role, then access is granted on the server. The phone
 * can't send the invitation email itself, so it opens the share sheet with a note to send them.
 */
@Composable
private fun InviteSheet(recs: Recs, online: Boolean, onDone: () -> Unit, onToast: (String) -> Unit) {
    val context = LocalContext.current
    val resources = LocalResources.current
    val scope = rememberCoroutineScope()
    var email by rememberSaveable { mutableStateOf("") }
    var role by rememberSaveable { mutableStateOf(0) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val valid = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$").matches(email.trim())
    Sheet(stringResource(R.string.share_invite_title), onDone, dirty = email.isNotBlank()) {
        if (!recs.isOwner) { Note(stringResource(R.string.share_owner_only)); return@Sheet }
        Field(stringResource(R.string.share_email), email, { email = it.take(200) })
        RadioRows(listOf(stringResource(R.string.share_role_editor) to stringResource(R.string.share_role_editor_sub), stringResource(R.string.share_role_viewer) to stringResource(R.string.share_role_viewer_sub)), role) { role = it }
        error?.let { Note(it, alarm = true) }
        DButton(stringResource(R.string.share_send_invite), {
            busy = true; error = null
            scope.launch {
                try {
                    recs.api.setPerson(recs.id, recs.store.userId, email.trim(), if (role == 0) "editor" else "viewer")
                    onToast(recs.str(R.string.share_invited))
                    context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_EMAIL, arrayOf(email.trim())).putExtra(Intent.EXTRA_SUBJECT, resources.getString(R.string.share_invite_subject, recs.tail)).putExtra(Intent.EXTRA_TEXT, resources.getString(R.string.share_invite_text, recs.tail, email.trim(), BuildConfig.API_URL)), null))
                    onDone()
                } catch (e: CancellationException) { throw e } catch (e: Exception) { error = e.message } finally { busy = false }
            }
        }, enabled = online && valid && !busy, busyText = if (busy) stringResource(R.string.saving) else null, icon = LucideIcons.Mail, modifier = Modifier.padding(top = Tokens.Space.s4))
        if (!online) Note(stringResource(R.string.share_invite_offline))
    }
}

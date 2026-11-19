package com.mytaillog.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import com.mytaillog.design.ButtonKind
import com.mytaillog.design.DButton
import com.mytaillog.design.GroupHeader
import com.mytaillog.design.LucideIcons
import com.mytaillog.design.MyTailLogTheme
import com.mytaillog.design.PageCite
import com.mytaillog.design.Section
import com.mytaillog.design.StatusMark
import com.mytaillog.design.SubTabs
import com.mytaillog.design.SyncLine
import com.mytaillog.design.Tokens
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import java.time.LocalDate
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.unit.dp

// 06 §5 Maintenance: Items · ADs · Squawks (M-MAINT-01..07), from this phone's copy, every write through the outbox.

enum class MaintView { Items, Ads, Squawks }

/** The Maint. tab: SubTabs over the three views (06 §5). The first visit opens on Squawks if any is open. */
@Composable
fun MaintTab(recs: Recs, view: MaintView?, onView: (MaintView) -> Unit, status: StatusHost?) {
    val nav = LocalRecNav.current
    val squawks = recs.watch { recs.store.records("squawk", recs.id) }
    val open = squawks.count { it.s("status") != "resolved" }
    val shown = view ?: if (open > 0) MaintView.Squawks else MaintView.Items
    Board(
        stringResource(R.string.section_maint), Section.Maint, status = status, toast = recs.toast, onToastDone = { recs.toast = null },
        top = {
            val views = listOf(stringResource(R.string.maint_items), stringResource(R.string.maint_ads), if (open > 0) stringResource(R.string.maint_squawks_n, open) else stringResource(R.string.maint_squawks))
            // On the tablet the views sit on the leaf, so they take the leaf's segmented control.
            if (nav.tablet) Segmented(views, shown.ordinal) { onView(MaintView.entries[it]) }
            else SubTabs(views, shown.ordinal, { onView(MaintView.entries[it]) }, Section.Maint, Modifier.padding(bottom = 10.dp))
        },
    ) {
        when (shown) {
            MaintView.Items -> ItemsView(recs)
            MaintView.Ads -> AdsView(recs)
            MaintView.Squawks -> SquawksView(recs, squawks)
        }
        ViewerLine(recs)
    }
}

/** 06 §1.5: the line at the end of each top-level leaf for viewers and the demo. */
@Composable
fun ViewerLine(recs: Recs) {
    if (recs.canEdit) return
    Note(
        if (recs.aircraft.aircraft.isDemo) stringResource(R.string.status_demo) else stringResource(R.string.rec_viewer, recs.tail),
        Modifier.padding(top = Tokens.Space.s4),
    )
}

// --- Squawks (M-MAINT-05) --------------------------------------------------------------------------

@Composable
private fun SquawksView(recs: Recs, squawks: List<Rec>) {
    val nav = LocalRecNav.current
    val photos = recs.watch { recs.store.records("squawk_photo", recs.id) }
    var showResolved by rememberSaveable { mutableStateOf(false) }
    val waiting = squawks.filter { it.pending && recs.store.mirror.raw("squawk", it.id) == null }
    val open = squawks.filter { it.s("status") != "resolved" && it !in waiting }
        .sortedWith(compareBy<Rec> { -SEVERITIES.indexOf(it.s("severity")) }.thenByDescending { it.s("reported_at") ?: "" })
    val resolved = squawks.filter { it.s("status") == "resolved" && it !in waiting }.sortedByDescending { it.s("resolved_at") ?: "" }
    if (squawks.isEmpty()) {
        Empty(stringResource(R.string.maint_squawks_empty))
        return
    }
    if (waiting.isNotEmpty()) {
        GroupHeader(stringResource(R.string.maint_waiting_upload), count = waiting.size.toString())
        waiting.forEach { SquawkRow(recs, it, photos) { nav.open(Routes.of(Routes.SQUAWK, it.id)) } }
    }
    GroupHeader(stringResource(R.string.maint_open), count = open.size.toString())
    if (open.isEmpty()) Note(stringResource(R.string.maint_squawks_empty), Modifier.padding(vertical = Tokens.Space.s3))
    open.forEach { SquawkRow(recs, it, photos) { nav.open(Routes.of(Routes.SQUAWK, it.id)) } }
    if (resolved.isNotEmpty()) {
        RecRow(
            stringResource(R.string.maint_resolved_n, resolved.size), onClick = { showResolved = !showResolved },
            trailing = { androidx.compose.material3.Icon(if (showResolved) LucideIcons.ChevronUp else LucideIcons.ChevronDown, null, tint = MyTailLogTheme.colors.ink) },
        )
        if (showResolved) resolved.forEach { SquawkRow(recs, it, photos) { nav.open(Routes.of(Routes.SQUAWK, it.id)) } }
    }
}

@Composable
private fun SquawkRow(recs: Recs, s: Rec, photos: List<Rec>, onClick: () -> Unit) {
    val clip = LocalClipboardManager.current
    var resolving by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    val mine = photos.filter { it.s("squawk_id") == s.id }
    val menu = buildList {
        if (recs.canEdit && s.s("status") != "resolved") add(stringResource(R.string.maint_resolve) to { resolving = true })
        add(stringResource(R.string.rec_copy) to { clip.setText(AnnotatedString(s.s("description") ?: "")) })
        if (recs.canEdit) add(stringResource(R.string.rec_delete) to { deleting = true })
    }
    RecRow(
        s.s("description")?.lines()?.firstOrNull() ?: "",
        listOfNotNull(s.s("description")?.lines()?.drop(1)?.joinToString(" ")?.takeIf { it.isNotBlank() }?.take(160), squawkMeta(s.s("severity"), s.s("reported_at"), s.s("reporter_name"), mine.size)),
        s, onClick, menu,
        trailing = { StatusMark(severityMark(s.s("severity")), severityWord(s.s("severity")), compact = true) },
    )
    if (resolving) ResolveSheet(recs, s) { resolving = false }
    if (deleting) DeleteSquawk(recs, s, {}) { deleting = false }
}

@Composable
private fun DeleteSquawk(recs: Recs, s: Rec, onDeleted: () -> Unit, onDone: () -> Unit) {
    Confirm(stringResource(R.string.maint_delete_squawk), stringResource(R.string.maint_delete_squawk_body), stringResource(R.string.rec_delete), {
        recs.delete("squawk.delete", "squawk", s.id, "Delete squawk", json("squawkId" to s.id))
        recs.toast = Toast(recs.str(R.string.maint_squawk_deleted))
        onDeleted()
    }, onDone)
}

/** Mark resolved (M-MAINT-02): date, the clearing entry, what was done. Never resolves silently. */
@Composable
fun ResolveSheet(recs: Recs, s: Rec, onDone: () -> Unit) {
    var date by rememberSaveable { mutableStateOf(LocalDate.now().toString()) }
    var entry by rememberSaveable { mutableStateOf<String?>(null) }
    var notes by rememberSaveable { mutableStateOf("") }
    Sheet(stringResource(R.string.maint_mark_resolved), onDone, dirty = notes.isNotBlank(), discardWhat = stringResource(R.string.maint_resolution)) {
        DateRow(stringResource(R.string.maint_when_fixed), date, { date = it ?: date }, pastOnly = true)
        EntryChoice(recs, stringResource(R.string.maint_which_entry), entry, allowNone = stringResource(R.string.maint_not_in_logbook)) { entry = it }
        Field(stringResource(R.string.maint_what_done), notes, { notes = it }, lines = 3)
        DButton(stringResource(R.string.maint_resolve), {
            recs.change("squawk.resolve", "squawk", s.id, "Resolve squawk", json("squawkId" to s.id, "resolvedAt" to date, "resolvedEntryId" to entry, "resolutionNotes" to notes.trim().ifEmpty { null }))
            recs.toast = Toast(recs.str(R.string.maint_resolved_toast), recs.str(R.string.undo)) {
                recs.change("squawk.reopen", "squawk", s.id, "Reopen squawk", json("squawkId" to s.id))
            }
            onDone()
        }, modifier = Modifier.padding(top = Tokens.Space.s3))
    }
}

/** An entry picker as a choice field: the newest entries first, with "not in the logbook yet". */
@Composable
fun EntryChoice(recs: Recs, label: String, selected: String?, allowNone: String? = null, onPick: (String?) -> Unit) {
    var picking by remember { mutableStateOf(false) }
    val c = MyTailLogTheme.colors
    RecRow(label, listOf(selected?.let { recs.entryLine(it) } ?: allowNone ?: stringResource(R.string.rec_not_set)), onClick = { picking = true },
        trailing = { androidx.compose.material3.Icon(LucideIcons.ChevronRight, null, tint = c.ink) })
    if (picking) {
        var q by remember { mutableStateOf("") }
        val all = remember { recs.entries() }
        Sheet(label, { picking = false }, full = true) {
            Field(stringResource(R.string.rec_search), q, { q = it })
            allowNone?.let { RecRow(it, onClick = { onPick(null); picking = false }) }
            all.filter { q.isBlank() || it.second.contains(q, ignoreCase = true) }.take(80).forEach { (id, line) ->
                RecRow(line, onClick = { onPick(id); picking = false })
            }
            if (all.isEmpty()) Note(stringResource(R.string.rec_no_entries))
        }
    }
}

// --- Squawk detail (M-MAINT-02) ----------------------------------------------------------------------

@Composable
fun SquawkDetail(recs: Recs, id: String) {
    val nav = LocalRecNav.current
    val c = MyTailLogTheme.colors
    val s = recs.watch(id) { recs.store.records("squawk", recs.id).firstOrNull { it.id == id } }
    val photos = recs.watch(id) { recs.store.records("squawk_photo", recs.id).filter { it.s("squawk_id") == id } }
    var resolving by remember { mutableStateOf(false) }
    var sending by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    val back = stringResource(R.string.maint_squawks) to nav.back
    if (s == null) {
        Board(stringResource(R.string.maint_squawk), Section.Maint, back = back) { Empty(stringResource(R.string.rec_gone)) }
        return
    }
    val resolved = s.s("status") == "resolved"
    val pickPhoto = rememberPhotoPicker(4) { list -> list.forEach { addSquawkPhoto(recs, id, it) }; if (list.isNotEmpty()) recs.toast = Toast(recs.str(R.string.maint_photo_added)) }
    Board(
        stringResource(R.string.maint_squawk), Section.Maint, back = back, toast = recs.toast, onToastDone = { recs.toast = null },
        footer = if (!recs.canEdit) null else ({
            if (resolved) ButtonPair(stringResource(R.string.maint_edit), { editing = true }, stringResource(R.string.maint_reopen), {
                recs.change("squawk.reopen", "squawk", id, "Reopen squawk", json("squawkId" to id))
            })
            else ButtonPair(stringResource(R.string.maint_send), { sending = true }, stringResource(R.string.maint_mark_resolved), { resolving = true }, secondaryIcon = LucideIcons.Send)
        }),
    ) {
        Note("${if (resolved) stringResource(R.string.maint_resolved) else stringResource(R.string.maint_open)} · ${severityWord(s.s("severity"))}")
        Title(s.s("description")?.lines()?.firstOrNull() ?: "")
        Note(listOfNotNull(s.s("reported_at")?.let { "Reported ${dayDate(it)}" + (s.s("reporter_name")?.let { n -> " by ${n.substringBefore(' ')}" } ?: "") }, photos.size.takeIf { it > 0 }?.let { if (it == 1) "1 photo" else "$it photos" }).joinToString(" · "))
        PendingCaption(s)
        PhotoStrip(recs, photos.map { it.id }, onAdd = if (recs.canEdit || s.s("reported_by") == recs.store.userId) pickPhoto else null)
        SelectionContainer { Lede(s.s("description") ?: "", Modifier.padding(vertical = Tokens.Space.s3)) }
        if (resolved) {
            GroupHeader(stringResource(R.string.maint_resolution))
            Lede(listOfNotNull(s.s("resolved_at")?.let { "Resolved ${dayDate(it)}" }, s.s("resolution_notes")).joinToString(". "))
            recs.pageLabel(s.s("resolved_log_entry_id"))?.let { PageCite(it, stringResource(R.string.your_note), Section.Books, Modifier.padding(top = Tokens.Space.s2)) }
        } else if (recs.canEdit) {
            GroupHeader(stringResource(R.string.maint_when_fixed_group))
            RecRow(stringResource(R.string.maint_link_entry), listOf(stringResource(R.string.maint_link_entry_sub)), onClick = { resolving = true },
                trailing = { androidx.compose.material3.Icon(LucideIcons.ChevronRight, null, tint = c.ink) })
            Note(stringResource(R.string.maint_send_note), Modifier.padding(top = Tokens.Space.s3))
        }
        if (recs.canEdit) DButton(stringResource(R.string.maint_delete_squawk_short), { deleting = true }, kind = ButtonKind.Quiet, modifier = Modifier.padding(top = Tokens.Space.s4))
    }
    if (resolving) ResolveSheet(recs, s) { resolving = false }
    if (sending) SendSheet(recs, s) { sending = false }
    if (editing) EditSquawkSheet(recs, s) { editing = false }
    if (deleting) DeleteSquawk(recs, s, nav.back) { deleting = false }
}

@Composable
private fun EditSquawkSheet(recs: Recs, s: Rec, onDone: () -> Unit) {
    var text by rememberSaveable { mutableStateOf(s.s("description") ?: "") }
    var sev by rememberSaveable { mutableStateOf(SEVERITIES.indexOf(s.s("severity")).coerceAtLeast(0)) }
    Sheet(stringResource(R.string.maint_edit_squawk), onDone, dirty = text != s.s("description")) {
        Field(stringResource(R.string.maint_what_noticed), text, { text = it }, lines = 4)
        RadioRows(severityOptions(), sev) { sev = it }
        DButton(stringResource(R.string.save), {
            recs.change("squawk.update", "squawk", s.id, "Edit squawk", json("squawkId" to s.id, "description" to text.trim(), "severity" to SEVERITIES[sev]))
            onDone()
        }, enabled = text.isNotBlank())
    }
}

@Composable
fun severityOptions() = listOf(
    stringResource(R.string.sev_low) to stringResource(R.string.sev_low_meaning),
    stringResource(R.string.sev_watch) to stringResource(R.string.sev_watch_meaning),
    stringResource(R.string.sev_ground) to stringResource(R.string.sev_ground_meaning),
)

/** Send to mechanic (C-SQ-03): online only; offline the button says why and the choices are kept. */
@Composable
private fun SendSheet(recs: Recs, s: Rec, onDone: () -> Unit) {
    val context = LocalContext.current
    val clip = LocalClipboardManager.current
    val scope = rememberCoroutineScope()
    val sync by recs.store.sync.collectAsStateWithLifecycleCompat()
    var who by rememberSaveable { mutableStateOf("") }
    var days by rememberSaveable { mutableStateOf(1) }
    var photos by rememberSaveable { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var link by rememberSaveable { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val c = MyTailLogTheme.colors
    Sheet(stringResource(R.string.maint_send), onDone) {
        val l = link
        if (l != null) {
            Lede(stringResource(R.string.maint_link_made))
            SelectionContainer { Text(l, color = c.ink, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight(700))) }
            ButtonPair(stringResource(R.string.rec_copy), { clip.setText(AnnotatedString(l)) }, stringResource(R.string.rec_share), {
                context.startActivity(android.content.Intent.createChooser(android.content.Intent(android.content.Intent.ACTION_SEND).setType("text/plain").putExtra(android.content.Intent.EXTRA_TEXT, l), null))
            }, secondaryIcon = LucideIcons.Copy)
            return@Sheet
        }
        Field(stringResource(R.string.maint_recipient), who, { who = it }, placeholder = stringResource(R.string.maint_recipient_hint))
        Note(stringResource(R.string.maint_expires_in))
        Segmented(listOf("7 days", "30 days", "90 days"), days) { days = it }
        Row(Modifier.fillMaxWidth().padding(vertical = Tokens.Space.s2), verticalAlignment = Alignment.CenterVertically) {
            Lede(stringResource(R.string.maint_include_photos), Modifier.weight(1f))
            Switch(photos, { photos = it }, colors = SwitchDefaults.colors(checkedTrackColor = c.ink, checkedThumbColor = c.leaf))
        }
        Note(stringResource(R.string.maint_send_note))
        error?.let { Note(it, alarm = true) }
        DButton(stringResource(R.string.maint_make_link), {
            busy = true; error = null
            scope.launch {
                try {
                    link = recs.api.mechanicLink(recs.id, s.id, who.trim().ifEmpty { "Mechanic" }, listOf(7, 30, 90)[days], photos).url
                } catch (e: CancellationException) { throw e } catch (e: Exception) {
                    error = e.message ?: recs.str(R.string.rec_needs_signal_link)
                } finally { busy = false }
            }
        }, enabled = sync.online && !busy && recs.store.mirror.raw("squawk", s.id) != null, busyText = if (busy) stringResource(R.string.saving) else null, icon = LucideIcons.Send)
        if (!sync.online) Note(stringResource(R.string.rec_needs_signal_link))
        else if (recs.store.mirror.raw("squawk", s.id) == null) Note(stringResource(R.string.maint_send_after_upload))
    }
}

// --- Tracked items (M-MAINT-04) ----------------------------------------------------------------------

@Composable
private fun ItemsView(recs: Recs) {
    val nav = LocalRecNav.current
    val scope = rememberCoroutineScope()
    val items = recs.watch { recs.store.records("maintenance_item", recs.id) }
    var filter by rememberSaveable { mutableStateOf(0) }
    var scanning by remember { mutableStateOf(false) }
    val sync by recs.store.sync.collectAsStateWithLifecycleCompat()
    if (items.isEmpty()) {
        Empty(stringResource(R.string.maint_items_empty), if (recs.canEdit) stringResource(R.string.maint_seed) else null) {
            recs.change("mx.seedStandard", "maintenance_item", newId(), "Set up the standard inspections", JsonObject(emptyMap()))
        }
        return
    }
    val req = items.count { it.b("regulatory") }
    Segmented(listOf("All ${items.size}", "Required $req", "Advisory ${items.size - req}"), filter) { filter = it }
    items.filter { filter == 0 || it.b("regulatory") == (filter == 1) }
        .sortedWith(compareBy<Rec> { recs.due("mx:${it.id}")?.firstDate ?: it.s("next_due_date") ?: "9999" }.thenBy { it.s("label") })
        .forEach { i ->
            val due = recs.due("mx:${i.id}")
            RecRow(
                due?.label ?: i.s("label") ?: "",
                listOfNotNull(itemRule(i.b("regulatory"), i.d("interval_months")?.toInt(), i.d("interval_hours"), i.s("kind") in CALENDAR_MONTH)),
                i, onClick = if (recs.canEdit) ({ nav.open(Routes.of(Routes.ITEM, i.id)) }) else null,
                trailing = {
                    Column(horizontalAlignment = Alignment.End) {
                        due?.let { StatusMark(markKind(it.status), statusWord(it.status), compact = true) }
                        Note(listOfNotNull(i.s("next_due_date")?.let(::dayDate), i.d("next_due_hours")?.let { "${i.s("meter") ?: "tach"} ${fmt1(it)}" }).joinToString(" · "))
                    }
                },
            )
        }
    if (recs.canEdit) {
        DButton(stringResource(R.string.maint_add_item), { nav.open(Routes.of(Routes.ITEM, "new")) }, kind = ButtonKind.Secondary, modifier = Modifier.padding(top = Tokens.Space.s4))
        DButton(stringResource(R.string.maint_find_completions), {
            scanning = true
            scope.launch {
                recs.toast = try { recs.api.scanCompletions(recs.id); recs.kick(); Toast(recs.str(R.string.maint_scan_done)) } catch (e: CancellationException) { throw e } catch (e: Exception) { Toast(e.message ?: recs.str(R.string.rec_needs_signal_reading)) }
                scanning = false
            }
        }, kind = ButtonKind.Quiet, enabled = sync.online && !scanning, busyText = if (scanning) stringResource(R.string.maint_scanning) else null)
        if (!sync.online) Note(stringResource(R.string.rec_needs_signal_reading))
    }
}

/** Item editor (M-MAINT-04): both limits, the meter, last done, a live preview of the next due. */
@Composable
fun ItemEditor(recs: Recs, id: String) {
    val nav = LocalRecNav.current
    val existing = remember(id) { recs.store.records("maintenance_item", recs.id).firstOrNull { it.id == id } }
    var kind by rememberSaveable { mutableStateOf(existing?.s("kind") ?: "annual") }
    var label by rememberSaveable { mutableStateOf(existing?.s("label") ?: "") }
    var regulatory by rememberSaveable { mutableStateOf(existing?.b("regulatory") ?: true) }
    var months by rememberSaveable { mutableStateOf(existing?.d("interval_months")?.toInt()?.toString() ?: "") }
    var hours by rememberSaveable { mutableStateOf(fmtNum(existing?.d("interval_hours"))) }
    var meter by rememberSaveable { mutableStateOf(existing?.s("meter") ?: "tach") }
    var lastDate by rememberSaveable { mutableStateOf(existing?.s("last_done_date")) }
    var lastHours by rememberSaveable { mutableStateOf(fmtNum(existing?.d("last_done_hours"))) }
    var notes by rememberSaveable { mutableStateOf(existing?.s("notes") ?: "") }
    var deleting by remember { mutableStateOf(false) }
    val name = label.ifBlank { ITEM_KINDS.firstOrNull { it.first == kind }?.second ?: "" }
    val valid = name.isNotBlank() && (months.toIntOrNull() != null || num(hours) != null)
    Board(
        existing?.s("label") ?: stringResource(R.string.maint_new_item), Section.Maint, back = stringResource(R.string.maint_items) to nav.back,
        footer = {
            DButton(if (existing == null) stringResource(R.string.maint_add_item_short) else stringResource(R.string.maint_save_changes), {
                val item = json(
                    "kind" to kind, "label" to name, "regulatory" to regulatory, "interval_months" to months.toIntOrNull(), "interval_hours" to num(hours),
                    "meter" to meter, "last_done_date" to lastDate, "last_done_hours" to num(lastHours), "notes" to notes.trim().ifEmpty { null },
                )
                val payload = if (existing != null && recs.store.mirror.raw("maintenance_item", id) != null) json("id" to id, "item" to item) else json("item" to item)
                recs.change("mx.upsert", "maintenance_item", existing?.id ?: newId(), name, payload)
                recs.toast = Toast(recs.str(R.string.rec_saved))
                nav.back()
            }, enabled = valid)
        },
    ) {
        Choice(stringResource(R.string.maint_what), ITEM_KINDS, kind) { kind = it; if (label.isBlank()) label = "" }
        Field(stringResource(R.string.maint_name), label, { label = it }, placeholder = ITEM_KINDS.firstOrNull { it.first == kind }?.second)
        Segmented(listOf(stringResource(R.string.maint_required), stringResource(R.string.maint_advisory)), if (regulatory) 0 else 1) { regulatory = it == 0 }
        Row(horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s2)) {
            Field(stringResource(R.string.maint_every_months), months, { months = it.filter(Char::isDigit).take(3) }, Modifier.weight(1f), number = true)
            Field(stringResource(R.string.maint_every_hours), hours, { hours = it }, Modifier.weight(1f), number = true)
        }
        Note(stringResource(R.string.maint_counts_on))
        Segmented(listOf("Tach", "Hobbs"), if (meter == "hobbs") 1 else 0) { meter = if (it == 1) "hobbs" else "tach" }
        DateRow(stringResource(R.string.maint_last_done), lastDate, { lastDate = it }, pastOnly = true, clearable = true)
        Field(stringResource(R.string.maint_at_hours), lastHours, { lastHours = it }, number = true)
        Field(stringResource(R.string.maint_notes), notes, { notes = it }, lines = 2)
        nextDuePreview(kind, lastDate, num(lastHours), months.toIntOrNull(), num(hours), meter, recs.meter(meter), recs.snapshot?.rate?.hoursPerDay)?.let { Well { Lede(it) } }
        if (existing != null) DButton(stringResource(R.string.maint_delete_item), { deleting = true }, kind = ButtonKind.Quiet)
    }
    if (deleting) Confirm(stringResource(R.string.maint_delete_item_title, name.lowercase()), stringResource(R.string.maint_delete_item_body), stringResource(R.string.rec_delete), {
        recs.delete("mx.delete", "maintenance_item", id, "Delete $name", json("itemId" to id))
        nav.back()
    }, { deleting = false })
}

// --- ADs (M-MAINT-01, -06, -07) ----------------------------------------------------------------------

@Composable
private fun AdsView(recs: Recs) {
    val nav = LocalRecNav.current
    val c = MyTailLogTheme.colors
    val clip = LocalClipboardManager.current
    val ads = recs.watch { recs.store.records("ad_compliance", recs.id) }
    val tach = recs.meter("tach")
    if (ads.isEmpty()) {
        Empty(stringResource(R.string.maint_ads_empty), stringResource(R.string.maint_find_ads)) { nav.open(Routes.FIND_ADS) }
    }
    ads.map { it to adStatus(it.s("status"), it.b("recurring"), recs.due("ad:${it.id}")) }
        .sortedWith(compareBy<Pair<Rec, Pair<com.mytaillog.design.MarkKind, String>>> { adRank(it.second.second) }.thenBy { it.first.s("reference") })
        .forEach { (a, st) ->
            RecRow(
                "${(a.s("kind") ?: "ad").uppercase()} ${a.s("reference")}${a.s("title")?.let { " · ${it.take(60)}" } ?: ""}",
                listOf(adSentence(a.s("status"), a.b("recurring"), a.d("interval_hours"), a.d("interval_months")?.toInt(), a.s("complied_date"), a.d("complied_hours"), a.s("next_due_date"), a.d("next_due_hours"), a.s("reason"), tach)),
                a, onClick = { nav.open(Routes.of(Routes.AD, a.id)) },
                menu = listOfNotNull(
                    (stringResource(R.string.maint_record_compliance) to { nav.open(Routes.of(Routes.AD, a.id) + ":record") }).takeIf { recs.canEdit },
                    stringResource(R.string.maint_copy_number) to { clip.setText(AnnotatedString(a.s("reference") ?: "")) },
                ),
                trailing = { StatusMark(st.first, st.second, compact = true) },
                below = {
                    Row(Modifier.padding(top = Tokens.Space.s2), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s3)) {
                        recs.pageLabel(a.s("reference_entry_id"))?.let { PageCite(it, stringResource(R.string.your_note), Section.Books) }
                        if (a.b("recurring") && recs.canEdit) DButton(stringResource(R.string.maint_record_compliance), { nav.open(Routes.of(Routes.AD, a.id) + ":record") }, kind = ButtonKind.Secondary)
                    }
                },
            )
        }
    RecRow(stringResource(R.string.maint_find_ads), listOf(stringResource(R.string.maint_find_ads_sub)), onClick = { nav.open(Routes.FIND_ADS) },
        trailing = { androidx.compose.material3.Icon(LucideIcons.ChevronRight, null, tint = c.ink) })
}

private val METHODS = listOf("inspection" to "Inspection", "replacement" to "Replacement", "modification" to "Modification", "not_applicable" to "Not applicable", "other" to "Other")

/** AD detail and compliance (M-MAINT-06). */
@Composable
fun AdDetail(recs: Recs, idArg: String) {
    val nav = LocalRecNav.current
    val id = idArg.substringBefore(':')
    val a = recs.watch(id) { recs.store.records("ad_compliance", recs.id).firstOrNull { it.id == id } }
    val context = LocalContext.current
    var recording by rememberSaveable { mutableStateOf(idArg.endsWith(":record")) }
    var stopping by remember { mutableStateOf(false) }
    val back = stringResource(R.string.maint_ads) to nav.back
    if (a == null) {
        Board(stringResource(R.string.maint_ads), Section.Maint, back = back) { Empty(stringResource(R.string.rec_gone)) }
        return
    }
    val record = a.row
    fun save(patch: Map<String, Any?>, label: String) {
        val full = JsonObject(record.filterKeys { it !in setOf("id", "aircraft_id", "created_at", "updated_at") } + json(*patch.toList().toTypedArray()))
        val payload = if (recs.store.mirror.raw("ad_compliance", id) != null) json("id" to id, "record" to full) else json("record" to full)
        recs.change("ad.upsert", "ad_compliance", id, label, payload)
    }
    val st = adStatus(a.s("status"), a.b("recurring"), recs.due("ad:$id"))
    val ref = a.s("ad_reference_id")?.let { recs.store.mirror.raw("ad_reference", it) }
    Board("${(a.s("kind") ?: "ad").uppercase()} ${a.s("reference")}", Section.Maint, back = back, toast = recs.toast, onToastDone = { recs.toast = null }) {
        a.s("title")?.let { Note(it) }
        Row(Modifier.padding(vertical = Tokens.Space.s2), verticalAlignment = Alignment.CenterVertically) { StatusMark(st.first, st.second) }
        Lede(adSentence(a.s("status"), a.b("recurring"), a.d("interval_hours"), a.d("interval_months")?.toInt(), a.s("complied_date"), a.d("complied_hours"), a.s("next_due_date"), a.d("next_due_hours"), a.s("reason"), recs.meter("tach")))
        PendingCaption(a)
        if (ref != null || a.s("applicability") != null) {
            GroupHeader(stringResource(R.string.maint_official_text))
            ref?.s("title")?.let { Lede(it, Modifier.padding(top = Tokens.Space.s2)) }
            (ref?.s("abstract") ?: a.s("applicability"))?.let { SelectionContainer { Note(it, Modifier.padding(top = Tokens.Space.s2)) } }
            ref?.s("fr_html_url")?.let { url -> DButton(stringResource(R.string.maint_read_full), { openCustomTab(context, url) }, kind = ButtonKind.Quiet) }
        }
        val history = recs.watch(id) { recs.store.records("item_completion", recs.id).filter { it.s("ad_compliance_id") == id }.sortedByDescending { it.s("done_date") } }
        GroupHeader(stringResource(R.string.maint_history))
        if (history.isEmpty()) Note(stringResource(R.string.maint_no_history), Modifier.padding(vertical = Tokens.Space.s2))
        history.forEach { h ->
            RecRow(listOfNotNull(h.s("done_date")?.let(::longDate), h.d("done_hours")?.let { "tach ${fmt1(it)}" }).joinToString(" · "), rec = h,
                below = { recs.pageLabel(h.s("log_entry_id"))?.let { PageCite(it, stringResource(R.string.your_note), Section.Books) } })
        }
        if (recs.canEdit) {
            if (recording) ComplianceForm(recs, a) { patch -> save(patch, "AD ${a.s("reference")} compliance"); recording = false; recs.toast = Toast(recs.str(R.string.rec_saved)) }
            else DButton(stringResource(R.string.maint_record_compliance), { recording = true }, kind = ButtonKind.Secondary, modifier = Modifier.padding(top = Tokens.Space.s3))
            AdSettings(a) { patch -> save(patch, "AD ${a.s("reference")}"); recs.toast = Toast(recs.str(R.string.rec_saved)) }
            DButton(stringResource(R.string.maint_stop_tracking), { stopping = true }, kind = ButtonKind.Quiet, modifier = Modifier.padding(top = Tokens.Space.s4))
        }
    }
    if (stopping) Confirm(stringResource(R.string.maint_stop_tracking_title, a.s("reference") ?: ""), stringResource(R.string.maint_stop_tracking_body), stringResource(R.string.maint_stop_tracking), {
        recs.delete("ad.delete", "ad_compliance", id, "Stop tracking AD ${a.s("reference")}", json("recordId" to id))
        nav.back()
    }, { stopping = false })
}

@Composable
private fun ComplianceForm(recs: Recs, a: Rec, onSave: (Map<String, Any?>) -> Unit) {
    var date by rememberSaveable { mutableStateOf<String?>(LocalDate.now().toString()) }
    var tach by rememberSaveable { mutableStateOf(fmt1(recs.meter("tach"))) }
    var method by rememberSaveable { mutableStateOf("inspection") }
    var entry by rememberSaveable { mutableStateOf<String?>(null) }
    var component by rememberSaveable { mutableStateOf(a.s("component_id")) }
    var notes by rememberSaveable { mutableStateOf("") }
    val components = remember { recs.store.records("component", recs.id).filter { it.b("is_installed") }.map { it.id to (it.s("name") ?: "") } }
    GroupHeader(stringResource(R.string.maint_record_compliance))
    DateRow(stringResource(R.string.maint_complied_on), date, { date = it }, pastOnly = true)
    Field(stringResource(R.string.maint_at_tach), tach, { tach = it }, number = true)
    Choice(stringResource(R.string.maint_how), METHODS, method) { method = it }
    EntryChoice(recs, stringResource(R.string.maint_entry_records), entry, allowNone = stringResource(R.string.maint_not_in_logbook)) { entry = it }
    if (components.isNotEmpty()) Choice(stringResource(R.string.maint_related_equipment), listOf("" to "None") + components, component ?: "") { component = it.ifEmpty { null } }
    Field(stringResource(R.string.maint_notes), notes, { notes = it }, lines = 2)
    DButton(stringResource(R.string.maint_save_compliance), {
        onSave(mapOf(
            "status" to (if (method == "not_applicable") "not_applicable" else "complied"), "complied_date" to date, "complied_hours" to num(tach),
            "method" to METHODS.first { it.first == method }.second, "reference_entry_id" to entry, "component_id" to component,
            "notes" to (notes.trim().ifEmpty { null } ?: a.s("notes")), "reason" to (if (method == "not_applicable") notes.trim().ifEmpty { null } else a.s("reason")),
        ))
    }, enabled = date != null && (method != "not_applicable" || notes.isNotBlank()), modifier = Modifier.padding(top = Tokens.Space.s2))
    if (method == "not_applicable" && notes.isBlank()) Note(stringResource(R.string.maint_why_required))
}

@Composable
private fun AdSettings(a: Rec, onSave: (Map<String, Any?>) -> Unit) {
    var recurring by rememberSaveable { mutableStateOf(a.b("recurring")) }
    var hours by rememberSaveable { mutableStateOf(fmtNum(a.d("interval_hours"))) }
    var months by rememberSaveable { mutableStateOf(a.d("interval_months")?.toInt()?.toString() ?: "") }
    var na by rememberSaveable { mutableStateOf(a.s("status") == "not_applicable") }
    var why by rememberSaveable { mutableStateOf(a.s("reason") ?: "") }
    GroupHeader(stringResource(R.string.maint_settings))
    Segmented(listOf(stringResource(R.string.maint_one_time), stringResource(R.string.maint_recurring)), if (recurring) 1 else 0) { recurring = it == 1 }
    if (recurring) Row(horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s2)) {
        Field(stringResource(R.string.maint_every_hours), hours, { hours = it }, Modifier.weight(1f), number = true)
        Field(stringResource(R.string.maint_every_months), months, { months = it.filter(Char::isDigit).take(3) }, Modifier.weight(1f), number = true)
    }
    Segmented(listOf(stringResource(R.string.maint_applies), stringResource(R.string.maint_not_applicable)), if (na) 1 else 0) { na = it == 1 }
    if (na) Field(stringResource(R.string.maint_why), why, { why = it }, lines = 2)
    DButton(stringResource(R.string.save), {
        onSave(mapOf(
            "recurring" to recurring, "interval_hours" to (if (recurring) num(hours) else null), "interval_months" to (if (recurring) months.toIntOrNull() else null),
            "status" to (if (na) "not_applicable" else if (a.s("status") == "not_applicable") "open" else a.s("status")), "reason" to (if (na) why.trim() else null),
        ))
    }, kind = ButtonKind.Secondary, enabled = !na || why.isNotBlank(), modifier = Modifier.padding(top = Tokens.Space.s2))
    if (na && why.isBlank()) Note(stringResource(R.string.maint_why_required))
}

/** Find ADs (M-MAINT-07): the FAA list by make and model, online only; tracking opens the new record. */
@Composable
fun FindAds(recs: Recs) {
    val nav = LocalRecNav.current
    val scope = rememberCoroutineScope()
    val sync by recs.store.sync.collectAsStateWithLifecycleCompat()
    val plane = remember { recs.store.mirror.raw("aircraft", recs.id) }
    val components = remember { recs.store.records("component", recs.id).filter { it.b("is_installed") } }
    val terms = remember { listOfNotNull(listOfNotNull(plane?.s("make"), plane?.s("model")).joinToString(" ").ifBlank { null }) + components.mapNotNull { listOfNotNull(it.s("make"), it.s("name")).joinToString(" ").ifBlank { null } }.take(4) }
    var q by rememberSaveable { mutableStateOf(terms.firstOrNull() ?: "") }
    var results by remember { mutableStateOf<List<FoundAd>?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var preview by remember { mutableStateOf<FoundAd?>(null) }
    val tracked = recs.watch { recs.store.records("ad_compliance", recs.id).mapNotNull { it.s("reference") }.toSet() }
    fun search() {
        if (q.isBlank()) return
        busy = true; error = null
        scope.launch {
            try { results = recs.api.findAds(q.trim()) } catch (e: CancellationException) { throw e } catch (e: Exception) { error = e.message } finally { busy = false }
        }
    }
    Board(stringResource(R.string.maint_find_ads_title), Section.Maint, back = stringResource(R.string.maint_ads) to nav.back) {
        if (!sync.online) { Empty(stringResource(R.string.maint_find_offline)); return@Board }
        Field(stringResource(R.string.rec_search), q, { q = it })
        if (terms.size > 1) Segmented(terms.map { it.take(14) }, terms.indexOf(q).takeIf { it >= 0 }) { q = terms[it]; search() }
        DButton(stringResource(R.string.maint_search), ::search, enabled = !busy && q.isNotBlank(), busyText = if (busy) stringResource(R.string.maint_searching) else null, icon = LucideIcons.Search)
        Note(stringResource(R.string.maint_find_lead), Modifier.padding(top = Tokens.Space.s2))
        error?.let { Note(it, alarm = true) }
        results?.let { list ->
            if (list.isEmpty()) Empty(stringResource(R.string.maint_find_none))
            list.forEach { ad ->
                val isTracked = ad.adNumber != null && ad.adNumber in tracked
                RecRow(
                    "AD ${ad.adNumber ?: "—"}", listOfNotNull(ad.title.take(120), ad.effectiveOn?.let { "Effective ${longDate(it)}" }, stringResource(R.string.maint_tracked).takeIf { isTracked }),
                    onClick = { preview = ad },
                    trailing = { if (isTracked) androidx.compose.material3.Icon(LucideIcons.Check, stringResource(R.string.maint_tracked), tint = MyTailLogTheme.colors.ink) },
                )
            }
        }
    }
    preview?.let { ad ->
        Sheet("AD ${ad.adNumber ?: ""}", { preview = null }, full = true) {
            Lede(ad.title)
            ad.abstract?.let { SelectionContainer { Note(it, Modifier.padding(vertical = Tokens.Space.s2)) } }
            if (recs.canEdit && ad.adNumber != null && ad.adNumber !in tracked) {
                fun track(): String {
                    val newId = newId()
                    recs.change("ad.track", "ad_compliance", newId, "Track AD ${ad.adNumber}", json("id" to newId, "kind" to "ad", "reference" to ad.adNumber, "title" to ad.title.take(500), "applicability" to ad.abstract))
                    return newId
                }
                ButtonPair(stringResource(R.string.maint_track_interval), { val i = track(); preview = null; nav.open(Routes.of(Routes.AD, i)) },
                    stringResource(R.string.maint_track), { val i = track(); preview = null; nav.open(Routes.of(Routes.AD, i)) })
            }
        }
    }
}

@Composable
fun <T> kotlinx.coroutines.flow.StateFlow<T>.collectAsStateWithLifecycleCompat() = collectAsStateWithLifecycle()


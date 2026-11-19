package com.mytaillog.app

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.isMetaPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mytaillog.core.api.Books
import com.mytaillog.core.api.BookWrites
import com.mytaillog.core.api.EntryRow
import com.mytaillog.core.domain.Mutation
import com.mytaillog.core.domain.PushResult
import com.mytaillog.design.ButtonKind
import com.mytaillog.design.DButton
import com.mytaillog.design.LucideIcons
import com.mytaillog.design.MyTailLogTheme
import com.mytaillog.design.Section
import com.mytaillog.design.Tokens
import com.mytaillog.design.TrustLevel
import com.mytaillog.design.TrustMark
import com.mytaillog.design.dTextFieldColors
import com.mytaillog.design.focusRing
import com.mytaillog.design.section
import com.mytaillog.design.toTextStyle
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.jsonPrimitive

/** What the owner said about one doubtful field (M-REVIEW-02): exactly three outcomes. */
sealed interface Outcome {
    data object LooksRight : Outcome
    data class Edited(val text: String) : Outcome
    data object NotOnPage : Outcome
}

/**
 * The writes that confirm one page: an entry with an edited or cleared field is updated (which
 * confirms it), every other entry read by AI is confirmed, then the page is marked reviewed.
 */
fun confirmPage(aircraftId: String, page: com.mytaillog.core.api.PageRow, entries: List<EntryRow>, outcomes: Map<String, Map<Field, Outcome>>): List<Mutation> =
    entries.map { e ->
        val changed = outcomes[e.id].orEmpty().mapNotNull { (f, o) ->
            when (o) {
                is Outcome.Edited -> if (o.text != e.editText(f)) f.column to parseField(f, o.text).getOrNull() else null
                Outcome.NotOnPage -> f.column to null
                Outcome.LooksRight -> null
            }
        }.toMap()
        if (changed.isEmpty()) BookWrites.confirm(aircraftId, e) else BookWrites.update(aircraftId, e, changed)
    } + BookWrites.reviewPage(aircraftId, page.id, "confirmed", page.updatedAt)

/** Undo (M-REVIEW-03): unconfirm the entries and the page, based on the rows the confirmation returned. */
fun undoPage(aircraftId: String, page: com.mytaillog.core.api.PageRow, entries: List<EntryRow>, results: List<PushResult>): List<Mutation> {
    fun base(i: Int) = results.getOrNull(i)?.row?.get("updated_at")?.jsonPrimitive?.content
    return entries.mapIndexed { i, e -> BookWrites.confirm(aircraftId, e, confirmed = false, base = base(i) ?: e.updatedAt) } +
        BookWrites.reviewPage(aircraftId, page.id, "unreviewed", base(entries.size) ?: page.updatedAt)
}

private class Done(val label: String, val count: Int, val undo: List<Mutation>, val queued: List<String> = emptyList())

/**
 * M-REVIEW-01..03 (phone, full screen, no tab bar) and T-REVIEW-01 ([wide]: page list | scan | fields).
 * The queue is fixed when the screen opens, so confirmed pages stay reachable with back.
 */
@Composable
fun ReviewScreen(vm: BooksViewModel, startPageId: String?, nav: BooksNav, wide: Boolean = false) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val b = ui.books ?: return
    val c = MyTailLogTheme.colors
    val queue = rememberSaveable { reviewQueue(b).map { it.id } }
    var index by rememberSaveable { mutableIntStateOf(queue.indexOf(startPageId).coerceAtLeast(0)) }
    var entryIx by remember(index) { mutableIntStateOf(0) }
    var field by remember(index) { mutableStateOf<Field?>(null) }
    val outcomes = remember(index) { mutableStateMapOf<String, Map<Field, Outcome>>() }
    var done by remember { mutableStateOf<Done?>(null) }
    var confirmed by rememberSaveable { mutableIntStateOf(0) }
    var busy by remember { mutableStateOf(false) }
    var editKey by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    LaunchedEffect(done) { if (done != null) { delay(6000); done = null } }

    val page = b.pages.firstOrNull { it.id == queue.getOrNull(index) }
    val entries = page?.let { entriesOn(b, it.id).filter { e -> e.trust == "ai_read" } }.orEmpty()
    val entry = entries.getOrNull(entryIx.coerceAtMost(entries.lastIndex))
    val aircraftId = ui.aircraft?.aircraft?.id ?: return
    val ready = entries.all { e -> Field.entries.filter(e::doubtful).all { outcomes[e.id]?.get(it) != null } }

    fun outcome(o: Outcome) {
        val e = entry ?: return
        val f = field ?: return
        if (!ui.canEdit) return
        outcomes[e.id] = outcomes[e.id].orEmpty() + (f to o)
        // Next doubtful field without an outcome, on this entry or the next.
        val next = entries.flatMap { x -> reviewFields(x).filter { x.doubtful(it) && outcomes[x.id]?.get(it) == null }.map { x to it } }.firstOrNull()
        if (next != null) { entryIx = entries.indexOf(next.first); field = next.second } else field = null
    }
    fun confirm() {
        if (page == null || !ready || busy || !ui.canEdit) return
        busy = true
        scope.launch {
            val writes = confirmPage(aircraftId, page, entries, outcomes)
            val results = vm.write(writes)
            busy = false
            if (results != null) {
                haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                // Kept on this phone (empty results): undo takes them back out of the outbox.
                done = if (results.isEmpty()) Done(pageLabel(b, page.id) ?: "", entries.size, emptyList(), writes.map { it.id })
                else Done(pageLabel(b, page.id) ?: "", entries.size, undoPage(aircraftId, page, entries, results))
                confirmed += entries.size
                index++
            }
        }
    }
    fun undo() {
        val d = done ?: return
        done = null
        if (d.queued.isNotEmpty()) { vm.unqueue(d.queued); confirmed -= d.count; index = (index - 1).coerceAtLeast(0); return }
        scope.launch { if (vm.write(d.undo) != null) { confirmed -= d.count; index = (index - 1).coerceAtLeast(0) } }
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(c.cover)
            .windowInsetsPadding(WindowInsets.statusBars)
            .windowInsetsPadding(WindowInsets.navigationBars)
            .focusRequester(focus)
            .focusable()
            .onPreviewKeyEvent { k ->
                // T-REVIEW-01 keys: A / E / X outcomes, ↑ ↓ fields, ⌘← ⌘→ pages, Enter confirm, ⌘Z undo.
                if (k.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                val mod = k.isCtrlPressed || k.isMetaPressed
                val fields = entry?.let(::reviewFields).orEmpty()
                when {
                    k.key == Key.A && field != null -> outcome(Outcome.LooksRight)
                    k.key == Key.X && field != null -> outcome(Outcome.NotOnPage)
                    k.key == Key.E && field != null -> editKey++
                    k.key == Key.DirectionDown && !mod -> field = fields.getOrNull(fields.indexOf(field) + 1) ?: field
                    k.key == Key.DirectionUp && !mod -> field = fields.getOrNull(fields.indexOf(field) - 1)
                    k.key == Key.DirectionRight && mod -> index = (index + 1).coerceAtMost(queue.size)
                    k.key == Key.DirectionLeft && mod -> index = (index - 1).coerceAtLeast(0)
                    k.key == Key.Enter && field == null -> confirm()
                    k.key == Key.Z && mod -> undo()
                    else -> return@onPreviewKeyEvent false
                }
                true
            },
    ) {
        ReviewHeader(
            back = stringResource(if (startPageId == null) R.string.books_tab_review_plain else R.string.section_books),
            onBack = nav.back,
            title = page?.let { pageLabel(b, it.id) },
            sub = if (page != null) stringResource(R.string.review_n_of, index + 1, queue.size) else null,
            prev = if (index > 0) ({ index-- }) else null,
            next = if (index < queue.size - 1) ({ index++ }) else null,
        )
        done?.let { d ->
            Row(Modifier.fillMaxWidth().background(c.leaf2).padding(horizontal = Tokens.Space.s4).semantics { liveRegion = LiveRegionMode.Polite }, verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.review_confirmed_toast, d.label, d.count), color = c.ink, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                TextButton(::undo, Modifier.heightIn(min = Tokens.Size.phoneTouchMin)) { Text(stringResource(R.string.undo), color = c.ink, fontWeight = FontWeight(700)) }
            }
        }
        MessageBar(ui.message, vm::messageShown)
        if (page == null) {
            ReviewEnd(index, confirmed, nav)
            return@Column
        }
        val scan = rememberScan(vm, page.id)
        val name = pageLabel(b, page.id) ?: ""
        val drawer: @Composable ColumnScope.() -> Unit = {
            Drawer(b, ui.canEdit, entries, entry, field, outcomes, ready, busy, wide, page.unreadRotated, page.ocrText, editKey,
                onEntry = { entryIx = it; field = null }, onField = { field = it }, onOutcome = ::outcome, onConfirm = ::confirm)
        }
        if (wide) {
            Row(Modifier.fillMaxSize()) {
                Column(Modifier.width(200.dp).fillMaxHeight().background(c.leaf).padding(horizontal = Tokens.Space.s3).verticalScroll(rememberScrollState())) {
                    queue.forEachIndexed { i, id ->
                        b.pages.firstOrNull { it.id == id }?.let { p -> QueueRow(b, p, selected = i == index) { index = i } }
                    }
                }
                Box(Modifier.weight(1f).fillMaxHeight()) {
                    ScanViewer(scan, name, Modifier.fillMaxSize(), outline = entry?.let(::entryBox), highlight = field?.let { entry?.box(it) })
                }
                Column(Modifier.width(340.dp).fillMaxHeight().background(c.leaf), content = drawer)
            }
        } else {
            val box = field?.let { entry?.box(it) }
            BoxWithConstraints(Modifier.fillMaxSize()) {
                val drawerHeight = maxHeight * (if (field != null) 0.62f else 0.5f)
                Column(Modifier.fillMaxSize()) {
                    Box(Modifier.weight(1f).fillMaxWidth()) {
                        // M-REVIEW-02 zooms the page to the field's ink; otherwise the whole page.
                        if (box != null) ScanCrop(scan, name, Modifier.fillMaxSize(), crop = box.grown(0.06), outline = entry?.let(::entryBox), highlight = box)
                        else ScanViewer(scan, name, Modifier.fillMaxSize(), outline = entry?.let(::entryBox))
                    }
                    Column(Modifier.fillMaxWidth().height(drawerHeight).background(c.leaf), content = drawer)
                }
            }
        }
    }
}

@Composable
private fun ReviewHeader(back: String, onBack: () -> Unit, title: String?, sub: String?, prev: (() -> Unit)?, next: (() -> Unit)?) {
    val c = MyTailLogTheme.colors
    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = Tokens.Space.s2), verticalAlignment = Alignment.CenterVertically) {
        Row(
            Modifier.heightIn(min = Tokens.Size.phoneTouchMin).focusRing().clickable(role = Role.Button, onClick = onBack)
                .semantics(mergeDescendants = true) { contentDescription = "Back to $back" }.padding(end = Tokens.Space.s2),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(LucideIcons.ChevronLeft, contentDescription = null, tint = c.onCover, modifier = Modifier.size(20.dp))
            Text(back, color = c.onCover, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight(600)))
        }
        Box(Modifier.weight(1f))
        prev?.let { IconBtn(LucideIcons.ChevronLeft, stringResource(R.string.review_previous_page), it) }
        Column(horizontalAlignment = Alignment.End, modifier = Modifier.semantics(mergeDescendants = true) { heading() }) {
            title?.let { Text(it, color = c.onCover, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight(700))) }
            sub?.let { Text(it, color = c.onCover2, style = MaterialTheme.typography.labelMedium) }
        }
        next?.let { IconBtn(LucideIcons.ChevronRight, stringResource(R.string.review_next_page), it) }
    }
}

@Composable
private fun IconBtn(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    Box(
        Modifier.size(Tokens.Size.phoneTouchMin).focusRing().clickable(role = Role.Button, onClick = onClick).semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) { Icon(icon, contentDescription = null, tint = MyTailLogTheme.colors.onCover, modifier = Modifier.size(22.dp)) }
}

/** End of queue (M-REVIEW-03). */
@Composable
private fun ReviewEnd(index: Int, confirmed: Int, nav: BooksNav) {
    val c = MyTailLogTheme.colors
    Column(Modifier.fillMaxSize().background(c.leaf).padding(Tokens.Space.s4)) {
        Text(
            if (index == 0) stringResource(R.string.books_queue_empty) else stringResource(R.string.review_all_done, index, confirmed),
            color = c.ink, style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() },
        )
        DButton(stringResource(if (index == 0) R.string.review_back_to_books else R.string.done), nav.back, modifier = Modifier.padding(top = Tokens.Space.s4))
    }
}

/** The drawer: entry title and trust, field rows least certain first, or the doubtful field's panel. */
@Composable
private fun ColumnScope.Drawer(
    b: Books,
    canEdit: Boolean,
    entries: List<EntryRow>,
    entry: EntryRow?,
    field: Field?,
    outcomes: Map<String, Map<Field, Outcome>>,
    ready: Boolean,
    busy: Boolean,
    keyHints: Boolean,
    sideways: Boolean,
    rawText: String?,
    editKey: Int,
    onEntry: (Int) -> Unit,
    onField: (Field?) -> Unit,
    onOutcome: (Outcome) -> Unit,
    onConfirm: () -> Unit,
) {
    val c = MyTailLogTheme.colors
    Column(Modifier.fillMaxWidth().padding(horizontal = Tokens.Space.s4)) {
        Box(Modifier.padding(top = Tokens.Space.s2).align(Alignment.CenterHorizontally).size(36.dp, 4.dp).clip(RoundedCornerShape(Tokens.Radius.pill)).background(c.rule2))
    }
    Column(Modifier.fillMaxWidth().weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = Tokens.Space.s4)) {
        if (entry == null) {
            Text(stringResource(R.string.review_no_entries), color = c.ink, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(top = Tokens.Space.s3))
            return@Column
        }
        val ix = entries.indexOf(entry)
        Row(Modifier.padding(top = Tokens.Space.s2), verticalAlignment = Alignment.CenterVertically) {
            if (field != null) IconBtnInk(LucideIcons.ChevronLeft, stringResource(R.string.review_back_to_entry)) { onField(null) }
            Text(
                stringResource(R.string.review_entry_of, ix + 1, entries.size, entryTitle(entry)), color = c.ink,
                style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight(700)), modifier = Modifier.weight(1f).semantics { heading() },
            )
            TrustMark(TrustLevel.AiRead, stringResource(R.string.trust_ai))
        }
        if (sideways) Meta(stringResource(R.string.review_sideways), Modifier.padding(top = Tokens.Space.s1))
        if (field != null) {
            DoubtPanel(entry, field, outcomes[entry.id]?.get(field), canEdit, keyHints, rawText, editKey, onOutcome)
            return@Column
        }
        if (entries.size > 1) Row {
            if (ix > 0) TextButton({ onEntry(ix - 1) }) { Text(stringResource(R.string.review_previous_entry), color = c.ink) }
            Box(Modifier.weight(1f))
            if (ix < entries.lastIndex) TextButton({ onEntry(ix + 1) }) { Text(stringResource(R.string.review_next_entry), color = c.ink) }
        }
        val fields = reviewFields(entry)
        if (fields.none(entry::doubtful)) Meta(stringResource(R.string.review_reads_cleanly), Modifier.padding(top = Tokens.Space.s1))
        fields.forEach { f -> FieldRow(entry, f, outcomes[entry.id]?.get(f)) { onField(f) } }
        if (!canEdit) Meta(stringResource(R.string.review_viewer), Modifier.padding(top = Tokens.Space.s3))
    }
    if (canEdit && field == null && entry != null) {
        DButton(
            stringResource(R.string.review_confirm_next) + if (keyHints) "  ⏎" else "",
            onConfirm, enabled = ready, busyText = if (busy) stringResource(R.string.saving) else null,
            modifier = Modifier.padding(Tokens.Space.s4),
        )
    }
}

@Composable
private fun IconBtnInk(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    Box(
        Modifier.size(Tokens.Size.phoneTouchMin).focusRing().clickable(role = Role.Button, onClick = onClick).semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) { Icon(icon, contentDescription = null, tint = MyTailLogTheme.colors.ink, modifier = Modifier.size(22.dp)) }
}

/** ReviewField row (02): label, value (paper fields in Literata), and a check or the doubt chip. Status is words, not colour. */
@Composable
private fun FieldRow(e: EntryRow, f: Field, o: Outcome?, onClick: () -> Unit) {
    val c = MyTailLogTheme.colors
    val value = when (o) {
        is Outcome.Edited -> o.text.ifBlank { null }
        Outcome.NotOnPage -> null
        else -> e.value(f)
    }
    val state = when {
        o == Outcome.NotOnPage -> stringResource(R.string.review_absent_done)
        o != null -> stringResource(R.string.review_checked)
        e.doubtful(f) -> stringResource(R.string.review_doubt)
        else -> null
    }
    Row(
        Modifier.fillMaxWidth().heightIn(min = Tokens.Size.phoneRowMin).focusRing().clickable(role = Role.Button, onClick = onClick)
            .semantics(mergeDescendants = true) { contentDescription = listOfNotNull(f.label, value ?: "empty", state).joinToString(", ") }
            .padding(vertical = Tokens.Space.s2),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s3),
    ) {
        Column(Modifier.weight(1f)) {
            Text(f.label, color = c.ink3, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight(700)))
            Text(value ?: "—", color = c.ink, style = if (f.paper) Tokens.PhoneType.paper.toTextStyle() else MaterialTheme.typography.bodyLarge.copy(fontSize = 17.sp), maxLines = 3)
        }
        when {
            o != null -> Icon(LucideIcons.Check, contentDescription = null, tint = c.ink, modifier = Modifier.size(20.dp))
            e.doubtful(f) -> Row(
                Modifier.background(c.alarmBg, RoundedCornerShape(Tokens.Radius.pill)).padding(horizontal = 8.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Icon(LucideIcons.CircleHelp, contentDescription = null, tint = c.alarmText, modifier = Modifier.size(14.dp))
                Text(stringResource(R.string.review_check), color = c.alarmText, style = MaterialTheme.typography.labelMedium)
            }
        }
    }
    Box(Modifier.fillMaxWidth().heightIn(min = 1.dp).background(c.rule))
}

/** M-REVIEW-02: the field's value, editable, and exactly three outcomes. */
@Composable
private fun DoubtPanel(e: EntryRow, f: Field, o: Outcome?, canEdit: Boolean, keyHints: Boolean, rawText: String?, editKey: Int, onOutcome: (Outcome) -> Unit) {
    val c = MyTailLogTheme.colors
    var text by remember(e.id, f) { mutableStateOf((o as? Outcome.Edited)?.text ?: e.editText(f)) }
    var editing by remember(e.id, f) { mutableStateOf(false) }
    var raw by remember { mutableStateOf(false) }
    val edit = remember(e.id, f) { FocusRequester() }
    // The E key (T-REVIEW-01) does what the Edit button does.
    LaunchedEffect(editKey) { if (editKey > 0 && canEdit) { editing = true; runCatching { edit.requestFocus() } } }
    val bad = parseField(f, text).isFailure
    Row(Modifier.padding(top = Tokens.Space.s3), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s2)) {
        Text(f.label, color = c.ink, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight(700)))
        if (e.doubtful(f)) Text(stringResource(R.string.review_read_with_doubt), color = c.alarmText, style = MaterialTheme.typography.labelMedium)
    }
    OutlinedTextField(
        text, { text = it; editing = true }, enabled = canEdit, colors = dTextFieldColors(), isError = bad,
        textStyle = if (f.paper) Tokens.PhoneType.paper.toTextStyle() else MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight(700)),
        keyboardOptions = if (f.numeric) KeyboardOptions(keyboardType = KeyboardType.Decimal) else KeyboardOptions.Default,
        supportingText = if (bad) { { Text(stringResource(if (f == Field.Date) R.string.books_bad_date else R.string.books_bad_number)) } } else null,
        modifier = Modifier.fillMaxWidth().padding(top = Tokens.Space.s1).focusRequester(edit),
    )
    e.confidence(f)?.let { Meta(stringResource(R.string.review_reason, (it * 100).toInt()), Modifier.padding(top = Tokens.Space.s1)) }
    if (canEdit) {
        Column(Modifier.padding(top = Tokens.Space.s3), verticalArrangement = Arrangement.spacedBy(Tokens.Space.s2)) {
            if (editing) {
                DButton(stringResource(R.string.save), { onOutcome(Outcome.Edited(text)) }, enabled = !bad, icon = LucideIcons.Check)
            } else {
                DButton(stringResource(R.string.review_looks_right) + hint(keyHints, "A"), { onOutcome(Outcome.LooksRight) }, icon = LucideIcons.Check)
                DButton(stringResource(R.string.review_edit) + hint(keyHints, "E"), { editing = true; runCatching { edit.requestFocus() } }, kind = ButtonKind.Secondary, icon = LucideIcons.Pencil)
            }
            DButton(stringResource(R.string.review_absent) + hint(keyHints, "X"), { onOutcome(Outcome.NotOnPage) }, kind = ButtonKind.Quiet)
        }
    }
    if (!rawText.isNullOrBlank()) {
        TextButton({ raw = !raw }) { Text(stringResource(R.string.review_raw), color = c.ink) }
        if (raw) Text(rawText, color = c.ink2, style = Tokens.PhoneType.paper.toTextStyle().copy(fontSize = 14.sp))
    }
}

private fun hint(on: Boolean, key: String) = if (on) "  $key" else ""

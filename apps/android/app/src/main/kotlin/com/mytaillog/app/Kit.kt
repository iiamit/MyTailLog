package com.mytaillog.app

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalAccessibilityManager
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mytaillog.design.ButtonKind
import com.mytaillog.design.DButton
import com.mytaillog.design.LucideIcons
import com.mytaillog.design.MyTailLogTheme
import com.mytaillog.design.PhoneHeader
import com.mytaillog.design.PhoneLeaf
import com.mytaillog.design.Section
import com.mytaillog.design.StateLayerIndication
import com.mytaillog.design.SyncLine
import com.mytaillog.design.Tokens
import com.mytaillog.design.dTextFieldColors
import com.mytaillog.design.focusRing
import com.mytaillog.design.section
import kotlinx.coroutines.delay
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

// The phone kit phase 4's screens share: a board with its leaf, rows with their pending state,
// form fields, sheets, confirmations and the toast (06 §1.1–1.8).

/** A message shown above the tab bar for 6 s (10 s with an action), read out when it appears (06 §1.2). */
data class Toast(val text: String, val action: String? = null, val onAction: () -> Unit = {})

/** A top-level or pushed phone screen: PhoneHeader, the sync bars, a scrolling leaf, a pinned footer and the toast. */
@Composable
fun Board(
    title: String,
    section: Section,
    back: Pair<String, () -> Unit>? = null,
    status: StatusHost? = null,
    toast: Toast? = null,
    onToastDone: () -> Unit = {},
    top: @Composable () -> Unit = {},
    footer: (@Composable ColumnScope.() -> Unit)? = null,
    scroll: Boolean = true,
    content: @Composable ColumnScope.() -> Unit,
) {
    val c = MyTailLogTheme.colors
    val tablet = LocalRecNav.current.tablet
    Column(Modifier.fillMaxSize().let { if (tablet) it else it.background(c.section(section).board) }) {
        if (tablet) {
            // Tablet: the leaf is the shell's; the screen brings its title and, inside a detail, a way back.
            back?.let { (label, go) -> TextButton(go, modifier = Modifier.heightIn(min = 44.dp)) { Text(label, color = c.ink, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight(600))) } }
            if (back != null) Title(title, Modifier.padding(bottom = Tokens.Space.s2)) // a list's title is the board's
            top()
        } else {
            AircraftHeader(title, section, back, status)
            top()
            CaptureBar()
        }
        val leaf: @Composable (Modifier, @Composable androidx.compose.foundation.layout.BoxScope.() -> Unit) -> Unit =
            if (tablet) { m, inner -> Box(m.fillMaxWidth(), content = inner) } else { m, inner -> PhoneLeaf(m, inner) }
        leaf(Modifier.weight(1f)) {
            Column(Modifier.fillMaxSize()) {
                Column(Modifier.weight(1f).let { if (scroll) it.verticalScroll(rememberScrollState()) else it }) {
                    content()
                    Spacer(Modifier.height(96.dp)) // clear of the AddButton
                }
                footer?.let { Column(Modifier.fillMaxWidth().padding(top = Tokens.Space.s2), verticalArrangement = Arrangement.spacedBy(Tokens.Space.s2), content = it) }
            }
            toast?.let { ToastBar(it, onToastDone, Modifier.align(Alignment.BottomCenter)) }
        }
    }
}

/** PhoneHeader with the SyncLine and its aircraft menu on top-level screens (06 §1.1, §1.3). */
@Composable
private fun AircraftHeader(title: String, section: Section, back: Pair<String, () -> Unit>?, status: StatusHost?) {
    var switching by remember { mutableStateOf(false) }
    val a = status?.ui?.current
    val state = withOutbox(syncState(status?.ui?.snapshot?.computedAt, Instant.now(), java.time.ZoneId.systemDefault()))
    Box {
        PhoneHeader(title, section, back = back, syncLine = a?.let { SyncLine(it.aircraft.tailNumber, state, stringResource(R.string.status_switch, it.aircraft.tailNumber, state)) { switching = true } })
        status?.let { AircraftMenu(it, switching) { switching = false } }
    }
}

@Composable
fun ToastBar(t: Toast, onDone: () -> Unit, modifier: Modifier = Modifier) {
    val c = MyTailLogTheme.colors
    val screenReader = LocalAccessibilityManager.current != null
    LaunchedEffect(t) {
        delay(if (screenReader) 20_000 else if (t.action != null) 10_000 else 6_000)
        onDone()
    }
    Row(
        modifier.fillMaxWidth().heightIn(min = 48.dp).clip(RoundedCornerShape(Tokens.Radius.m)).background(c.ink)
            .padding(horizontal = Tokens.Space.s4).semantics { liveRegion = LiveRegionMode.Polite },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(t.text, color = c.leaf, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f).padding(vertical = Tokens.Space.s2))
        t.action?.let { a -> TextButton({ t.onAction(); onDone() }) { Text(a, color = c.leaf, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight(700))) } }
    }
}

/** 06 §1.4's caption under a row: on this phone, refused, or changed in two places. */
@Composable
fun PendingCaption(rec: Rec?) {
    rec ?: return
    val c = MyTailLogTheme.colors
    val (text, alarm) = when {
        rec.conflict -> stringResource(R.string.sync_two_places) to true
        rec.refused != null -> stringResource(R.string.rec_not_saved, rec.refused) to true
        rec.pending -> stringResource(R.string.rec_on_phone) to false
        else -> return
    }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.padding(top = 2.dp)) {
        Icon(LucideIcons.CloudUpload, null, tint = if (alarm) c.alarmText else c.ink3, modifier = Modifier.size(14.dp))
        Text(text, color = if (alarm) c.alarmText else c.ink3, style = MaterialTheme.typography.labelMedium)
    }
}

/** One record row: title 16/700, lines under it, an optional right side, its pending caption, and the long-press menu (06 §1.7). */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun RecRow(
    title: String,
    lines: List<String> = emptyList(),
    rec: Rec? = null,
    onClick: (() -> Unit)? = null,
    menu: List<Pair<String, () -> Unit>> = emptyList(),
    trailing: (@Composable RowScope.() -> Unit)? = null,
    below: (@Composable ColumnScope.() -> Unit)? = null,
) {
    val c = MyTailLogTheme.colors
    var open by remember { mutableStateOf(false) }
    val haptics = LocalHapticFeedback.current
    Box {
        Column(
            Modifier.fillMaxWidth().heightIn(min = Tokens.Size.rowMin).focusRing()
                .combinedClickable(
                    enabled = onClick != null || menu.isNotEmpty(),
                    indication = StateLayerIndication(c.ink), interactionSource = null,
                    onClick = { onClick?.invoke() ?: run { open = true } },
                    onLongClick = if (menu.isNotEmpty()) ({ haptics.performHapticFeedback(HapticFeedbackType.LongPress); open = true }) else null,
                )
                .semantics { if (menu.isNotEmpty()) customActions = menu.map { (l, a) -> CustomAccessibilityAction(l) { a(); true } } }
                .padding(vertical = Tokens.Space.s3),
        ) {
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s3)) {
                Column(Modifier.weight(1f)) {
                    if (title.isNotEmpty()) Text(title, color = c.ink, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight(700)))
                    lines.forEach { Text(it, color = c.ink2, style = MaterialTheme.typography.bodyMedium) }
                    PendingCaption(rec)
                }
                trailing?.invoke(this)
            }
            below?.invoke(this)
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(c.rule).align(Alignment.BottomStart))
        DropdownMenu(open, { open = false }, containerColor = c.leaf) {
            menu.forEach { (label, act) -> DropdownMenuItem(text = { Text(label, color = c.ink) }, onClick = { open = false; act() }) }
        }
    }
}

@Composable
fun Lede(text: String, modifier: Modifier = Modifier) =
    Text(text, color = MyTailLogTheme.colors.ink, style = MaterialTheme.typography.bodyLarge, modifier = modifier)

@Composable
fun Note(text: String, modifier: Modifier = Modifier, alarm: Boolean = false) =
    Text(text, color = if (alarm) MyTailLogTheme.colors.alarmText else MyTailLogTheme.colors.ink3, style = MaterialTheme.typography.bodyMedium, modifier = modifier)

@Composable
fun Title(text: String, modifier: Modifier = Modifier) =
    Text(text, color = MyTailLogTheme.colors.ink, style = MaterialTheme.typography.titleLarge.copy(fontSize = 22.sp, fontWeight = FontWeight(800)), modifier = modifier.semantics { heading() })

/** A leaf-2 well (02 §8): a note, a nudge, or the preview of a form's result. */
@Composable
fun Well(modifier: Modifier = Modifier, alarm: Boolean = false, content: @Composable ColumnScope.() -> Unit) {
    val c = MyTailLogTheme.colors
    Column(
        modifier.fillMaxWidth().padding(vertical = Tokens.Space.s2).clip(RoundedCornerShape(Tokens.Radius.m))
            .background(if (alarm) c.alarmBg else c.leaf2).padding(Tokens.Space.s3),
        verticalArrangement = Arrangement.spacedBy(Tokens.Space.s2), content = content,
    )
}

/** EmptyState (06 §1.6): one sentence and one button that fixes it. */
@Composable
fun Empty(text: String, button: String? = null, onClick: () -> Unit = {}) {
    Column(Modifier.padding(vertical = Tokens.Space.s4), verticalArrangement = Arrangement.spacedBy(Tokens.Space.s3)) {
        Lede(text)
        button?.let { DButton(it, onClick, kind = ButtonKind.Secondary) }
    }
}

/** A text field restyled per 06 §1.8; [number] brings the decimal keypad and keeps only digits and one point. */
@Composable
fun Field(label: String, value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier, number: Boolean = false, lines: Int = 1, placeholder: String? = null) {
    OutlinedTextField(
        value,
        { v -> onChange(if (number) v.filter { it.isDigit() || it == '.' }.let { s -> val i = s.indexOf('.'); if (i < 0) s else s.take(i + 1) + s.drop(i + 1).replace(".", "") }.take(10) else v) },
        label = { Text(label) },
        placeholder = placeholder?.let { { Text(it) } },
        singleLine = lines == 1, minLines = lines,
        keyboardOptions = if (number) KeyboardOptions(keyboardType = KeyboardType.Decimal) else KeyboardOptions.Default,
        colors = dTextFieldColors(),
        modifier = modifier.fillMaxWidth().padding(vertical = Tokens.Space.s1),
    )
}

/** A date row: label, the date or "Not set", **Change** opens the Material date picker (06 §1.8). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DateRow(label: String, iso: String?, onPick: (String?) -> Unit, pastOnly: Boolean = false, clearable: Boolean = false) {
    val c = MyTailLogTheme.colors
    var open by rememberSaveable { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth().heightIn(min = 52.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(label, color = c.ink3, style = MaterialTheme.typography.labelMedium)
            Text(iso?.let(::longDate) ?: stringResource(R.string.rec_not_set), color = c.ink, style = MaterialTheme.typography.bodyLarge)
        }
        if (clearable && iso != null) TextButton({ onPick(null) }) { Text(stringResource(R.string.rec_clear), color = c.ink) }
        TextButton({ open = true }, modifier = Modifier.heightIn(min = 44.dp)) { Text(stringResource(R.string.rec_change), color = c.ink, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight(700))) }
    }
    if (open) {
        val todayMs = LocalDate.now().atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli()
        val state = rememberDatePickerState(
            initialSelectedDateMillis = iso?.let { runCatching { LocalDate.parse(it.take(10)).atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli() }.getOrNull() } ?: todayMs,
            selectableDates = if (pastOnly) object : SelectableDates { override fun isSelectableDate(utcTimeMillis: Long) = utcTimeMillis <= todayMs } else object : SelectableDates {},
        )
        DatePickerDialog(
            onDismissRequest = { open = false },
            confirmButton = { TextButton({ open = false; state.selectedDateMillis?.let { onPick(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString()) } }) { Text(stringResource(R.string.ok), color = c.ink) } },
            dismissButton = { TextButton({ open = false }) { Text(stringResource(R.string.cancel), color = c.ink) } },
        ) { DatePicker(state) }
    }
}

/** D Segmented on the leaf: equal segments with the control border; the chosen one ink (06 §1.8). */
@Composable
fun Segmented(options: List<String>, selected: Int?, modifier: Modifier = Modifier, onSelect: (Int) -> Unit) {
    val c = MyTailLogTheme.colors
    Row(modifier.fillMaxWidth().padding(vertical = Tokens.Space.s1).selectableGroup(), horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s1)) {
        options.forEachIndexed { i, o ->
            val on = i == selected
            Box(
                Modifier.weight(1f).heightIn(min = 44.dp).clip(RoundedCornerShape(Tokens.Radius.m))
                    .background(if (on) c.ink else c.leaf).border(1.dp, if (on) c.ink else c.controlBorder, RoundedCornerShape(Tokens.Radius.m))
                    .focusRing().selectable(on, role = Role.RadioButton, interactionSource = null, indication = StateLayerIndication(c.ink)) { onSelect(i) },
                contentAlignment = Alignment.Center,
            ) { Text(o, color = if (on) c.leaf else c.ink, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight(if (on) 800 else 600)), maxLines = 1) }
        }
    }
}

/** Radio rows with each meaning read after its name (06 M-MAINT-03 severity). */
@Composable
fun RadioRows(options: List<Pair<String, String>>, selected: Int?, onSelect: (Int) -> Unit) {
    val c = MyTailLogTheme.colors
    Column(Modifier.selectableGroup()) {
        options.forEachIndexed { i, (name, meaning) ->
            Row(
                Modifier.fillMaxWidth().heightIn(min = 58.dp).focusRing().selectable(i == selected, role = Role.RadioButton, interactionSource = null, indication = StateLayerIndication(c.ink)) { onSelect(i) },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                RadioButton(i == selected, null, colors = RadioButtonDefaults.colors(selectedColor = c.ink, unselectedColor = c.controlBorder))
                Column(Modifier.padding(start = Tokens.Space.s2)) {
                    Text(name, color = c.ink, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight(700)))
                    Text(meaning, color = c.ink2, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}

/** A short choice list: the field shows the choice; tapping opens a menu (06 §1.8 ExposedDropdownMenu stand-in). */
@Composable
fun Choice(label: String, options: List<Pair<String, String>>, selected: String?, onSelect: (String) -> Unit) {
    val c = MyTailLogTheme.colors
    var open by remember { mutableStateOf(false) }
    Box {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 52.dp).focusRing().combinedClickableCompat { open = true }.padding(vertical = Tokens.Space.s1),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(label, color = c.ink3, style = MaterialTheme.typography.labelMedium)
                Text(options.firstOrNull { it.first == selected }?.second ?: stringResource(R.string.rec_choose), color = c.ink, style = MaterialTheme.typography.bodyLarge)
            }
            Icon(LucideIcons.ChevronDown, null, tint = c.ink, modifier = Modifier.size(20.dp))
        }
        DropdownMenu(open, { open = false }, containerColor = c.leaf) {
            options.forEach { (k, v) -> DropdownMenuItem(text = { Text(v, color = c.ink) }, onClick = { open = false; onSelect(k) }) }
        }
    }
}

@Composable
private fun Modifier.combinedClickableCompat(onClick: () -> Unit) =
    this.selectable(false, role = Role.DropdownList, interactionSource = null, indication = StateLayerIndication(MyTailLogTheme.colors.ink), onClick = onClick)

/** A destructive confirmation: what goes and whether it can be undone, the action in alarm text (06 §1.2). */
@Composable
fun Confirm(title: String, body: String?, confirm: String, onConfirm: () -> Unit, onDismiss: () -> Unit, keep: String = stringResource(R.string.cancel), alarm: Boolean = true) {
    val c = MyTailLogTheme.colors
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = body?.let { { Text(it) } },
        confirmButton = { TextButton({ onDismiss(); onConfirm() }, colors = ButtonDefaults.textButtonColors(contentColor = if (alarm) c.alarmText else c.ink)) { Text(confirm) } },
        dismissButton = { TextButton(onDismiss, colors = ButtonDefaults.textButtonColors(contentColor = c.ink)) { Text(keep) } },
        containerColor = c.leaf, titleContentColor = c.ink, textContentColor = c.ink,
    )
}

/** A task sheet on the leaf with a title and a Close button (06 §1.2). [dirty] asks before it goes. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Sheet(title: String, onDismiss: () -> Unit, dirty: Boolean = false, discardWhat: String? = null, full: Boolean = false, content: @Composable ColumnScope.() -> Unit) {
    val c = MyTailLogTheme.colors
    var asking by remember { mutableStateOf(false) }
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = full, confirmValueChange = { v -> if (dirty && v == androidx.compose.material3.SheetValue.Hidden) { asking = true; false } else true })
    ModalBottomSheet(onDismissRequest = { if (dirty) asking = true else onDismiss() }, sheetState = state, containerColor = c.leaf) {
        Column(Modifier.padding(horizontal = Tokens.Space.s4).padding(bottom = Tokens.Space.s6).verticalScroll(rememberScrollState())) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Title(title, Modifier.weight(1f))
                TextButton({ if (dirty) asking = true else onDismiss() }, modifier = Modifier.size(48.dp)) { Icon(LucideIcons.X, stringResource(R.string.close), tint = c.ink) }
            }
            content()
        }
    }
    if (asking) Confirm(stringResource(R.string.rec_discard_title, discardWhat ?: stringResource(R.string.rec_discard_this)), null, stringResource(R.string.rec_discard), onDismiss, { asking = false }, keep = stringResource(R.string.rec_keep_editing))
}

/** A pinned row of the two main buttons of a pushed screen (06 M-MAINT-02). */
@Composable
fun ButtonPair(secondary: String, onSecondary: () -> Unit, primary: String, onPrimary: () -> Unit, secondaryIcon: ImageVector? = null, secondaryEnabled: Boolean = true) {
    Row(horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s2)) {
        DButton(secondary, onSecondary, kind = ButtonKind.Secondary, icon = secondaryIcon, enabled = secondaryEnabled, modifier = Modifier.weight(1f))
        DButton(primary, onPrimary, modifier = Modifier.weight(1f))
    }
}

/** "Jul 14, 2026" from an ISO date (12 §3 dates). */
fun longDate(iso: String): String = runCatching {
    LocalDate.parse(iso.take(10)).format(java.time.format.DateTimeFormatter.ofPattern("MMM d, yyyy", java.util.Locale.US))
}.getOrDefault(iso)

/** "Oct 21" this year, else "Oct 21, 2024". */
fun dayDate(iso: String, today: LocalDate = LocalDate.now()): String = runCatching {
    val d = LocalDate.parse(iso.take(10))
    d.format(java.time.format.DateTimeFormatter.ofPattern(if (d.year == today.year) "MMM d" else "MMM d, yyyy", java.util.Locale.US))
}.getOrDefault(iso)

/** A number as typed, or null: "4214.8" stays 4214.8 (critique #9). */
fun num(text: String): Double? = text.trim().takeIf { it.isNotEmpty() }?.toDoubleOrNull()

fun fmt1(x: Double?): String = x?.let { String.format(java.util.Locale.US, "%.1f", it) } ?: ""
fun fmtNum(x: Double?): String = x?.let { if (it == Math.floor(it) && kotlin.math.abs(it) < 1e9) it.toLong().toString() else it.toString() } ?: ""

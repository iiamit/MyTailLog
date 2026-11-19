package com.mytaillog.app

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import com.mytaillog.core.api.AircraftRole
import com.mytaillog.core.domain.due.DueItem
import com.mytaillog.core.domain.due.LineAhead
import com.mytaillog.core.domain.due.fmtDate
import com.mytaillog.design.ButtonKind
import com.mytaillog.design.DButton
import com.mytaillog.design.FirstBadge
import com.mytaillog.design.GroupHeader
import com.mytaillog.design.LineChip
import com.mytaillog.design.LucideIcons
import com.mytaillog.design.MarkKind
import com.mytaillog.design.MyTailLogTheme
import com.mytaillog.design.PageCite
import com.mytaillog.design.PhoneHeader
import com.mytaillog.design.PhoneLeaf
import com.mytaillog.design.PhoneRow
import com.mytaillog.design.Section
import com.mytaillog.design.Skeleton
import com.mytaillog.design.StatusMark
import com.mytaillog.design.SyncLine
import com.mytaillog.design.Tokens
import com.mytaillog.design.TrustLevel
import com.mytaillog.design.TrustMark
import com.mytaillog.design.Verdict
import com.mytaillog.design.focusRing
import com.mytaillog.design.line
import com.mytaillog.design.section
import com.mytaillog.design.statusMark
import java.time.Instant
import java.time.ZoneId

/** What the shell hands the Status screens: the state and the two things they can ask for. */
class StatusHost(val ui: StatusUi, val refresh: () -> Unit, val select: (String) -> Unit, val onPhoneTach: Double? = null)

private enum class Mode { Home, All, Tablet }

/** M-STATUS-01/02: the phone home. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StatusPhone(host: StatusHost, onSeeAll: () -> Unit, onReview: () -> Unit) {
    var openKey by rememberSaveable { mutableStateOf<String?>(null) }
    StatusBoard(stringResource(R.string.section_status), host) {
        PullToRefreshBox(isRefreshing = host.ui.loading && host.ui.snapshot != null, onRefresh = host.refresh) {
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = Tokens.Space.s8)) {
                statusContent(host, Mode.Home, onOpen = { openKey = it }, onSeeAll = onSeeAll, onReview = onReview)
            }
        }
    }
    ItemSheet(host.ui, openKey) { openKey = null }
}

/** M-STATUS-08: every tracked item by horizon, with the limit's icon. */
@Composable
fun AllItemsPhone(host: StatusHost, onBack: () -> Unit) {
    var openKey by rememberSaveable { mutableStateOf<String?>(null) }
    val n = host.ui.snapshot?.body?.items?.size ?: 0
    StatusBoard(pluralStringResource(R.plurals.status_all_items, n, n), host, back = stringResource(R.string.section_status) to onBack) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = Tokens.Space.s8)) {
            host.ui.snapshot?.body?.let { body -> dueGroups(body.items, body.today, Mode.All, onOpen = { openKey = it }) }
        }
    }
    ItemSheet(host.ui, openKey) { openKey = null }
}

/** T-STATUS-01 left leaf: the Verdict, the line ahead and the due list; a row selects, it does not navigate. */
@Composable
fun StatusTabletList(host: StatusHost, selected: String?, onSelect: (String) -> Unit) {
    Column {
        AircraftLine(host)
        LazyColumn(Modifier.fillMaxSize()) {
            statusContent(host, Mode.Tablet, onOpen = onSelect, onSeeAll = {}, onReview = {}, selected = selected)
        }
    }
}

/** T-STATUS-01 right leaf: the selected item, or the first one. */
@Composable
fun StatusTabletDetail(host: StatusHost, selected: String?) {
    val items = host.ui.snapshot?.body?.items.orEmpty()
    val item = items.firstOrNull { it.key == selected } ?: items.firstOrNull() ?: return
    Column(Modifier.verticalScroll(rememberScrollState())) { ItemDetail(item, host.ui) }
}

@Composable
private fun StatusBoard(title: String, host: StatusHost, back: Pair<String, () -> Unit>? = null, content: @Composable () -> Unit) {
    val colors = MyTailLogTheme.colors
    var switching by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().background(colors.section(Section.Status).board)) {
        Box {
            val current = host.ui.current
            val state = withOutbox(syncState(host.ui.snapshot?.computedAt, Instant.now(), ZoneId.systemDefault()))
            PhoneHeader(
                title, Section.Status, back = back,
                syncLine = current?.let { a ->
                    SyncLine(a.aircraft.tailNumber, state, stringResource(R.string.status_switch, a.aircraft.tailNumber, state)) { switching = true }
                },
            )
            AircraftMenu(host, switching) { switching = false }
        }
        CaptureBar()
        PhoneLeaf { content() }
    }
}

/** shortcut: a menu of tail numbers until the AircraftSwitcher sheet (M-SWITCH-01) lands with the hangar. */
@Composable
private fun AircraftMenu(host: StatusHost, expanded: Boolean, onDismiss: () -> Unit) {
    val colors = MyTailLogTheme.colors
    DropdownMenu(expanded, onDismiss, containerColor = colors.leaf) {
        host.ui.aircraft.forEach { a ->
            DropdownMenuItem(
                text = { Text(a.aircraft.tailNumber, color = colors.ink, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight(if (a.aircraft.id == host.ui.currentId) 800 else 400))) },
                onClick = { onDismiss(); host.select(a.aircraft.id) },
            )
        }
    }
}

/** The tablet's tail line on the leaf (the RailPlate carries it once the rail plate lands). */
@Composable
private fun AircraftLine(host: StatusHost) {
    val current = host.ui.current ?: return
    val colors = MyTailLogTheme.colors
    var switching by remember { mutableStateOf(false) }
    val state = syncState(host.ui.snapshot?.computedAt, Instant.now(), ZoneId.systemDefault())
    Box {
        Row(
            Modifier
                .heightIn(min = Tokens.Size.rowMin)
                .focusRing()
                .clickable(role = Role.Button) { switching = true }
                .semantics(mergeDescendants = true) { contentDescription = "${current.aircraft.tailNumber}, $state. Switch aircraft" },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(current.aircraft.tailNumber, color = colors.ink, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight(700)))
            Icon(LucideIcons.ChevronDown, contentDescription = null, tint = colors.ink, modifier = Modifier.size(16.dp))
            Text("· $state", color = colors.ink3, style = MaterialTheme.typography.bodyMedium)
        }
        AircraftMenu(host, switching) { switching = false }
    }
}

private fun LazyListScope.statusContent(
    host: StatusHost,
    mode: Mode,
    onOpen: (String) -> Unit,
    onSeeAll: () -> Unit,
    onReview: () -> Unit,
    selected: String? = null,
) {
    val ui = host.ui
    val snap = ui.snapshot
    if (snap == null) {
        when {
            ui.failed -> item { StatusError(host.refresh) }
            ui.noAircraft -> item { Text(stringResource(R.string.empty_status), color = MyTailLogTheme.colors.ink, style = MaterialTheme.typography.bodyLarge) }
            else -> item { StatusLoading() }
        }
        return
    }
    val body = snap.body
    val today = body.today
    val nothingTracked = body.items.isEmpty() && body.situation != "setup"
    item(key = "verdict") {
        if (nothingTracked) {
            Verdict(stringResource(R.string.status_nothing_tracked), listOf(0 until stringResource(R.string.status_nothing_tracked_bold).length))
        } else {
            Verdict(body.verdict.text, body.verdict.emphasis.filter { it.size == 2 }.map { it[0] until it[1] })
        }
    }
    items(body.verdict.lines) { line -> Small(line, Modifier.padding(top = Tokens.Space.s2)) }
    // 09 §3.12: a reading saved on this phone shows with its marker until the next pull brings the server's.
    host.onPhoneTach?.let { t -> item { Small(stringResource(R.string.status_on_phone_tach, hours1(t)), Modifier.padding(top = Tokens.Space.s2)) } }
    if (nothingTracked) item { Small(stringResource(R.string.status_scan_hint), Modifier.padding(top = Tokens.Space.s2)) }
    freshness(snap.computedAt, Instant.now(), ZoneId.systemDefault())?.let { item { Small(it, Modifier.padding(top = Tokens.Space.s2)) } }
    if (ui.failed) item { StatusError(host.refresh, compact = true) }
    if (body.situation != "setup" && body.items.isNotEmpty()) {
        item(key = "line") {
            LineAheadView(body.lineAhead, body.items, onRing = onOpen, modifier = Modifier.padding(top = Tokens.Space.s4))
        }
        items(undatedLines(body.lineAhead, body.items)) { Small(it) }
    }
    if (body.counts.pagesToReview > 0 && mode != Mode.Tablet) {
        item { PhoneRow(pluralStringResource(R.plurals.status_pages_waiting, body.counts.pagesToReview, body.counts.pagesToReview), onReview) }
    }
    if (body.situation == "all_clear" && mode == Mode.Home) {
        // M-STATUS-02 all clear: the next three, and what the hours side looks like.
        item { GroupHeader(stringResource(R.string.status_group_coming_up), count = pluralStringResource(R.plurals.status_tracked, body.items.size, body.items.size)) }
        items(body.items.take(3), key = { it.key }) { DueRow(it, today, onClick = { onOpen(it.key) }) }
        body.meters[body.rate.meter]?.let { m ->
            if (m.stitched != null && m.asOf != null) item {
                val meter = stringResource(R.string.status_meter_line, "${body.rate.meter.replaceFirstChar { it.uppercase() }} ${hours1(m.stitched!!)}", fmtDate(m.asOf!!))
                val rate = if (body.rate.hoursPerWeek > 0) " " + stringResource(R.string.status_rate_line, hours1(body.rate.hoursPerWeek)) else ""
                Small(meter + rate, Modifier.padding(top = Tokens.Space.s3))
            }
        }
    } else {
        dueGroups(body.items, today, mode, onOpen, selected)
    }
    if (mode == Mode.Home && body.items.size > shownOnHome(body.items, today, body.situation)) {
        item { PhoneRow(pluralStringResource(R.plurals.status_see_all, body.items.size, body.items.size), onSeeAll) }
    }
    item { Small(stringResource(R.string.status_boundary), Modifier.padding(top = Tokens.Space.s5)) }
    ui.current?.takeIf { it.role == AircraftRole.Viewer }?.let { a ->
        item {
            Small(
                if (a.aircraft.isDemo) stringResource(R.string.status_demo) else stringResource(R.string.status_viewer, a.aircraft.tailNumber),
                Modifier.padding(top = Tokens.Space.s2),
            )
        }
    }
}

/** How many rows the phone home lists: all but Later, of which only the first (06 M-STATUS-01). */
fun shownOnHome(items: List<DueItem>, today: String, situation: String): Int =
    if (situation == "all_clear") minOf(3, items.size)
    else grouped(items, today).sumOf { (g, list) -> if (g == DueGroup.Later) 1 else list.size }

private fun LazyListScope.dueGroups(items: List<DueItem>, today: String, mode: Mode, onOpen: (String) -> Unit, selected: String? = null) {
    grouped(items, today).forEach { (group, list) ->
        item(key = "group-$group") {
            val title = when (group) {
                DueGroup.Overdue -> R.string.status_group_overdue
                DueGroup.Near -> R.string.status_group_near
                DueGroup.Later -> R.string.status_group_later
                DueGroup.NoRecord -> R.string.status_group_no_record
            }
            GroupHeader(stringResource(title), count = if (group == DueGroup.Later) list.size.toString() else null)
        }
        val shown = if (group == DueGroup.Later && mode == Mode.Home) list.take(1) else list
        items(shown, key = { it.key }) { i ->
            DueRow(i, today, onClick = { onOpen(i.key) }, showLimitIcon = mode == Mode.All, selected = i.key == selected)
        }
    }
}

@Composable
private fun Small(text: String, modifier: Modifier = Modifier) {
    Text(text, color = MyTailLogTheme.colors.ink3, style = MaterialTheme.typography.bodyMedium, modifier = modifier)
}

/** 06 §1.6 loading: the shape of the content in leaf-2 blocks, no spinner, no animation. */
@Composable
private fun StatusLoading() {
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.Space.s2)) {
        Skeleton(0.9f, 22.dp)
        Skeleton(0.55f, 22.dp)
        Spacer(Modifier.height(Tokens.Space.s4))
        Skeleton(1f, 168.dp)
        Spacer(Modifier.height(Tokens.Space.s4))
        repeat(4) { Skeleton(if (it % 2 == 0) 0.7f else 0.5f, 40.dp) }
    }
}

/** Verdict error state (02 §5.1): the sentence in lede ink-2 and a quiet Retry. */
@Composable
private fun StatusError(retry: () -> Unit, compact: Boolean = false) {
    val colors = MyTailLogTheme.colors
    Column(Modifier.padding(top = if (compact) Tokens.Space.s2 else 0.dp)) {
        Text(
            stringResource(R.string.status_error),
            color = colors.ink2,
            style = if (compact) MaterialTheme.typography.bodyMedium else MaterialTheme.typography.titleLarge,
        )
        DButton(stringResource(R.string.retry), retry, kind = ButtonKind.Quiet, modifier = Modifier.width(120.dp))
    }
}

/** Phone DueRow (02 §5.8, 06 M-STATUS-01): name and meta on the left, what is left over the StatusMark on the right. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DueRow(item: DueItem, today: String, onClick: () -> Unit, showLimitIcon: Boolean = false, selected: Boolean = false) {
    val c = MyTailLogTheme.colors
    val spoken = spokenRow(item, today)
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = Tokens.Size.phoneRowMin)
            .background(if (selected) c.leaf2 else Color.Transparent)
            .focusRing()
            .clickable(onClick = onClick)
            .clearAndSetSemantics {
                contentDescription = spoken
                role = Role.Button
                this.selected = selected
            }
            .padding(vertical = Tokens.Space.s3),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s3),
    ) {
        Column(Modifier.weight(1f)) {
            Text(item.label, color = c.ink, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight(700)))
            DueMeta(item, today, showLimitIcon)
        }
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
            val slip = overdueText(item)
            if (slip != null) {
                StatusMark(MarkKind.Overdue, slip, compact = true)
            } else {
                rowValue(item)?.let { Text(it, color = c.ink, style = MaterialTheme.typography.labelLarge) }
                StatusMark(markKind(item.status), statusWord(item.status), compact = true)
            }
        }
    }
    Box(Modifier.fillMaxWidth().height(1.dp).background(c.rule))
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DueMeta(item: DueItem, today: String, showLimitIcon: Boolean) {
    val c = MyTailLogTheme.colors
    val meta = MaterialTheme.typography.bodyMedium
    val parts = buildList<@Composable () -> Unit> {
        bookName(item.line)?.let { add { LineChip(item.line, it) } }
        limits(item, today).forEach { l ->
            add {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (showLimitIcon) {
                        val icon = when (l.kind) {
                            LimitKind.Calendar -> LucideIcons.Calendar
                            LimitKind.Hours -> LucideIcons.Gauge
                            LimitKind.Document -> LucideIcons.FileText
                        }
                        Icon(icon, contentDescription = null, tint = c.ink3, modifier = Modifier.size(14.dp))
                    }
                    Text(l.text + (l.about?.let { " · $it" } ?: ""), color = c.ink3, style = meta)
                    if (l.first) FirstBadge(stringResource(R.string.first), stringResource(R.string.first_spoken))
                }
            }
        }
        qualifiers(item).forEach { q -> add { Text(q, color = c.ink3, style = meta) } }
        item.lastDone?.let { d -> add { PageCite(d.pageLabel, stringResource(R.string.your_note), Section.Status) } }
    }
    FlowRow(
        Modifier.padding(top = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
        itemVerticalAlignment = Alignment.CenterVertically,
    ) {
        parts.forEachIndexed { i, part ->
            if (i > 0) Text("·", color = c.ink3, style = meta)
            part()
        }
    }
}

private val LINES = listOf("airframe" to "Airframe", "engine" to "Engine", "propeller" to "Propeller", "avionics" to "Avionics")

private fun lineRow(line: String): Int = when (line) {
    "prop" -> 2
    else -> LINES.indexOfFirst { it.first == line }
}

/**
 * LineAhead, phone variant (02 §4.5): the four book lines, solid up to today then dotted, the
 * due rings on their book's line. Tap a ring to open its item; rings that overlap open a menu.
 * TalkBack hears one summary; the rows below are the full equivalent.
 */
@Composable
fun LineAheadView(ahead: LineAhead, items: List<DueItem>, onRing: (String) -> Unit, modifier: Modifier = Modifier) {
    val c = MyTailLogTheme.colors
    val measurer = rememberTextMeasurer()
    val labelStyle = MaterialTheme.typography.labelSmall.copy(color = c.ink3, fontWeight = FontWeight(600))
    val density = LocalDensity.current
    val byKey = remember(items) { items.associateBy { it.key } }
    var menu by remember { mutableStateOf<List<String>>(emptyList()) }
    val summary = remember(ahead, items) { lineSummary(ahead, items) }
    val top = with(density) { 30.dp.toPx() }
    val gap = with(density) { 28.dp.toPx() }
    val ringR = with(density) { Tokens.Map.ringRadius.toPx() }
    fun ringCenter(i: Int, w: Float): Offset? {
        val r = ahead.rings[i]
        val row = lineRow(r.line).takeIf { it >= 0 } ?: return null
        return Offset((lineX(r.date, ahead) * w).coerceIn(ringR, w - ringR), top + row * gap)
    }
    Box(modifier) {
        Canvas(
            Modifier
                .fillMaxWidth()
                .height(168.dp)
                .semantics { contentDescription = summary }
                .pointerInput(ahead) {
                    detectTapGestures { pos ->
                        val reach = 22.dp.toPx()
                        val hits = ahead.rings.indices.mapNotNull { i ->
                            ringCenter(i, size.width.toFloat())?.takeIf { (it - pos).getDistance() <= reach }?.let { ahead.rings[i].itemKey }
                        }.distinct()
                        when (hits.size) {
                            0 -> Unit // shortcut: the empty line opens Plan ahead (M-STATUS-03) in phase 5
                            1 -> onRing(hits.single())
                            else -> menu = hits
                        }
                    }
                },
        ) {
            val w = size.width
            val today = LINE_PAST * w
            val stroke = Tokens.Map.lineStrokeThin.toPx()
            val dots = PathEffect.dashPathEffect(floatArrayOf(0.1f, Tokens.Map.futureDotSpacing.toPx() / 2))
            LINES.forEachIndexed { i, (line, name) ->
                val y = top + i * gap
                drawText(measurer, name, Offset(0f, y - 18.dp.toPx()), labelStyle)
                val ink = c.line(line)
                drawLine(ink, Offset(0f, y), Offset(today, y), stroke, StrokeCap.Round)
                drawLine(ink, Offset(today, y), Offset(w, y), stroke, StrokeCap.Round, dots)
            }
            val bottom = top + (LINES.size - 1) * gap
            // A tick on each line rather than one rule, so it never cuts through the book labels above the lines.
            LINES.indices.forEach { i ->
                val y = top + i * gap
                val end = if (i == LINES.size - 1) bottom + 10.dp.toPx() else y + 4.dp.toPx()
                drawLine(c.ink3, Offset(today, y - 4.dp.toPx()), Offset(today, end), 1.dp.toPx())
            }
            ahead.rings.indices.forEach { i ->
                ringCenter(i, w)?.let { statusMark(markKind(ahead.rings[i].status), it, ringR, c, Tokens.Map.ringStroke.toPx()) }
            }
            lineTicks(ahead).forEachIndexed { i, (x, text) ->
                val m = measurer.measure(text, labelStyle)
                val left = when (i) {
                    0 -> (x * w - 4.dp.toPx()).coerceAtLeast(0f)
                    lineTicks(ahead).lastIndex -> w - m.size.width
                    else -> x * w - m.size.width / 2
                }
                drawText(m, topLeft = Offset(left, bottom + 18.dp.toPx()))
            }
        }
        DropdownMenu(menu.isNotEmpty(), { menu = emptyList() }, containerColor = c.leaf) {
            menu.forEach { key ->
                DropdownMenuItem(text = { Text(byKey[key]?.label ?: key, color = c.ink) }, onClick = { menu = emptyList(); onRing(key) })
            }
        }
    }
}

/** M-STATUS-05 as a sheet on phones (the brief's call); the same content fills the tablet's right leaf. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ItemSheet(ui: StatusUi, key: String?, onDismiss: () -> Unit) {
    val item = ui.snapshot?.body?.items?.firstOrNull { it.key == key } ?: return
    val colors = MyTailLogTheme.colors
    ModalBottomSheet(onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = colors.leaf) {
        Column(Modifier.padding(horizontal = Tokens.Space.s4).padding(bottom = Tokens.Space.s8).verticalScroll(rememberScrollState())) {
            ItemDetail(item, ui)
            DButton(stringResource(R.string.close), onDismiss, kind = ButtonKind.Secondary, modifier = Modifier.padding(top = Tokens.Space.s6))
        }
    }
}

/** M-STATUS-05 item detail: the rule, its limits (both, the first named), the last completion and the page that says so. */
@Composable
fun ItemDetail(item: DueItem, ui: StatusUi) {
    val c = MyTailLogTheme.colors
    val body = ui.snapshot?.body ?: return
    val both = item.calendar != null && item.hours != null
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s3)) {
            Text(item.label, color = c.ink, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f).semantics { heading() })
            StatusMark(markKind(item.status), overdueText(item) ?: statusWord(item.status))
        }
        Small((listOf(item.rule) + qualifiers(item)).joinToString(" · "))
        Spacer(Modifier.height(Tokens.Space.s3))
        calendarDue(item)?.let { KeyValue(stringResource(R.string.item_due), it, first = both && item.first == "calendar") }
        hoursDue(item)?.let { KeyValue(stringResource(R.string.item_due), it, first = both && item.first == "hours") }
        projection(item, body.rate, body.today)?.let { KeyValue(stringResource(R.string.item_about), it) }
        lastDoneText(item)?.let { KeyValue(stringResource(R.string.item_last_done), it) }
        item.lastDone?.signer?.let { KeyValue(stringResource(R.string.item_usually), it) }
        Text(
            stringResource(R.string.item_page_heading),
            color = c.ink,
            style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight(700)),
            modifier = Modifier.padding(top = Tokens.Space.s5).semantics { heading() },
        )
        val done = item.lastDone
        if (done == null) {
            Text(stringResource(R.string.item_no_completion), color = c.ink2, style = MaterialTheme.typography.bodyLarge)
        } else {
            val level = trustLevel(done.trust, done.signer)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s3)) {
                TrustMark(level, trustWords(level, done.signer))
                PageCite(done.pageLabel, stringResource(R.string.your_note), Section.Status)
            }
        }
        if (item.waitingEntryId != null) {
            Row(Modifier.padding(top = Tokens.Space.s2)) {
                TrustMark(TrustLevel.AiRead, stringResource(R.string.item_waiting))
            }
        }
    }
}

@Composable
private fun KeyValue(key: String, value: String, first: Boolean = false) {
    val c = MyTailLogTheme.colors
    Row(
        Modifier.fillMaxWidth().heightIn(min = 32.dp).semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s3),
    ) {
        Text(key, color = c.ink3, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.width(88.dp))
        Text(value, color = c.ink, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f, fill = false))
        if (first) FirstBadge(stringResource(R.string.first), stringResource(R.string.first_spoken))
    }
}

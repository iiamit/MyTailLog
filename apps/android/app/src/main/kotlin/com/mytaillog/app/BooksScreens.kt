package com.mytaillog.app

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mytaillog.core.api.Books
import com.mytaillog.core.api.BookWrites
import com.mytaillog.core.api.EntryRow
import com.mytaillog.core.api.GapEvidence
import com.mytaillog.core.api.PageRow
import com.mytaillog.core.domain.due.fmtDate
import com.mytaillog.core.domain.map.LANES
import com.mytaillog.core.domain.map.MapModel
import com.mytaillog.design.ButtonKind
import com.mytaillog.design.DButton
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
import com.mytaillog.design.SubTabs
import com.mytaillog.design.Tokens
import com.mytaillog.design.TrustLevel
import com.mytaillog.design.TrustMark
import com.mytaillog.design.dTextFieldColors
import com.mytaillog.design.focusRing
import com.mytaillog.design.toTextStyle
import com.mytaillog.design.section
import kotlinx.coroutines.launch

/** Where the Logbooks screens can go; the shell owns the back stack. */
class BooksNav(
    val openEntry: (String) -> Unit = {},
    val editEntry: (String) -> Unit = {},
    /** Review at [pageId], or at the first page of the queue when null. */
    val openReview: (String?) -> Unit = {},
    val openBook: (String) -> Unit = {},
    val openPage: (String) -> Unit = {},
    val back: () -> Unit = {},
)

private val paper @Composable get() = Tokens.PhoneType.paper.toTextStyle()

/** M-BOOKS-01, -06 and the review queue: the Logbooks board with SubTabs Map · Pages · Review N. */
@Composable
fun BooksPhone(vm: BooksViewModel, nav: BooksNav) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableIntStateOf(0) }
    val queue = ui.books?.let(::reviewQueue).orEmpty()
    BooksBoard(stringResource(R.string.section_books), vm, ui) {
        SubTabs(
            listOf(stringResource(R.string.books_tab_map), stringResource(R.string.books_tab_pages), stringResource(R.string.books_tab_review, queue.size)),
            tab, { tab = it }, Section.Books, Modifier.padding(bottom = Tokens.Space.s2),
        )
        PhoneLeaf {
            PullToRefreshBox(isRefreshing = ui.loading && ui.books != null, onRefresh = vm::refresh) {
                val b = ui.books
                when {
                    b == null && ui.failed -> BooksError(vm::refresh)
                    b == null -> BooksLoading()
                    tab == 0 -> MapTab(vm, ui, b, nav)
                    tab == 1 -> PagesTab(ui, b, nav)
                    else -> QueueTab(vm, ui, b, nav)
                }
            }
        }
    }
}

@Composable
fun BooksBoard(title: String, vm: BooksViewModel, ui: BooksUi, back: Pair<String, () -> Unit>? = null, content: @Composable () -> Unit) {
    val colors = MyTailLogTheme.colors
    Column(Modifier.fillMaxSize().background(colors.section(Section.Books).board)) {
        PhoneHeader(title, Section.Books, back = back)
        CaptureBar(queueLink = back == null)
        MessageBar(ui.message, vm::messageShown)
        content()
    }
}

/** A write that didn't land, in alarm, until dismissed (06 §1.6). */
@Composable
fun MessageBar(message: String?, onDismiss: () -> Unit) {
    message ?: return
    val c = MyTailLogTheme.colors
    Row(
        Modifier.fillMaxWidth().background(c.alarmBg).padding(horizontal = Tokens.Space.s4, vertical = Tokens.Space.s2),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(message, color = c.onAlarmBg, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        TextButton(onDismiss) { Text(stringResource(R.string.close), color = c.onAlarmBg) }
    }
}

@Composable
fun BooksLoading() {
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.Space.s2)) {
        Skeleton(0.6f, 22.dp)
        Skeleton(1f, 420.dp)
    }
}

@Composable
fun BooksError(retry: () -> Unit) {
    Column(Modifier.verticalScroll(rememberScrollState())) {
        Text(stringResource(R.string.books_error), color = MyTailLogTheme.colors.ink2, style = MaterialTheme.typography.titleLarge)
        DButton(stringResource(R.string.retry), retry, kind = ButtonKind.Quiet, modifier = Modifier.width(120.dp))
    }
}

@Composable
fun Meta(text: String, modifier: Modifier = Modifier) {
    Text(text, color = MyTailLogTheme.colors.ink3, style = MaterialTheme.typography.bodyMedium, modifier = modifier)
}

// --- Map (M-BOOKS-01, -05, -08) -------------------------------------------------------------------

private val INITIALS = mapOf("airframe" to "Air", "engine" to "Eng", "prop" to "Prop", "avionics" to "Avi")

/** The map's current model: every book, or one (M-BOOKS-05). */
fun shownModel(b: Books, book: String?): MapModel =
    if (book == null) b.map else oneBook(b.map, book) { s -> s.entryIds.firstNotNullOfOrNull { id -> b.entries.firstOrNull { it.id == id } }?.let(::entryTitle) }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MapTab(vm: BooksViewModel, ui: BooksUi, b: Books, nav: BooksNav) {
    val c = MyTailLogTheme.colors
    var book by rememberSaveable { mutableStateOf<String?>(null) }
    var list by rememberSaveable { mutableStateOf(false) }
    var target by remember { mutableStateOf<MapTarget?>(null) }
    val model = remember(b, book) { shownModel(b, book) }
    Box(Modifier.fillMaxSize()) {
        BoxWithConstraints(Modifier.fillMaxSize()) {
            val horizontal = maxWidth >= 600.dp && maxWidth > maxHeight
            val layout = rememberMapLayout(model, if (horizontal) "routemap" else "phone", maxWidth.value)
            val unit = maxWidth.value / layout.width.toFloat()
            Column(Modifier.fillMaxSize()) {
                // Column heads stay put while the map scrolls (10 §8.4).
                Box(Modifier.fillMaxWidth().height(Tokens.Size.phoneTouchMin)) {
                    if (!list && !horizontal) layout.lanes.forEach { l ->
                        Text(
                            l.name, color = c.ink, style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight(700)),
                            modifier = Modifier.offset(x = (l.c * unit).dp - 14.dp).align(Alignment.CenterStart).semantics { contentDescription = bookName(l.logbook) ?: l.name },
                        )
                    }
                    BookFilter(book, Modifier.align(Alignment.CenterEnd)) { book = it }
                }
                if (list) {
                    EntriesList(b, book, onOpen = nav.openEntry)
                } else {
                    Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 72.dp)) {
                        val reading = beingRead(b)
                        if (reading.isNotEmpty()) Meta(pluralStringResource(R.plurals.books_being_read, reading.size, reading.size), Modifier.padding(bottom = Tokens.Space.s2))
                        if (model.stops.isEmpty()) Meta(stringResource(R.string.books_map_empty), Modifier.padding(bottom = Tokens.Space.s2))
                        RouteMapView(b, model, layout, onTarget = { target = it }, selected = target)
                        if (layout.more > 0) Meta(pluralStringResource(R.plurals.books_map_more, layout.more, layout.more))
                        OffMapBooks(b, nav)
                        if (ui.aircraft?.canEdit == false) Meta(stringResource(R.string.books_viewer), Modifier.padding(top = Tokens.Space.s3))
                    }
                }
            }
        }
        // The visible list equivalent (10 §10), bottom left above the tab bar.
        DButton(
            stringResource(if (list) R.string.books_show_map else R.string.books_show_list),
            { list = !list },
            kind = ButtonKind.Secondary,
            icon = if (list) LucideIcons.Map else LucideIcons.List,
            modifier = Modifier.align(Alignment.BottomStart).padding(bottom = Tokens.Space.s3).width(150.dp).height(Tokens.Size.phoneTouchMin),
        )
    }
    target?.let { t ->
        ModalBottomSheet({ target = null }, sheetState = rememberModalBottomSheetState(), containerColor = c.leaf) {
            Column(Modifier.padding(horizontal = Tokens.Space.s4).padding(bottom = Tokens.Space.s8).verticalScroll(rememberScrollState())) {
                when (t) {
                    is MapTarget.Stop -> StopSheet(vm, b, t.stopIds, onMove = { target = it }, nav = nav, close = { target = null })
                    is MapTarget.Visit -> VisitSheet(vm, b, t.id, nav)
                    is MapTarget.Gap -> GapSheet(vm, ui, b, t.id, nav)
                    is MapTarget.Ring -> RingSheet(b, t.itemKey)
                }
            }
        }
    }
}

/** Other is never drawn (10 §1): under the map, its page count and a way to its pages. */
@Composable
fun OffMapBooks(b: Books, nav: BooksNav) {
    offMapBooks(b).forEach { (book, n) ->
        val name = bookTitle(b, book.id)
        Meta(offMapLine(name, n), Modifier.padding(top = Tokens.Space.s3))
        DButton(stringResource(R.string.books_pages_in, name), { nav.openBook(book.id) }, kind = ButtonKind.Secondary, modifier = Modifier.padding(top = Tokens.Space.s1))
    }
}

@Composable
fun BookFilter(book: String?, modifier: Modifier, onPick: (String?) -> Unit) {
    val c = MyTailLogTheme.colors
    var open by remember { mutableStateOf(false) }
    Box(modifier) {
        Row(
            Modifier.heightIn(min = Tokens.Size.phoneTouchMin).focusRing().clickable(role = Role.Button) { open = true }.padding(horizontal = Tokens.Space.s1),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(book?.let(::bookName) ?: stringResource(R.string.books_all), color = c.ink, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight(700)))
            Icon(LucideIcons.ChevronDown, contentDescription = null, tint = c.ink, modifier = Modifier.size(16.dp))
        }
        DropdownMenu(open, { open = false }, containerColor = c.leaf) {
            (listOf<String?>(null) + LANES).forEach { l ->
                DropdownMenuItem(text = { Text(l?.let(::bookName) ?: stringResource(R.string.books_all), color = c.ink) }, onClick = { open = false; onPick(l) })
            }
        }
    }
}

/** M-BOOKS-08: the same entries as the map, by year, newest first. */
@Composable
private fun EntriesList(b: Books, book: String?, onOpen: (String) -> Unit) {
    val ids = b.logbooks.filter { book == null || it.type == book }.map { it.id }.toSet()
    val groups = remember(b, book) { entriesByYear(b.entries.filter { it.logbookId in ids && b.pages.none { p -> p.id == it.pageId && p.extractionStatus in setOf("queued", "processing") } }) }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 72.dp)) {
        groups.forEach { (year, es) ->
            item(key = "y$year") { GroupHeader(year, count = "${es.size}") }
            items(es, key = { it.id }) { e -> EntryRowView(b, e) { onOpen(e.id) } }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun EntryRowView(b: Books, e: EntryRow, onClick: () -> Unit) {
    val c = MyTailLogTheme.colors
    val meta = listOfNotNull(e.entryDate?.let(::fmtDate), e.tach?.let { "tach ${hours1(it)}" }, pageLabel(b, e.pageId)).joinToString(" · ")
    Column(
        Modifier.fillMaxWidth().heightIn(min = Tokens.Size.phoneRowMin).focusRing().clickable(role = Role.Button, onClick = onClick)
            .semantics(mergeDescendants = true) {}.padding(vertical = Tokens.Space.s3),
    ) {
        Text(entryTitle(e), color = c.ink, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight(700)))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), itemVerticalAlignment = Alignment.CenterVertically) {
            LineChip(bookType(b, e.logbookId), bookTitle(b, e.logbookId))
            Meta(meta)
            if (e.trust == "ai_read") TrustMark(TrustLevel.AiRead, entryTrustWords(e))
        }
    }
    Box(Modifier.fillMaxWidth().height(1.dp).background(c.rule))
}

// --- Map sheets (M-BOOKS-02, -03, -04) -------------------------------------------------------------

@Composable
private fun SheetTitle(text: String) {
    Text(text, color = MyTailLogTheme.colors.ink, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(bottom = Tokens.Space.s1).semantics { heading() })
}

/** M-BOOKS-02: the entry behind a stop, its crop and trust; the next stop up the line is one tap. */
@Composable
private fun StopSheet(vm: BooksViewModel, b: Books, stopIds: List<String>, onMove: (MapTarget) -> Unit, nav: BooksNav, close: () -> Unit) {
    val stops = b.map.stops.filter { it.id in stopIds }
    val entries = stops.flatMap { s -> s.entryIds.mapNotNull { id -> b.entries.firstOrNull { it.id == id } } }
    val e = entries.firstOrNull() ?: return
    val stop = stops.first()
    if (entries.size > 1) {
        // A cluster at whole-life zoom: list them; each opens its entry.
        SheetTitle(pluralStringResource(R.plurals.books_cluster, entries.size, entries.size, fmtDate(stops.minOf { it.date }), fmtDate(stops.maxOf { it.date })))
        entries.forEach { x -> EntryRowView(b, x) { close(); nav.openEntry(x.id) } }
        return
    }
    SheetTitle(entryTitle(e))
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s2)) {
        LineChip(stop.logbook, bookTitle(b, e.logbookId))
        Meta(entryMeta(e), Modifier.weight(1f))
    }
    val scan = rememberScan(vm, e.pageId)
    ScanCrop(scan, pageLabel(b, e.pageId) ?: "", Modifier.fillMaxWidth().height(120.dp).padding(top = Tokens.Space.s3).clip(RoundedCornerShape(Tokens.Radius.s)), crop = entryBox(e)?.grown(0.02))
    Text(transcription(e), color = MyTailLogTheme.colors.ink, style = paper, modifier = Modifier.padding(top = Tokens.Space.s3))
    Row(Modifier.padding(top = Tokens.Space.s3), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s3)) {
        PageCite(pageLabel(b, e.pageId), stringResource(R.string.your_note), Section.Books)
        TrustMark(entryTrust(e), entryTrustWords(e))
    }
    if (e.trust == "ai_read") Meta(stringResource(R.string.books_not_confirmed), Modifier.padding(top = Tokens.Space.s2))
    val up = b.map.stops.filter { it.lineId == stop.lineId && it.date > stop.date }.minByOrNull { it.date }
    Row(Modifier.padding(top = Tokens.Space.s4), horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s3)) {
        if (up != null) DButton(up.date.take(4), { onMove(MapTarget.Stop(listOf(up.id))) }, kind = ButtonKind.Quiet, icon = LucideIcons.ChevronUp, modifier = Modifier.weight(1f))
        if (e.trust == "ai_read" && e.pageId != null) DButton(stringResource(R.string.books_review_this_page), { close(); nav.openReview(e.pageId) }, modifier = Modifier.weight(2f))
        else DButton(stringResource(R.string.books_open_page), { close(); nav.openEntry(e.id) }, icon = LucideIcons.BookOpen, modifier = Modifier.weight(2f))
    }
}

/** M-BOOKS-03: one card per book of a visit, each with its own trust mark. */
@Composable
private fun VisitSheet(vm: BooksViewModel, b: Books, id: String, nav: BooksNav) {
    val x = b.map.interchanges.firstOrNull { it.id == id } ?: return
    val entries = x.stopIds.mapNotNull { sid -> b.map.stops.firstOrNull { it.id == sid } }
        .mapNotNull { s -> s.entryIds.firstNotNullOfOrNull { eid -> b.entries.firstOrNull { it.id == eid } } }
    if (entries.isEmpty()) return
    SheetTitle(pluralStringResource(R.plurals.books_visit_title, entries.size, x.label ?: stringResource(R.string.books_visit), fmtDate(x.date), entries.size))
    Meta(listOfNotNull(entries.firstNotNullOfOrNull { it.signatureName }, entries.firstNotNullOfOrNull { it.tach }?.let { "tach ${hours1(it)}" }).joinToString(" · "))
    val pager = rememberPagerState { entries.size }
    HorizontalPager(pager, Modifier.fillMaxWidth().padding(top = Tokens.Space.s3), pageSpacing = Tokens.Space.s3) { i ->
        val e = entries[i]
        Column(
            Modifier.fillMaxWidth().border(1.dp, MyTailLogTheme.colors.rule2, RoundedCornerShape(Tokens.Radius.m)).padding(Tokens.Space.s3)
                .semantics(mergeDescendants = true) { contentDescription = "${pageLabel(b, e.pageId) ?: bookTitle(b, e.logbookId)}, card ${i + 1} of ${entries.size}" },
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s2)) {
                LineChip(bookType(b, e.logbookId), pageLabel(b, e.pageId) ?: bookTitle(b, e.logbookId))
                TrustMark(entryTrust(e), entryTrustWords(e))
            }
            ScanCrop(rememberScan(vm, e.pageId), pageLabel(b, e.pageId) ?: "", Modifier.fillMaxWidth().height(100.dp).padding(top = Tokens.Space.s2), crop = entryBox(e)?.grown(0.02))
            Text(transcription(e), color = MyTailLogTheme.colors.ink, style = paper, modifier = Modifier.padding(top = Tokens.Space.s2))
        }
    }
    Meta(stringResource(R.string.books_card_of, pager.currentPage + 1, entries.size), Modifier.padding(top = Tokens.Space.s2))
    val e = entries[pager.currentPage]
    DButton(stringResource(R.string.books_open_cite, pageLabel(b, e.pageId) ?: bookTitle(b, e.logbookId)), { nav.openEntry(e.id) }, modifier = Modifier.padding(top = Tokens.Space.s3))
}

/** M-BOOKS-04: the gap explains itself from the other books and can be marked. */
@Composable
fun GapSheet(vm: BooksViewModel, ui: BooksUi, b: Books, id: String, nav: BooksNav) {
    val g = b.map.gaps.firstOrNull { it.id == id } ?: return
    val row = b.gaps.firstOrNull { it.id == id }
    val c = MyTailLogTheme.colors
    val evidence by produceState<GapEvidence?>(null, id) { value = vm.evidence(id) }
    var marking by remember { mutableStateOf<String?>(null) }
    SheetTitle(stringResource(R.string.books_gap_title, bookName(g.logbook)?.lowercase() ?: "", g.from.take(4), g.to.take(4)))
    when (g.status) {
        "no_pages_exist" -> Meta(stringResource(R.string.books_gap_marked_none))
        "asked_previous_owner" -> Meta(stringResource(R.string.books_gap_marked_asked))
    }
    row?.note?.let { Text(it, color = c.ink, style = paper, modifier = Modifier.padding(top = Tokens.Space.s2)) }
    evidence?.let { ev ->
        Text(ev.verdict, color = c.ink, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(top = Tokens.Space.s2))
        GroupHeader(stringResource(R.string.books_gap_other_books))
        ev.otherBooks.forEach { o ->
            Row(Modifier.fillMaxWidth().heightIn(min = Tokens.Size.phoneRowMin).semantics(mergeDescendants = true) {}, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s2)) {
                LineChip(o.logbook, bookName(o.logbook) ?: o.logbook)
                Meta(listOfNotNull("${o.entries} ${if (o.entries == 1) "entry" else "entries"}", o.tachFrom?.let { f -> o.tachTo?.let { t -> "tach ${hours1(f)} to ${hours1(t)}" } }, o.pageRange).joinToString(" · "), Modifier.weight(1f))
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(c.rule))
        }
        if (ev.unconfirmedPagesInGap > 0) PhoneRow(pluralStringResource(R.plurals.books_gap_unconfirmed, ev.unconfirmedPagesInGap, ev.unconfirmedPagesInGap), { nav.openReview(null) })
    } ?: Skeleton(0.8f, 60.dp, Modifier.padding(top = Tokens.Space.s2))
    if (ui.canEdit && row != null) {
        Row(Modifier.padding(top = Tokens.Space.s4), horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s3)) {
            if (g.status != "no_pages_exist") DButton(stringResource(R.string.books_gap_none), { marking = "no_pages_exist" }, kind = ButtonKind.Secondary, modifier = Modifier.weight(1f))
            if (g.status != "asked_previous_owner") DButton(stringResource(R.string.books_gap_asked), { marking = "asked_previous_owner" }, kind = ButtonKind.Secondary, modifier = Modifier.weight(1f))
        }
    }
    marking?.let { status ->
        val scope = rememberCoroutineScope()
        var note by rememberSaveable { mutableStateOf(row?.note ?: "") }
        var busy by remember { mutableStateOf(false) }
        AlertDialog(
            onDismissRequest = { marking = null },
            title = { Text(stringResource(if (status == "no_pages_exist") R.string.books_gap_none else R.string.books_gap_asked)) },
            text = {
                OutlinedTextField(note, { note = it.take(1000) }, label = { Text(stringResource(R.string.books_gap_note)) }, colors = dTextFieldColors(), textStyle = paper)
            },
            confirmButton = {
                TextButton(enabled = !busy, onClick = {
                    busy = true
                    scope.launch {
                        vm.write(listOf(BookWrites.gapStatus(ui.aircraft!!.aircraft.id, row!!, status, note)))
                        busy = false
                        marking = null
                    }
                }) { Text(stringResource(R.string.save), color = c.ink) }
            },
            dismissButton = { TextButton({ marking = null }) { Text(stringResource(R.string.cancel), color = c.ink) } },
            containerColor = c.leaf, titleContentColor = c.ink, textContentColor = c.ink,
        )
    }
}

@Composable
fun RingSheet(b: Books, key: String) {
    val r = b.map.rings.firstOrNull { it.itemKey == key } ?: return
    SheetTitle(r.label)
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s3)) {
        StatusMark(markKind(r.status), statusWord(r.status))
        Meta(stringResource(if (r.dateKind == "projected") R.string.books_ring_about else R.string.books_ring_due, fmtDate(r.date)))
    }
    Meta(stringResource(R.string.books_ring_more), Modifier.padding(top = Tokens.Space.s2))
}

// --- Entry (M-BOOKS-07) and its edit form ----------------------------------------------------------

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun EntryScreen(vm: BooksViewModel, entryId: String, nav: BooksNav) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val b = ui.books ?: return
    val c = MyTailLogTheme.colors
    var id by rememberSaveable { mutableStateOf(entryId) }
    val e = b.entries.firstOrNull { it.id == id } ?: return
    val line = b.entries.filter { it.logbookId == e.logbookId && it.entryDate != null && !it.isContinuation }.sortedBy { it.entryDate }
    val i = line.indexOfFirst { it.id == e.id }
    BooksBoard(entryTitle(e), vm, ui, back = stringResource(R.string.section_books) to nav.back) {
        PhoneLeaf {
            BoxWithConstraints(Modifier.fillMaxSize()) {
                val scanHeight = minOf(maxWidth * 1.2f, maxHeight)
                Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = Tokens.Space.s8)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        DButton(stringResource(R.string.books_previous), { id = line[i - 1].id }, kind = ButtonKind.Quiet, enabled = i > 0, icon = LucideIcons.ChevronLeft, modifier = Modifier.weight(1f))
                        TrustMark(entryTrust(e), entryTrustWords(e))
                        DButton(stringResource(R.string.books_next), { id = line[i + 1].id }, kind = ButtonKind.Quiet, enabled = i in 0 until line.lastIndex, icon = LucideIcons.ChevronRight, modifier = Modifier.weight(1f))
                    }
                    if (e.pageId != null) {
                        ScanViewer(rememberScan(vm, e.pageId), pageLabel(b, e.pageId) ?: "", Modifier.fillMaxWidth().height(scanHeight).clip(RoundedCornerShape(Tokens.Radius.s)), outline = entryBox(e))
                    }
                    Meta(pageLabel(b, e.pageId)?.replace(" p. ", " logbook, page ") ?: stringResource(R.string.books_no_page), Modifier.padding(top = Tokens.Space.s1))
                    Text(entryTitle(e), color = c.ink, style = MaterialTheme.typography.headlineMedium.copy(fontSize = Tokens.PhoneType.heading.size * 1.22f), modifier = Modifier.padding(top = Tokens.Space.s3).semantics { heading() })
                    Meta(entryMeta(e))
                    SelectionContainer { Text(transcription(e), color = c.ink, style = paper, modifier = Modifier.padding(top = Tokens.Space.s3)) }
                    if (e.adRefs.isNotEmpty()) SelectionContainer { Meta(e.adRefs.joinToString(" · ") { "AD $it" }, Modifier.padding(top = Tokens.Space.s2)) }
                    val also = b.entries.filter { it.id != e.id && it.entryDate == e.entryDate && it.logbookId != e.logbookId && e.entryDate != null }
                    if (also.isNotEmpty()) {
                        FlowRow(Modifier.padding(top = Tokens.Space.s3), horizontalArrangement = Arrangement.spacedBy(6.dp), itemVerticalAlignment = Alignment.CenterVertically) {
                            Meta(stringResource(R.string.books_also_signed))
                            also.forEach { a ->
                                PageCite(pageLabel(b, a.pageId) ?: bookTitle(b, a.logbookId), "", Section.Books, Modifier.heightIn(min = Tokens.Size.phoneTouchMin).clickable { id = a.id })
                            }
                        }
                    }
                    if (e.trust == "ai_read") {
                        Meta(stringResource(R.string.books_not_confirmed), Modifier.padding(top = Tokens.Space.s3))
                        e.pageId?.let { p -> DButton(stringResource(R.string.books_review_this_page), { nav.openReview(p) }, modifier = Modifier.padding(top = Tokens.Space.s2)) }
                    } else if (ui.canEdit && e.authoredSignedAt == null) {
                        DButton(stringResource(R.string.books_edit_entry), { nav.editEntry(e.id) }, kind = ButtonKind.Secondary, icon = LucideIcons.Pencil, modifier = Modifier.padding(top = Tokens.Space.s4))
                    }
                }
            }
        }
    }
}

/** M-BOOKS-07 Edit entry: the review fields in a pushed form; Save sends entry.update, which confirms. */
@Composable
fun EditEntryScreen(vm: BooksViewModel, entryId: String, nav: BooksNav) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val e = ui.books?.entries?.firstOrNull { it.id == entryId } ?: return
    val scope = rememberCoroutineScope()
    val texts = remember(e.id) { Field.entries.associateWith { mutableStateOf(e.editText(it)) } }
    var busy by remember { mutableStateOf(false) }
    val bad = Field.entries.filter { parseField(it, texts.getValue(it).value).isFailure }
    BooksBoard(stringResource(R.string.books_edit_entry), vm, ui, back = stringResource(R.string.cancel) to nav.back) {
        PhoneLeaf {
            Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = Tokens.Space.s8), verticalArrangement = Arrangement.spacedBy(Tokens.Space.s2)) {
                Field.entries.forEach { f ->
                    var v by texts.getValue(f)
                    OutlinedTextField(
                        v, { v = it }, label = { Text(f.label) }, colors = dTextFieldColors(), isError = f in bad,
                        textStyle = if (f.paper) paper else MaterialTheme.typography.bodyLarge, modifier = Modifier.fillMaxWidth(),
                        supportingText = if (f in bad) { { Text(stringResource(if (f == Field.Date) R.string.books_bad_date else R.string.books_bad_number)) } } else null,
                    )
                }
                DButton(stringResource(R.string.save), {
                    busy = true
                    scope.launch {
                        val changed = Field.entries.filter { texts.getValue(it).value != e.editText(it) }
                            .associate { it.column to parseField(it, texts.getValue(it).value).getOrNull() }
                        val ok = vm.write(listOf(if (changed.isEmpty()) BookWrites.confirm(ui.aircraft!!.aircraft.id, e) else BookWrites.update(ui.aircraft!!.aircraft.id, e, changed)))
                        busy = false
                        if (ok != null) nav.back()
                    }
                }, enabled = bad.isEmpty() && ui.canEdit, busyText = if (busy) stringResource(R.string.saving) else null)
            }
        }
    }
}

/** The text a field edits from: numbers without grouping, so they parse back. */
fun EntryRow.editText(f: Field): String = when (f) {
    Field.Tach -> tach?.toString()
    Field.Hobbs -> hobbs?.toString()
    else -> value(f)
} ?: ""

// --- Pages (M-BOOKS-06) ----------------------------------------------------------------------------

@Composable
fun PagesTab(ui: BooksUi, b: Books, nav: BooksNav) {
    val c = MyTailLogTheme.colors
    val queue = reviewQueue(b)
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = Tokens.Space.s8)) {
        if (queue.isNotEmpty()) item {
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(Tokens.Radius.m)).background(c.leaf2).padding(Tokens.Space.s3),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s3),
            ) {
                Text(pluralStringResource(R.plurals.books_pages_wait, queue.size, queue.size), color = c.ink, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                DButton(stringResource(R.string.books_tab_review_plain), { nav.openReview(null) }, kind = ButtonKind.Secondary, modifier = Modifier.width(110.dp).height(Tokens.Size.buttonS))
            }
        }
        item {
            val entries = b.entries.count { !it.isContinuation }
            Meta(stringResource(R.string.books_pages_summary,
                pluralStringResource(R.plurals.count_pages, b.pages.size, b.pages.size),
                pluralStringResource(R.plurals.count_entries, entries, entries)), Modifier.padding(top = Tokens.Space.s3))
        }
        items(shelf(b), key = { it.id }) { book ->
            val pages = b.pages.count { it.logbookId == book.id }
            val gaps = b.map.gaps.filter { it.logbook == book.type && it.status != "no_pages_exist" }.joinToString(", ") { "gap ${it.from.take(4)} to ${it.to.take(4)}" }
            Column(
                Modifier.fillMaxWidth().heightIn(min = 72.dp).focusRing().clickable(role = Role.Button) { nav.openBook(book.id) }
                    .semantics(mergeDescendants = true) {}.padding(vertical = Tokens.Space.s3),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(bookTitle(b, book.id), color = c.ink, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight(700)), modifier = Modifier.weight(1f))
                    Icon(LucideIcons.ChevronRight, contentDescription = null, tint = c.ink3, modifier = Modifier.size(20.dp))
                }
                Meta(listOfNotNull("$pages ${if (pages == 1) "page" else "pages"}", gaps.ifBlank { null }).joinToString(" · "))
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(c.rule))
        }
        if (!ui.canEdit) item { Meta(stringResource(R.string.books_viewer), Modifier.padding(top = Tokens.Space.s3)) }
    }
}

/** A thumbnail's state mark (M-BOOKS-06): dotted = read by AI and waiting, alarm = needs a look, none = confirmed. */
fun pageMark(b: Books, p: PageRow): Pair<MarkKind, String>? = when {
    p.extractionStatus == "failed" || p.unreadRotated || (p.needsLook == true && p.reviewStatus != "confirmed") -> MarkKind.Overdue to "Needs a look"
    p.extractionStatus in setOf("queued", "processing", "waiting_allowance") -> MarkKind.Neutral to "Being read"
    b.entries.any { it.pageId == p.id && it.trust == "ai_read" } -> MarkKind.NoRecord to "Read by AI, waiting"
    else -> null
}

/** M-BOOKS-06 book page: the book's pages as a grid of thumbnails in filed order. */
@Composable
fun BookPagesScreen(vm: BooksViewModel, logbookId: String, nav: BooksNav) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val b = ui.books ?: return
    val c = MyTailLogTheme.colors
    val pages = b.pages.filter { it.logbookId == logbookId }.sortedBy { it.pageSequence ?: Int.MAX_VALUE }
    BooksBoard(bookTitle(b, logbookId), vm, ui, back = stringResource(R.string.section_books) to nav.back) {
        PhoneLeaf {
            if (pages.isEmpty()) Text(stringResource(R.string.books_book_empty, bookTitle(b, logbookId)), color = c.ink, style = MaterialTheme.typography.bodyLarge)
            LazyVerticalGrid(GridCells.Adaptive(104.dp), horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s2), verticalArrangement = Arrangement.spacedBy(Tokens.Space.s2)) {
                items(pages, key = { it.id }) { p ->
                    val mark = pageMark(b, p)
                    val label = "Page ${p.pageSequence ?: "?"}" + (mark?.let { ", ${it.second}" } ?: "")
                    Box(
                        Modifier.aspectRatio(3f / 4f).clip(RoundedCornerShape(Tokens.Radius.s)).focusRing().clickable(role = Role.Button) { nav.openPage(p.id) }
                            .semantics(mergeDescendants = true) { contentDescription = label },
                    ) {
                        ScanCrop(rememberScan(vm, p.id, thumb = true), "", Modifier.fillMaxSize())
                        mark?.let { (k, w) -> StatusMark(k, w, Modifier.align(Alignment.TopStart).background(c.leaf).padding(2.dp), compact = true) }
                        Text(
                            "${p.pageSequence ?: "?"}", color = c.ink, style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight(700)),
                            modifier = Modifier.align(Alignment.BottomEnd).padding(4.dp).background(c.leaf, RoundedCornerShape(Tokens.Radius.s)).padding(horizontal = 4.dp),
                        )
                    }
                }
            }
        }
    }
}

/** The ScanViewer pushed from a thumbnail: the page full width, swipe for the next, its entries below. */
@Composable
fun PageScreen(vm: BooksViewModel, pageId: String, nav: BooksNav) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val b = ui.books ?: return
    val start = b.pages.firstOrNull { it.id == pageId } ?: return
    val pages = b.pages.filter { it.logbookId == start.logbookId }.sortedBy { it.pageSequence ?: Int.MAX_VALUE }
    val pager = rememberPagerState(pages.indexOf(start).coerceAtLeast(0)) { pages.size }
    BooksBoard(pageLabel(b, pages[pager.currentPage].id) ?: "", vm, ui, back = bookTitle(b, start.logbookId) to nav.back) {
        HorizontalPager(pager, Modifier.fillMaxSize()) { i ->
            val p = pages[i]
            PhoneLeaf {
                BoxWithConstraints(Modifier.fillMaxSize()) {
                    val scanHeight = minOf(maxWidth * 1.3f, maxHeight)
                    Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = Tokens.Space.s8)) {
                        ScanViewer(rememberScan(vm, p.id), pageLabel(b, p.id) ?: "", Modifier.fillMaxWidth().height(scanHeight))
                        pageMark(b, p)?.let { (k, w) -> StatusMark(k, w, Modifier.padding(top = Tokens.Space.s2)) }
                        entriesOn(b, p.id).forEach { e -> EntryRowView(b, e) { nav.openEntry(e.id) } }
                        if (needsWebsiteReview(b, p) || b.entries.any { it.pageId == p.id && it.trust == "ai_read" }) DButton(stringResource(R.string.books_review_this_page), { nav.openReview(p.id) }, modifier = Modifier.padding(top = Tokens.Space.s3))
                    }
                }
            }
        }
    }
}

// --- Review queue (Logbooks › Review) -------------------------------------------------------------

@Composable
fun QueueTab(vm: BooksViewModel, ui: BooksUi, b: Books, nav: BooksNav) {
    val c = MyTailLogTheme.colors
    val queue = reviewQueue(b)
    val reading = beingRead(b)
    val scope = rememberCoroutineScope()
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = Tokens.Space.s8)) {
        if (queue.isEmpty()) item { Text(stringResource(R.string.books_queue_empty), color = c.ink, style = MaterialTheme.typography.bodyLarge) }
        else {
            item { GroupHeader(stringResource(R.string.books_queue_waiting), count = "${queue.size}") }
            items(queue, key = { it.id }) { p -> QueueRow(b, p) { nav.openReview(p.id) } }
            val clean = queue.count { p -> entriesOn(b, p.id).filter { it.trust == "ai_read" }.let { it.isNotEmpty() && it.all(::isClean) } }
            if (ui.canEdit && clean > 0) item {
                DButton(pluralStringResource(R.plurals.books_confirm_clean, clean, clean), { scope.launch { vm.write(listOf(BookWrites.confirmClean(ui.aircraft!!.aircraft.id))) } }, kind = ButtonKind.Secondary, modifier = Modifier.padding(top = Tokens.Space.s4))
            }
        }
        if (reading.isNotEmpty()) {
            item { GroupHeader(stringResource(R.string.books_queue_reading), count = "${reading.size}") }
            items(reading, key = { "r" + it.id }) { p ->
                Row(Modifier.fillMaxWidth().heightIn(min = Tokens.Size.phoneRowMin), verticalAlignment = Alignment.CenterVertically) {
                    Text(pageLabel(b, p.id) ?: "", color = c.ink, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                    StatusMark(MarkKind.Neutral, stringResource(R.string.books_being_read_short), compact = true)
                }
            }
        }
    }
}

/** Same rule as the server's confirmClean (apps/web lib/extraction/schema.ts isEntryClean). */
fun isClean(e: EntryRow): Boolean =
    !e.isContinuation && (e.confidence ?: 0.0) >= DOUBT_BELOW && e.fieldConfidence.orEmpty().values.all { it == null || it >= DOUBT_BELOW }

/** QueueRow (02): the page, how many entries, how many fields are in doubt. */
@Composable
fun QueueRow(b: Books, p: PageRow, selected: Boolean = false, onClick: () -> Unit) {
    val c = MyTailLogTheme.colors
    val es = entriesOn(b, p.id).filter { it.trust == "ai_read" }
    val doubts = es.sumOf { e -> Field.entries.count { e.doubtful(it) } }
    Row(
        Modifier.fillMaxWidth().heightIn(min = Tokens.Size.phoneRowMin).background(if (selected) c.leaf2 else c.leaf).focusRing()
            .clickable(role = Role.Button, onClick = onClick).semantics(mergeDescendants = true) {}.padding(vertical = Tokens.Space.s2),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s3),
    ) {
        Column(Modifier.weight(1f)) {
            Text(pageLabel(b, p.id) ?: "", color = c.ink, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight(700)))
            Meta(if (needsWebsiteReview(b, p)) "Review document on website" else listOfNotNull(
                "${es.size} ${if (es.size == 1) "entry" else "entries"}",
                if (doubts == 0) "reads cleanly" else "$doubts ${if (doubts == 1) "field" else "fields"} to check",
            ).joinToString(" · "))
            TrustMark(TrustLevel.AiRead, stringResource(R.string.trust_ai), Modifier.padding(top = 2.dp))
        }
    }
    Box(Modifier.fillMaxWidth().height(1.dp).background(c.rule))
}

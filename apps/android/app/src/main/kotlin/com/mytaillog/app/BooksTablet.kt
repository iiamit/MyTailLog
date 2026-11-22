package com.mytaillog.app

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.mytaillog.core.api.Books
import com.mytaillog.core.api.EntryRow
import com.mytaillog.core.domain.due.fmtDate
import com.mytaillog.design.ButtonKind
import com.mytaillog.design.DButton
import com.mytaillog.design.MyTailLogTheme
import com.mytaillog.design.Section
import com.mytaillog.design.SubTabs
import com.mytaillog.design.Tokens
import com.mytaillog.design.TrustMark
import com.mytaillog.design.toTextStyle

/** Tablet Logbooks (T-BOOKS-01, T-REVIEW-01): the board's own back stack, the phone screens pushed inside it. */
@Composable
fun TabletBooks(vm: BooksViewModel) {
    val nav = rememberNavController()
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val wide = maxWidth >= 1000.dp
        NavHost(nav, startDestination = "logbooks/root") {
            composable("logbooks/root") { TabletBooksRoot(vm, booksNav(nav)) }
            booksRoutes(nav, vm, wide = wide)
        }
    }
}

@Composable
private fun TabletBooksRoot(vm: BooksViewModel, nav: BooksNav) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableIntStateOf(0) }
    val c = MyTailLogTheme.colors
    val queue = ui.books?.let(::reviewQueue).orEmpty()
    Column(Modifier.fillMaxSize()) {
        SubTabs(
            listOf(stringResource(R.string.books_tab_map), stringResource(R.string.books_tab_pages), stringResource(R.string.books_tab_review, queue.size)),
            tab, { tab = it }, Section.Books, Modifier.padding(bottom = Tokens.Space.s3),
        )
        MessageBar(ui.message, vm::messageShown)
        val b = ui.books
        if (b == null || tab != 0) {
            Box(Modifier.fillMaxSize().clip(RoundedCornerShape(3.dp)).background(c.leaf).padding(horizontal = 30.dp, vertical = 26.dp)) {
                when {
                    b == null && ui.failed -> BooksError(vm::refresh)
                    b == null -> BooksLoading()
                    tab == 1 -> PagesTab(ui, b, nav)
                    else -> QueueTab(vm, ui, b, nav)
                }
            }
            return@Column
        }
        MapWithPages(vm, ui, b, nav)
    }
}

/** T-BOOKS-01: the horizontal RouteMap and the selection's entries on the left, its page on the right. */
@Composable
private fun MapWithPages(vm: BooksViewModel, ui: BooksUi, b: Books, nav: BooksNav) {
    val c = MyTailLogTheme.colors
    var book by rememberSaveable { mutableStateOf<String?>(null) }
    var target by remember { mutableStateOf<MapTarget?>(null) }
    var shown by remember(target) { mutableIntStateOf(0) }
    val model = remember(b, book) { shownModel(b, book) }
    val picked: List<EntryRow> = when (val t = target) {
        is MapTarget.Stop -> t.stopIds.flatMap { id -> b.map.stops.firstOrNull { it.id == id }?.entryIds.orEmpty() }
        is MapTarget.Visit -> b.map.interchanges.firstOrNull { it.id == t.id }?.stopIds.orEmpty().flatMap { id -> b.map.stops.firstOrNull { it.id == id }?.entryIds.orEmpty() }
        else -> emptyList()
    }.mapNotNull { id -> b.entries.firstOrNull { it.id == id } }
    Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(Tokens.Size.leavesGap)) {
        Column(Modifier.weight(1.3f).fillMaxHeight().clip(RoundedCornerShape(3.dp)).background(c.leaf).padding(Tokens.Space.s5).verticalScroll(rememberScrollState())) {
            Row {
                val confirmed = b.entries.count { it.trust != "ai_read" }
                Meta(pluralStringResource(R.plurals.books_tablet_hint, confirmed, confirmed), Modifier.weight(1f))
                BookFilter(book, Modifier) { book = it; target = null }
            }
            BoxWithConstraints {
                RouteMapView(b, model, rememberMapLayout(model, "routemap", maxWidth.value), onTarget = { target = it }, selected = target)
            }
            OffMapBooks(b, nav)
            picked.forEachIndexed { i, e -> EntryRowView(b, e) { shown = i } }
            when (val t = target) {
                is MapTarget.Gap -> GapSheet(vm, ui, b, t.id, nav)
                is MapTarget.Ring -> RingSheet(b, t.itemKey)
                else -> Unit
            }
        }
        Column(Modifier.weight(1f).fillMaxHeight().clip(RoundedCornerShape(3.dp)).background(c.mat).padding(Tokens.Space.s4)) {
            val e = picked.getOrNull(shown)
            if (e == null) {
                Text(stringResource(R.string.books_tablet_pick), color = c.onCover2, style = MaterialTheme.typography.bodyLarge)
                return@Column
            }
            if (picked.size > 1) Row(horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s2)) {
                // One tab per book of a visit.
                picked.forEachIndexed { i, x ->
                    DButton(pageLabel(b, x.pageId) ?: bookTitle(b, x.logbookId), { shown = i }, kind = if (i == shown) ButtonKind.Secondary else ButtonKind.Quiet, modifier = Modifier.weight(1f))
                }
            }
            Text(entryTitle(e), color = c.onCover, style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
            Text(listOfNotNull(e.entryDate?.let(::fmtDate), pageLabel(b, e.pageId)).joinToString(" · "), color = c.onCover2, style = MaterialTheme.typography.bodyMedium)
            ScanViewer(rememberScan(vm, e.pageId), pageLabel(b, e.pageId) ?: "", Modifier.weight(1f).fillMaxWidth().padding(vertical = Tokens.Space.s2), outline = entryBox(e))
            Row(horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s2)) {
                Box(Modifier.weight(1f).background(c.leaf, RoundedCornerShape(Tokens.Radius.m)).padding(Tokens.Space.s2)) { TrustMark(entryTrust(e), entryTrustWords(e)) }
                if (e.trust == "ai_read" && e.pageId != null) DButton(stringResource(R.string.books_review_this_page), { nav.openReview(e.pageId) }, kind = ButtonKind.Secondary, modifier = Modifier.weight(1f))
                else DButton(stringResource(R.string.books_open_page), { nav.openEntry(e.id) }, kind = ButtonKind.Secondary, modifier = Modifier.weight(1f))
            }
            Text(transcription(e), color = c.onCover, style = Tokens.PhoneType.paper.toTextStyle(), maxLines = 4, modifier = Modifier.padding(top = Tokens.Space.s2))
        }
    }
}

package com.mytaillog.app

import androidx.compose.ui.platform.LocalResources

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mytaillog.core.sync.FieldDiff
import com.mytaillog.core.sync.Resolution
import com.mytaillog.core.sync.SyncEngine
import com.mytaillog.design.ButtonKind
import com.mytaillog.design.DButton
import com.mytaillog.design.GroupHeader
import com.mytaillog.design.LucideIcons
import com.mytaillog.design.MyTailLogTheme
import com.mytaillog.design.PhoneHeader
import com.mytaillog.design.PhoneLeaf
import com.mytaillog.design.Section
import com.mytaillog.design.Tokens
import com.mytaillog.design.section
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive

/** The SyncLine's state (06 §1.3) with the outbox taken into account; [synced] is "synced 9:38" or similar. */
fun syncLineState(s: SyncState, synced: String): String = when {
    s.conflicts > 0 -> "${s.conflicts} to decide"
    s.failed -> "sync failed"
    s.syncing -> "syncing"
    s.waiting + s.pages > 0 -> "${s.waiting + s.pages} waiting"
    !s.online -> "offline"
    else -> synced
}

/** The OfflineBar's words (06 §1.3), or null when it isn't shown. */
fun offlineBarText(s: SyncState): String? {
    val changes = s.waiting
    return when {
        !s.online && s.pages > 0 && changes == 0L -> "${s.pages} ${if (s.pages == 1) "page" else "pages"} on this phone. They upload when you have signal."
        !s.online && changes + s.pages > 0 -> "${changes + s.pages} ${if (changes + s.pages == 1L) "change" else "changes"} on this phone. They upload when you have signal."
        !s.online -> "Offline. Saved records remain available. Some actions need a connection."
        s.uploading != null -> "Uploading ${s.uploading.first + 1} of ${s.uploading.second}"
        changes + s.pages > 0 -> "Uploading ${changes + s.pages} ${if (changes + s.pages == 1L) "change" else "changes"}"
        else -> null
    }
}

/** ConflictBar (alarm, replaces the OfflineBar) or OfflineBar (cover), 36dp, under the PhoneHeader. Tap opens M-SYS-01. */
@Composable
fun SyncBars(s: SyncState, onOpen: (() -> Unit)?) {
    val c = MyTailLogTheme.colors
    val conflict = s.conflicts > 0
    val text = if (conflict) pluralStringResource(R.plurals.sync_conflict_bar, s.conflicts.toInt(), s.conflicts.toInt()) else offlineBarText(s) ?: return
    Row(
        Modifier.fillMaxWidth().heightIn(min = 36.dp).background(if (conflict) c.alarmBg else c.cover)
            .then(if (onOpen != null) Modifier.clickable(role = Role.Button, onClick = onOpen) else Modifier)
            .padding(horizontal = Tokens.Space.s4, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s2),
    ) {
        if (!conflict) Icon(if (s.online) LucideIcons.CloudUpload else LucideIcons.WifiOff, null, tint = c.onCover, modifier = Modifier.size(16.dp))
        Text(text, color = if (conflict) c.onAlarmBg else c.onCover, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight(600)), modifier = Modifier.weight(1f))
        if (conflict && onOpen != null) Text(stringResource(R.string.sync_compare), color = c.onAlarmBg, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight(700)))
    }
}

/**
 * M-SYS-01 Waiting to upload: everything on this phone that hasn't reached the server, refusals with
 * their reason, and conflicts as yours beside theirs. Nothing is overwritten silently; a conflict can
 * wait indefinitely ("Decide later" is just leaving).
 */
@Composable
fun WaitingScreen(host: CaptureHost, section: Section, backLabel: String, onBack: () -> Unit) {
    val c = MyTailLogTheme.colors
    val store = host.store
    val sync by store.sync.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val resources = LocalResources.current
    val all = remember(sync.version) { store.queued() }
    val pages = remember(sync.version) { store.pageJobs() }
    val activity = remember(sync.version) { store.activity(50) }
    var discarding by remember { mutableStateOf<Pair<String, String>?>(null) }
    var toast by remember { mutableStateOf<String?>(null) }
    var showActivity by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().background(c.section(section).board)) {
        PhoneHeader(stringResource(R.string.sync_title), section, back = backLabel to onBack)
        PhoneLeaf {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                val changes = all.count { it.status != SyncEngine.REFUSED && it.status != SyncEngine.CONFLICT }
                Text(
                    when {
                        sync.uploading != null -> "Uploading ${sync.uploading!!.first + 1} of ${sync.uploading!!.second}"
                        changes + pages.size == 0 -> stringResource(R.string.sync_all_done)
                        else -> summaryLine(changes, pages.size)
                    },
                    color = c.ink, style = MaterialTheme.typography.titleMedium,
                )
                toast?.let { Text(it, color = c.ink2, style = MaterialTheme.typography.bodyMedium) }
                DButton(stringResource(R.string.sync_now), { host.kick(); scope.launch { store.syncNow() } }, kind = ButtonKind.Secondary, enabled = sync.online && !sync.syncing, busyText = if (sync.syncing) stringResource(R.string.syncing) else null, modifier = Modifier.padding(vertical = Tokens.Space.s2))

                val conflicts = all.filter { it.status == SyncEngine.CONFLICT }
                if (conflicts.isNotEmpty()) GroupHeader(stringResource(R.string.sync_two_places), count = "${conflicts.size}")
                conflicts.forEach { m ->
                    val diffs = remember(m.id, sync.version) { store.engine.diff(m.id) }
                    Text(m.label, color = c.ink, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight(700)), modifier = Modifier.padding(top = Tokens.Space.s3))
                    Text(stringResource(R.string.sync_conflict_why), color = c.ink2, style = MaterialTheme.typography.bodyMedium)
                    diffs.forEach { DiffRow(it) }
                    fun decide(r: Resolution, said: Int) = scope.launch {
                        runCatching { store.resolve(m.id, r) }.onSuccess { toast = resources.getString(said); host.kick() }
                    }
                    if (com.mytaillog.core.sync.Conflicts.canKeepBoth(diffs)) DButton(stringResource(R.string.sync_keep_both), { decide(Resolution.KeepBoth, R.string.sync_kept_both) }, modifier = Modifier.padding(top = Tokens.Space.s2))
                    Row(horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s2)) {
                        DButton(stringResource(R.string.sync_keep_mine), { decide(Resolution.KeepMine, R.string.sync_kept_mine) }, kind = ButtonKind.Secondary, modifier = Modifier.weight(1f))
                        DButton(stringResource(R.string.sync_take_theirs), { decide(Resolution.TakeTheirs, R.string.sync_took_theirs) }, kind = ButtonKind.Secondary, modifier = Modifier.weight(1f))
                    }
                    DButton(stringResource(R.string.sync_decide_later), onBack, kind = ButtonKind.Quiet)
                }

                val refused = all.filter { it.status == SyncEngine.REFUSED }
                if (refused.isNotEmpty()) GroupHeader(stringResource(R.string.sync_not_saved), count = "${refused.size}")
                refused.forEach { m ->
                    Text(m.label, color = c.alarmText, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight(600)), modifier = Modifier.padding(top = Tokens.Space.s2))
                    m.error?.let { Text(it, color = c.alarmText, style = MaterialTheme.typography.bodyMedium) }
                    TextButton({ discarding = m.id to m.label }) { Text(stringResource(R.string.sync_discard_change), color = c.alarmText) }
                }

                val waiting = all.filter { it.status != SyncEngine.REFUSED && it.status != SyncEngine.CONFLICT }
                if (waiting.isNotEmpty() || pages.isNotEmpty()) GroupHeader(stringResource(R.string.sync_waiting), count = "${waiting.size + pages.size}")
                if (pages.isNotEmpty()) {
                    Text(
                        pluralStringResource(R.plurals.sync_pages_row, pages.size, pages.size, pages.first().book),
                        color = c.ink, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(top = Tokens.Space.s2),
                    )
                    pages.filter { it.gaveUp }.forEach { j ->
                        Text(j.error ?: stringResource(R.string.queue_not_uploaded), color = c.alarmText, style = MaterialTheme.typography.bodyMedium)
                        Row {
                            TextButton({ store.retryPage(j.id); host.kick() }) { Text(stringResource(R.string.try_again), color = c.ink) }
                            TextButton({ store.discardPage(j.id) }) { Text(stringResource(R.string.queue_remove), color = c.alarmText) }
                        }
                    }
                }
                waiting.forEach { m ->
                    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(top = Tokens.Space.s2), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(m.label, color = c.ink, style = MaterialTheme.typography.bodyLarge)
                            Text("${clock(m.created_at)} · ${waitingState(m.status, m.next_try_at, sync.online)}", color = c.ink3, style = MaterialTheme.typography.bodySmall)
                        }
                        if (m.status != SyncEngine.SENDING) TextButton({ discarding = m.id to m.label }) { Text(stringResource(R.string.sync_discard), color = c.alarmText) }
                    }
                }

                TextButton({ showActivity = !showActivity }, Modifier.padding(top = Tokens.Space.s4)) { Text(stringResource(R.string.sync_activity), color = c.ink) }
                if (showActivity) activity.forEach { a ->
                    Text("${clock(a.at)}  ${a.text}", color = c.ink2, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
    discarding?.let { (id, label) ->
        AlertDialog(
            onDismissRequest = { discarding = null },
            title = { Text(stringResource(R.string.sync_discard_title)) },
            text = { Text(label) },
            confirmButton = { TextButton({ store.discard(id); discarding = null }) { Text(stringResource(R.string.sync_discard), color = c.alarmText) } },
            dismissButton = { TextButton({ discarding = null }) { Text(stringResource(R.string.cancel), color = c.ink) } },
            containerColor = c.leaf, titleContentColor = c.ink, textContentColor = c.ink,
        )
    }
}

fun summaryLine(changes: Int, pages: Int): String {
    val parts = listOfNotNull(
        changes.takeIf { it > 0 }?.let { "$it ${if (it == 1) "change" else "changes"}" },
        pages.takeIf { it > 0 }?.let { "$it ${if (it == 1) "page" else "pages"}" },
    )
    return parts.joinToString(" and ") + " on this phone."
}

/** "On this phone" / "Trying again at 9:45" / "Uploading". */
fun waitingState(status: String, nextTryAt: Long?, online: Boolean, now: Long = System.currentTimeMillis()): String = when {
    status == SyncEngine.SENDING -> "Uploading"
    status == SyncEngine.BLOCKED -> "Waiting for a decision above"
    online && nextTryAt != null && nextTryAt > now -> "Trying again at ${clock(nextTryAt)}"
    else -> "On this phone"
}

/** One field of a conflict, stacked for phone width (06 M-SYS-01): name, then Yours and Theirs, marked when different. */
@Composable
private fun DiffRow(d: FieldDiff) {
    val c = MyTailLogTheme.colors
    val different = d.clash || (d.changedByThem && d.changedByMe)
    Row(Modifier.fillMaxWidth().padding(top = Tokens.Space.s2).background(if (different) c.alarmBg else c.leaf)) {
        if (different) Box(Modifier.width(3.dp).heightIn(min = 60.dp).background(c.alarm))
        Column(Modifier.padding(Tokens.Space.s2).semantics(mergeDescendants = true) { if (different) contentDescription = "Different. ${d.field}: yours ${show(d.mine)}, theirs ${show(d.theirs)}" }) {
            Text(d.field.replace('_', ' ').replaceFirstChar { it.uppercase() }, color = if (different) c.onAlarmBg else c.ink, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight(700)))
            Text("Yours: ${show(d.mine)}", color = if (different) c.onAlarmBg else c.ink, style = MaterialTheme.typography.bodyMedium)
            Text("Theirs: ${show(d.theirs)}", color = if (different) c.onAlarmBg else c.ink, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

private fun show(v: JsonElement?): String = when (v) {
    null, JsonNull -> "None"
    is JsonPrimitive -> v.content
    else -> v.toString()
}

/** Capture and sync for the screens inside an aircraft: the store and where its bars lead. */
class CaptureNav(val host: CaptureHost, val openSync: () -> Unit, val openQueue: () -> Unit)

val LocalCaptureNav = androidx.compose.runtime.compositionLocalOf<CaptureNav?> { null }

/** Under a top-level PhoneHeader: the ConflictBar or OfflineBar, and on Logbooks a way to the pages in progress. */
@Composable
fun CaptureBar(queueLink: Boolean = false) {
    val nav = LocalCaptureNav.current ?: return
    val s by nav.host.store.sync.collectAsStateWithLifecycle()
    SyncBars(s, nav.openSync)
    if (queueLink && s.pages > 0) {
        val c = MyTailLogTheme.colors
        Text(
            pluralStringResource(R.plurals.queue_link, s.pages, s.pages),
            color = c.section(Section.Books).onBoard,
            style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight(600)),
            modifier = Modifier.fillMaxWidth().heightIn(min = 44.dp).clickable(role = Role.Button, onClick = nav.openQueue).padding(horizontal = Tokens.Space.s4, vertical = 12.dp),
        )
    }
}

/** The SyncLine's state, with the outbox's say when the store is there. */
@Composable
fun withOutbox(synced: String): String {
    val nav = LocalCaptureNav.current ?: return synced
    val s by nav.host.store.sync.collectAsStateWithLifecycle()
    return syncLineState(s, synced)
}

package com.mytaillog.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.foundation.layout.Row
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.Alignment
import androidx.compose.ui.unit.dp
import com.mytaillog.core.api.*
import com.mytaillog.design.*
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*
import java.util.UUID

private val identityLabels = mapOf("make" to "Manufacturer", "model" to "Model", "serial_number" to "Serial number", "part_number" to "Part number", "tail_number" to "Registration")

@Composable
fun PageIdentityReview(vm: BooksViewModel, books: Books, page: PageRow, aircraftId: String, canEdit: Boolean) {
    var expanded by remember(page.id) { mutableStateOf(books.entries.none { it.pageId == page.id } || page.identitySuggestions.any { it.status == "pending" }) }
    DButton("Page contents and aircraft details", { expanded = !expanded }, kind = ButtonKind.Quiet)
    if (!expanded) return
    val scope = rememberCoroutineScope()
    var busy by remember(page.id) { mutableStateOf(false) }
    var message by remember(page.id) { mutableStateOf<String?>(null) }
    val c = MyTailLogTheme.colors
    val disabled = busy || !canEdit || vm.detailsPending(page.id)
    fun save(decision: JsonObject) {
        busy = true
        scope.launch {
            val result = vm.write(listOf(BookWrites.details(aircraftId, page, decision)))
            message = when { result == null -> "Could not save. Check the sync message and try again."; result.isEmpty() -> "Saved on this phone. Sync before reviewing more details on this page."; else -> "Saved with a link to this source page." }
            busy = false
        }
    }
    Column(Modifier.fillMaxWidth().padding(vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Page contents", color = c.ink, style = MaterialTheme.typography.titleMedium)
        Text("Identification and reference pages belong here too. No maintenance entry is required.", color = c.ink, style = MaterialTheme.typography.bodyMedium)
        var showKinds by remember(page.id) { mutableStateOf(false) }
        DButton("Page type: ${page.contentKinds.joinToString().ifEmpty { "Not classified" }}", { showKinds = !showKinds }, kind = ButtonKind.Quiet)
        if (showKinds) listOf("identity", "equipment", "maintenance", "reference", "blank").forEach { kind ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(kind in page.contentKinds, enabled = !disabled, onCheckedChange = { checked ->
                    val kinds = page.contentKinds.filterNot { it == kind } + if (checked) listOf(kind) else emptyList()
                    save(buildJsonObject { put("action", "classify"); put("kinds", JsonArray(kinds.map(::JsonPrimitive))) })
                })
                Text(if (kind == "identity") "Identification" else kind.replaceFirstChar { it.uppercase() }, color = c.ink)
            }
        }
        page.identitySuggestions.forEach { suggestion ->
            if (suggestion.status == "pending") key(suggestion.id) {
                IdentitySuggestionForm(suggestion, books.identityTargets, aircraftId, disabled, ::save)
            } else Text("${suggestion.name} · ${if (suggestion.status == "accepted") "Details accepted" else "Suggestion dismissed"}", color = c.ink)
        }
        if (canEdit) DButton("Find aircraft details in this page", {
            busy = true
            scope.launch { message = vm.reread(page.id) ?: "Queued for reading. Confirmed entries and review decisions will be kept."; busy = false }
        }, enabled = !disabled, kind = ButtonKind.Quiet)
        message?.let { Text(it, color = c.ink, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }) }
    }
}

@Composable
private fun IdentitySuggestionForm(s: IdentitySuggestion, targets: List<IdentityTarget>, aircraftId: String, disabled: Boolean, save: (JsonObject) -> Unit) {
    val c = MyTailLogTheme.colors
    val fields = remember(s.id) { mutableStateMapOf<String, String>().apply { putAll(s.fields) } }
    var target by remember(s.id) { mutableStateOf(if (s.subject == "aircraft") aircraftId else "new") }
    var installed by remember(s.id) { mutableStateOf(false) }
    val current = targets.firstOrNull { it.id == target }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(s.name, color = c.ink, style = MaterialTheme.typography.titleMedium)
        Text(s.quote, color = c.ink, style = MaterialTheme.typography.bodyLarge)
        Text(if (s.confidence < 0.8) "Uncertain — check every detail against the scan." else "Read by AI. Check against the scan before accepting.", color = c.ink)
        if (s.subject != "aircraft") Choice("Apply details to", listOf("new" to "New historical equipment record") + targets.filter { it.id != aircraftId }.map { it.id to listOfNotNull(it.name, it.serialNumber).joinToString(" · ") }, target) { target = it }
        fields.keys.sorted().forEach { field ->
            OutlinedTextField(fields[field].orEmpty(), { fields[field] = it.take(200) }, enabled = !disabled,
                label = { Text(identityLabels[field] ?: field) }, supportingText = { Text("Currently: ${current?.value(field) ?: "Not recorded"}") },
                modifier = Modifier.fillMaxWidth(), colors = dTextFieldColors(), singleLine = true)
        }
        if (s.subject != "aircraft" && target == "new") Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(installed, enabled = !disabled, onCheckedChange = { installed = it })
            Text("I have checked that this equipment is installed today. Otherwise keep it as historical equipment.", color = c.ink, style = MaterialTheme.typography.bodyMedium)
        }
        DButton("Accept details", { save(buildJsonObject {
            put("action", "accept"); put("suggestionId", s.id)
            put("fields", JsonObject(fields.mapValues { JsonPrimitive(it.value.trim()) }.filterValues { it.content.isNotEmpty() }))
            put("targetId", current?.id ?: UUID.randomUUID().toString()); current?.let { put("targetBase", it.updatedAt) }; put("installed", installed)
        }) }, enabled = !disabled, kind = ButtonKind.Secondary)
        DButton("Dismiss suggestion", { save(buildJsonObject { put("action", "dismiss"); put("suggestionId", s.id) }) }, enabled = !disabled, kind = ButtonKind.Quiet)
    }
}

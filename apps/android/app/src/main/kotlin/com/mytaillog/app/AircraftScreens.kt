package com.mytaillog.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mytaillog.design.ButtonKind
import com.mytaillog.design.DButton
import com.mytaillog.design.GroupHeader
import com.mytaillog.design.LucideIcons
import com.mytaillog.design.MyTailLogTheme
import com.mytaillog.design.PageCite
import com.mytaillog.design.Section
import com.mytaillog.design.SyncLine
import com.mytaillog.design.Tokens
import com.mytaillog.design.TrustLevel
import com.mytaillog.design.TrustMark
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import java.time.LocalDate

// 06 §8 Aircraft (M-AIRCRAFT-01..06): the aircraft as an object, every value with its source one tap away.

private val tabular = androidx.compose.ui.text.TextStyle(fontFeatureSettings = "tnum")

@Composable
private fun Chevron() = Icon(LucideIcons.ChevronRight, null, tint = MyTailLogTheme.colors.ink)

/** M-AIRCRAFT-01. [settings] keeps the phase 1 Settings row (sign out) at the end. */
@Composable
fun AircraftTab(recs: Recs, status: StatusHost?, onDocuments: () -> Unit, onSettings: (() -> Unit)?) {
    val nav = LocalRecNav.current
    val c = MyTailLogTheme.colors
    val scope = rememberCoroutineScope()
    val sync by recs.store.sync.collectAsStateWithLifecycleCompat()
    var checks by remember(recs.id) { mutableStateOf<List<TimeCheck>?>(null) }
    LaunchedEffect(recs.id, sync.online, sync.lastSync) {
        if (sync.online) checks = runCatching { recs.api.timeChecks(recs.id) }.getOrNull() ?: checks
    }
    val tach = recs.meter("tach")
    val hobbs = recs.meter("hobbs")
    val asOf = recs.snapshot?.meters?.get("tach")?.asOf
    val components = recs.watch { recs.store.records("component", recs.id) }
    val wb = recs.watch { recs.store.records("weight_balance", recs.id).sortedByDescending { it.s("revision_date") } }
    val samples = recs.watch { recs.store.records("oil_analysis_sample", recs.id).sortedByDescending { it.s("sample_date") } }
    val docs = recs.watch { recs.store.records("document", recs.id) }
    val plane = recs.watch { recs.store.mirror.raw("aircraft", recs.id) }
    Board(stringResource(R.string.section_aircraft), Section.Aircraft, status = status, toast = recs.toast, onToastDone = { recs.toast = null }) {
        // Hours
        GroupHeader(stringResource(R.string.ac_hours), count = asOf?.let { "read ${dayDate(it)}" })
        if (tach == null && hobbs == null) Empty(stringResource(R.string.ac_no_hours), if (recs.canEdit) stringResource(R.string.add_flight) else null, recs.openFlight)
        else {
            Row(Modifier.padding(top = Tokens.Space.s3), horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s6)) {
                tach?.let { Meter(stringResource(R.string.tach_label), it) }
                hobbs?.let { Meter("Hobbs", it) }
            }
            overhaul(recs, "engine_tbo", tach)?.let { Lede("Engine since overhaul · ${hours1(it)} h") }
            overhaul(recs, "prop_overhaul", tach)?.let { Lede("Prop since overhaul · ${hours1(it)} h") }
            RecRow(stringResource(R.string.ac_see_readings), onClick = { nav.open(Routes.HOURS) }, trailing = { Chevron() })
        }
        checks?.let { list -> TimeChecks(recs, list.filter { !it.dismissed }) }
        // Equipment
        val installed = components.filter { it.b("is_installed") }
        GroupHeader(stringResource(R.string.ac_equipment), count = "${installed.size} installed · ${components.size - installed.size} removed")
        installed.take(2).forEach { RecRow(it.s("name") ?: "", listOf(listOfNotNull(it.s("part_number"), it.s("install_date")?.take(4)).joinToString(" · ")), it) }
        RecRow(stringResource(R.string.ac_see_all), onClick = { nav.open(Routes.EQUIPMENT) }, trailing = { Chevron() })
        // Weight and balance
        val cur = wb.firstOrNull()
        GroupHeader(stringResource(R.string.ac_wb), count = cur?.s("revision_date")?.take(4))
        RecRow(
            cur?.let { "${fmt2(it.d("empty_weight"))} lb · arm ${fmt3(it.d("empty_weight_arm"))}" } ?: stringResource(R.string.ac_wb_none),
            listOfNotNull(cur?.d("max_gross_weight")?.let { "Max gross ${fmtNum(it)} lb" }), cur, onClick = { nav.open(Routes.WB) }, trailing = { Chevron() },
            below = { cur?.let { staleSince(it, components) }?.let { Note(stringResource(R.string.ac_wb_stale, it), alarm = true) } },
        )
        // Oil and engine
        GroupHeader(stringResource(R.string.ac_oil))
        RecRow(
            listOfNotNull(samples.firstOrNull()?.let { s -> "last sample ${s.s("sample_date")?.let(::dayDate)}${s.s("status")?.let { ", $it" } ?: ""}" })
                .joinToString(" · ").ifEmpty { stringResource(R.string.ac_oil_none) },
            onClick = { nav.open(Routes.OIL) }, trailing = { Chevron() },
        )
        RecRow("Engine history", listOf("Compression, oil reports and component lifecycle"), onClick = { nav.open(Routes.ENGINE_HISTORY) }, trailing = { Chevron() })
        if (recs.isOwner) RecRow("Ownership costs", listOf("Recorded spending and reserve estimates"), onClick = { nav.open(Routes.EXPENSES) }, trailing = { Chevron() })
        RecRow("Document inbox", listOf("Upload, classify and review originals"), onClick = { nav.open(Routes.DOCUMENT_INBOX) }, trailing = { Chevron() })
        RecRow("Prepare annual packet", listOf("Dated summary and selected evidence"), onClick = { nav.open(Routes.ANNUAL_PACKET) }, trailing = { Chevron() })
        // Documents
        GroupHeader(stringResource(R.string.section_docs))
        val missing = CARRY_ABOARD.filter { t -> docs.none { it.s("type") == t } }
        RecRow(
            "${docs.size} in the vault", listOfNotNull(stringResource(R.string.ac_carry_complete).takeIf { missing.isEmpty() }),
            onClick = onDocuments, trailing = { Chevron() },
            below = { missing.firstOrNull()?.let { Note("${docTypeName(it)} missing", alarm = true) } },
        )
        // Details
        GroupHeader(stringResource(R.string.ac_details))
        RecRow(
            listOfNotNull(plane?.s("year"), plane?.s("make"), plane?.s("model")).joinToString(" ").ifEmpty { recs.tail },
            listOf(listOfNotNull(plane?.s("serial_number")?.let { "S/N $it" }, plane?.s("home_base")).joinToString(" · ")).filter { it.isNotEmpty() },
            onClick = { nav.open(Routes.DETAILS) }, trailing = { Chevron() },
        )
        onSettings?.let { RecRow(stringResource(R.string.settings_title), onClick = it, trailing = { Chevron() }) }
        ViewerLine(recs)
    }
}

@Composable
private fun Meter(label: String, v: Double) {
    Column(Modifier.semantics(mergeDescendants = true) {}) {
        Note(label)
        Text(hours1(v), color = MyTailLogTheme.colors.ink, style = MaterialTheme.typography.headlineMedium.merge(tabular).copy(fontSize = 28.sp, fontWeight = FontWeight(700)))
    }
}

/** Time since the last overhaul of the engine or propeller: the meter less the hours its TBO item was last done at. */
private fun overhaul(recs: Recs, kind: String, tach: Double?): Double? {
    val done = recs.snapshot?.items?.firstOrNull { it.kind == kind }?.lastDone?.hours ?: return null
    return tach?.let { it - done }?.takeIf { it >= 0 }
}

/** The equipment installed after a W&B revision: what makes it possibly stale (C-WB-01). */
fun staleSince(rev: Rec, components: List<Rec>): String? {
    val date = rev.s("revision_date") ?: return null
    return components.filter { it.b("is_installed") && (it.s("install_date") ?: "") > date }.maxByOrNull { it.s("install_date")!! }
        ?.let { "${it.s("name")} (${it.s("install_date")!!.take(4)})" }
}

/** Written-versus-calculated time (C-HOURS-06): agreement as a check line, a gap as a soft alarm with the answer. */
@Composable
private fun TimeChecks(recs: Recs, checks: List<TimeCheck>) {
    val latest = checks.groupBy { it.component }.mapNotNull { it.value.firstOrNull() }
    if (latest.isEmpty()) return
    val apart = latest.filter { it.apart }
    if (apart.isEmpty()) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s2), modifier = Modifier.padding(vertical = Tokens.Space.s2)) {
            Icon(LucideIcons.CircleCheck, null, tint = MyTailLogTheme.colors.ink)
            Lede(stringResource(R.string.ac_times_agree))
        }
        return
    }
    apart.forEach { t ->
        Well(alarm = true) {
            Text(
                "The ${if (t.component == "prop") "propeller" else "engine"} log says ${hours1(t.written)} since overhaul; the meters say ${hours1(t.calculated)}, ${hours1(t.difference)} h apart." +
                    (if (t.digitSwap) " Two digits may be swapped." else "") + " Mention it to your IA; only a new entry can correct the book.",
                color = MyTailLogTheme.colors.onAlarmBg, style = MaterialTheme.typography.bodyMedium,
            )
            t.pageLabel?.let { PageCite(it, stringResource(R.string.your_note), Section.Books) }
            if (recs.canEdit) DButton(stringResource(R.string.ac_they_agree), {
                recs.change("timeCheck.dismiss", "time_check_dismissal", newId(), "Time check answered", json(
                    "id" to newId(), "component" to t.component, "entryId" to t.entryId, "written" to t.written, "calculated" to t.calculated, "action" to "agree",
                ))
            }, kind = ButtonKind.Secondary)
        }
    }
}

// --- Hours and readings (M-AIRCRAFT-02) ----------------------------------------------------------------

@Composable
fun HoursScreen(recs: Recs) {
    val nav = LocalRecNav.current
    val readings = recs.watch { recs.store.records("hours_reading", recs.id).sortedByDescending { it.s("reading_date") ?: "" } }
    val resets = recs.watch { recs.store.records("meter_reset", recs.id).sortedByDescending { it.s("reset_date") ?: "" } }
    var correcting by remember { mutableStateOf<Rec?>(null) }
    var deleting by remember { mutableStateOf<Rec?>(null) }
    var undoing by remember { mutableStateOf<Rec?>(null) }
    var replacing by remember { mutableStateOf(false) }
    Board(stringResource(R.string.ac_hours_title), Section.Aircraft, back = stringResource(R.string.section_aircraft) to nav.back, toast = recs.toast, onToastDone = { recs.toast = null }) {
        GroupHeader(stringResource(R.string.ac_readings), count = readings.size.toString())
        if (readings.isEmpty()) Empty(stringResource(R.string.ac_no_hours))
        readings.take(200).forEach { r ->
            val mine = editableReading(r.s("source")) && recs.canEdit
            RecRow(
                listOfNotNull(r.d("tach")?.let { "Tach ${hours1(it)}" }, r.d("hobbs")?.let { "Hobbs ${hours1(it)}" }, r.d("airframe")?.let { "Airframe ${hours1(it)}" }).joinToString(" · "),
                listOf(listOfNotNull(r.s("reading_date")?.let(::dayDate), readingSource(r.s("source"))).joinToString(" · ")), r,
                onClick = if (mine) ({ correcting = r }) else null,
                menu = if (mine) listOf(stringResource(R.string.ac_correct) to { correcting = r }, stringResource(R.string.rec_delete) to { deleting = r }) else emptyList(),
            )
        }
        GroupHeader(stringResource(R.string.ac_replacements))
        if (resets.isEmpty()) Note(stringResource(R.string.ac_no_replacements), Modifier.padding(vertical = Tokens.Space.s2))
        resets.forEach { m ->
            RecRow(
                "${(m.s("meter") ?: "tach").replaceFirstChar { it.uppercase() }} replaced ${m.s("reset_date")?.let(::longDate)}: ${fmt1(m.d("prior_value")) .ifEmpty { "?" }} → ${fmt1(m.d("new_value"))}", rec = m,
                below = { if (recs.canEdit) DButton(stringResource(R.string.ac_undo_replacement), { undoing = m }, kind = ButtonKind.Quiet, icon = LucideIcons.Undo2) },
            )
        }
        if (recs.canEdit) DButton(stringResource(R.string.ac_record_replacement), { replacing = true }, kind = ButtonKind.Secondary, modifier = Modifier.padding(top = Tokens.Space.s3))
    }
    correcting?.let { r -> CorrectReading(recs, r) { correcting = null } }
    deleting?.let { r ->
        Confirm(stringResource(R.string.ac_delete_reading, r.s("reading_date")?.let(::dayDate) ?: ""), stringResource(R.string.ac_delete_reading_body), stringResource(R.string.rec_delete), {
            recs.delete("reading.delete", "hours_reading", r.id, "Delete reading", json("readingId" to r.id))
        }, { deleting = null })
    }
    undoing?.let { m ->
        Confirm(stringResource(R.string.ac_undo_replacement_title), stringResource(R.string.ac_undo_replacement_body), stringResource(R.string.ac_undo_replacement), {
            recs.delete("meterReset.delete", "meter_reset", m.id, "Undo meter replacement", json("resetId" to m.id))
        }, { undoing = null })
    }
    if (replacing) ReplaceMeter(recs) { replacing = false }
}

@Composable
private fun CorrectReading(recs: Recs, r: Rec, onDone: () -> Unit) {
    var date by rememberSaveable { mutableStateOf(r.s("reading_date")) }
    var tach by rememberSaveable { mutableStateOf(fmt1(r.d("tach"))) }
    var hobbs by rememberSaveable { mutableStateOf(fmt1(r.d("hobbs"))) }
    Sheet(stringResource(R.string.ac_correct), onDone) {
        DateRow(stringResource(R.string.rec_date), date, { date = it }, pastOnly = true)
        Field(stringResource(R.string.tach_label), tach, { tach = it }, number = true, placeholder = stringResource(R.string.ac_leave_blank))
        Field("Hobbs", hobbs, { hobbs = it }, number = true, placeholder = stringResource(R.string.ac_leave_blank))
        DButton(stringResource(R.string.ac_save_correction), {
            recs.change("reading.update", "hours_reading", r.id, "Correct reading", json("readingId" to r.id, "date" to date, "tach" to num(tach), "hobbs" to num(hobbs)))
            onDone()
        }, enabled = date != null && (num(tach) != null || num(hobbs) != null))
    }
}

/** "Was the tach replaced?" outside a flight: the meter, the day, the last and first values (meterReset.create). */
@Composable
fun ReplaceMeter(recs: Recs, prior: Double? = null, next: Double? = null, onDone: () -> Unit) {
    var meter by rememberSaveable { mutableStateOf(0) }
    var date by rememberSaveable { mutableStateOf<String?>(LocalDate.now().toString()) }
    var old by rememberSaveable { mutableStateOf(fmt1(prior ?: recs.meter("tach"))) }
    var new by rememberSaveable { mutableStateOf(fmt1(next ?: 0.0)) }
    var notes by rememberSaveable { mutableStateOf("") }
    Sheet(stringResource(R.string.ac_record_replacement), onDone) {
        Segmented(listOf("Tach", "Hobbs"), meter) { meter = it; old = fmt1(recs.meter(if (it == 1) "hobbs" else "tach")) }
        DateRow(stringResource(R.string.ac_new_meter_from), date, { date = it }, pastOnly = true)
        Field(stringResource(R.string.ac_old_reading), old, { old = it }, number = true)
        Field(stringResource(R.string.ac_new_reading), new, { new = it }, number = true)
        Field(stringResource(R.string.maint_notes), notes, { notes = it })
        DButton(stringResource(R.string.save), {
            val id = newId()
            recs.change("meterReset.create", "meter_reset", id, "Meter replaced", json("id" to id, "meter" to if (meter == 1) "hobbs" else "tach", "date" to date, "prior" to num(old), "next" to (num(new) ?: 0.0), "notes" to notes.trim().ifEmpty { null }))
            onDone()
        }, enabled = date != null && num(new) != null)
    }
}

// --- Equipment (M-AIRCRAFT-03) --------------------------------------------------------------------------

@Composable
fun EquipmentScreen(recs: Recs) {
    val nav = LocalRecNav.current
    val scope = rememberCoroutineScope()
    val sync by recs.store.sync.collectAsStateWithLifecycleCompat()
    val all = recs.watch { recs.store.records("component", recs.id) }
    val proposals = recs.watch { recs.store.records("equipment_proposal", recs.id) }
    val ads = recs.watch { recs.store.records("ad_compliance", recs.id) }
    var scanning by remember { mutableStateOf(false) }
    Board(stringResource(R.string.ac_equipment), Section.Aircraft, back = stringResource(R.string.section_aircraft) to nav.back, toast = recs.toast, onToastDone = { recs.toast = null }) {
        if (proposals.isNotEmpty()) {
            GroupHeader(stringResource(R.string.ac_found_in_logbooks), count = proposals.size.toString())
            proposals.forEach { p ->
                RecRow(p.s("name") ?: "", listOf(listOfNotNull(p.s("make"), p.s("part_number"), p.s("install_date")?.take(4)).joinToString(" · ")), p, below = {
                    TrustMark(TrustLevel.AiRead, stringResource(R.string.trust_ai))
                    if (recs.canEdit) ButtonPair(stringResource(R.string.ac_not_on_aircraft), {
                        recs.change("proposals.dismiss", "equipment_proposal", p.id, "Not on this aircraft: ${p.s("name")}", json("proposalIds" to JsonArray(listOf(JsonPrimitive(p.id)))))
                    }, stringResource(R.string.ac_add_to_equipment), {
                        recs.change("proposals.confirm", "equipment_proposal", p.id, "Add to equipment: ${p.s("name")}", json("proposalIds" to JsonArray(listOf(JsonPrimitive(p.id)))))
                    })
                })
            }
        }
        val installed = all.filter { it.b("is_installed") }.sortedBy { it.s("name") }
        val removed = all.filter { !it.b("is_installed") }.sortedByDescending { it.s("removal_date") }
        Note("Aircraft details can come from your logbooks: open a page in Logbooks, choose Review, then find and accept its details. You do not need to enter them again.")
        GroupHeader(stringResource(R.string.ac_installed), count = installed.size.toString())
        if (installed.isEmpty()) Note(stringResource(R.string.ac_no_equipment), Modifier.padding(vertical = Tokens.Space.s2))
        installed.forEach { comp ->
            val linked = ads.count { it.s("component_id") == comp.id }
            RecRow(comp.s("name") ?: "", listOf(listOfNotNull(comp.s("part_number"), comp.s("install_date")?.take(4), linked.takeIf { it > 0 }?.let { "$it AD${if (it > 1) "s" else ""}" }).joinToString(" · ")), comp,
                onClick = if (recs.canEdit) ({ nav.open(Routes.of(Routes.COMPONENT, comp.id)) }) else null, trailing = { if (recs.canEdit) Chevron() })
        }
        if (removed.isNotEmpty()) {
            GroupHeader("Historical or removed equipment", count = removed.size.toString())
            removed.forEach { comp ->
                RecRow(comp.s("name") ?: "", listOf(if (comp.b("identity_historical")) "Historical record · current installation not confirmed" else "removed ${comp.s("removal_date")?.take(4) ?: ""}"), comp, below = {
                    if (recs.canEdit) DButton(stringResource(R.string.ac_reinstalled), {
                        recs.change("component.reinstall", "component", comp.id, "Reinstalled ${comp.s("name")}", json("componentId" to comp.id))
                    }, kind = ButtonKind.Quiet)
                })
            }
        }
        if (recs.canEdit) {
            DButton(stringResource(R.string.ac_record_installation), { nav.open(Routes.of(Routes.COMPONENT, "new")) }, kind = ButtonKind.Secondary, modifier = Modifier.padding(top = Tokens.Space.s4))
            DButton(stringResource(R.string.ac_find_equipment), {
                scanning = true
                scope.launch {
                    recs.toast = try { val n = recs.api.scanEquipment(recs.id); recs.kick(); Toast(recs.str(R.string.ac_found_n).format(n)) } catch (e: CancellationException) { throw e } catch (e: Exception) { Toast(e.message ?: recs.str(R.string.rec_needs_signal_reading)) }
                    scanning = false
                }
            }, kind = ButtonKind.Quiet, enabled = sync.online && !scanning, busyText = if (scanning) stringResource(R.string.maint_scanning) else null)
            if (!sync.online) Note(stringResource(R.string.rec_needs_signal_reading))
        }
    }
}

@Composable
fun ComponentEditor(recs: Recs, id: String) {
    val nav = LocalRecNav.current
    val c0 = remember(id) { recs.store.records("component", recs.id).firstOrNull { it.id == id } }
    var name by rememberSaveable { mutableStateOf(c0?.s("name") ?: "") }
    var make by rememberSaveable { mutableStateOf(c0?.s("make") ?: "") }
    var category by rememberSaveable { mutableStateOf(c0?.s("category") ?: "") }
    var componentModel by rememberSaveable { mutableStateOf(c0?.s("model") ?: "") }
    var componentKind by rememberSaveable { mutableStateOf(c0?.s("component_kind") ?: "") }
    var pn by rememberSaveable { mutableStateOf(c0?.s("part_number") ?: "") }
    var sn by rememberSaveable { mutableStateOf(c0?.s("serial_number") ?: "") }
    var installed by rememberSaveable { mutableStateOf(c0?.s("install_date")) }
    var entry by rememberSaveable { mutableStateOf(c0?.s("install_entry_id")) }
    var life by rememberSaveable { mutableStateOf(fmtNum(c0?.d("life_limit_value"))) }
    var unit by rememberSaveable { mutableStateOf(c0?.s("life_limit_unit") ?: "hours") }
    var notes by rememberSaveable { mutableStateOf(c0?.s("notes") ?: "") }
    var removing by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    Board(c0?.s("name") ?: stringResource(R.string.ac_record_installation), Section.Aircraft, back = stringResource(R.string.ac_equipment) to nav.back, footer = {
        DButton(stringResource(R.string.save), {
            val comp = json(
                "name" to name.trim(), "make" to make.trim().ifEmpty { null }, "model" to componentModel.trim().ifEmpty { null }, "category" to category.trim().ifEmpty { null }, "component_kind" to componentKind.ifEmpty { null }, "part_number" to pn.trim().ifEmpty { null },
                "serial_number" to sn.trim().ifEmpty { null }, "install_date" to installed, "install_entry_id" to entry, "life_limit_value" to num(life),
                "life_limit_unit" to (if (num(life) != null) unit else null), "notes" to notes.trim().ifEmpty { null },
            )
            val onServer = c0 != null && recs.store.mirror.raw("component", id) != null
            recs.change("component.upsert", "component", c0?.id ?: newId(), name.trim(), if (onServer) json("id" to id, "component" to comp) else json("component" to comp))
            nav.back()
        }, enabled = name.isNotBlank())
    }) {
        Field(stringResource(R.string.maint_name), name, { name = it })
        Field(stringResource(R.string.ac_manufacturer), make, { make = it })
        Field("Model", componentModel, { componentModel = it })
        Field(stringResource(R.string.ac_type), category, { category = it })
        Choice("This record represents", listOf("" to "Not classified", "engine" to "Complete engine", "propeller" to "Complete propeller", "accessory" to "Accessory or engine part", "equipment" to "Other equipment"), componentKind) { componentKind = it }
        Field(stringResource(R.string.ac_part_number), pn, { pn = it })
        Field(stringResource(R.string.ac_serial_number), sn, { sn = it })
        DateRow(stringResource(R.string.ac_installed_on), installed, { installed = it }, pastOnly = true, clearable = true)
        EntryChoice(recs, stringResource(R.string.ac_entry_records), entry, allowNone = stringResource(R.string.maint_not_in_logbook)) { entry = it }
        Row(horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s2), verticalAlignment = Alignment.CenterVertically) {
            Field(stringResource(R.string.ac_life_limit), life, { life = it }, Modifier.weight(1f), number = true)
            Column(Modifier.weight(1f)) { Choice(stringResource(R.string.ac_unit), listOf("hours" to "Hours", "months" to "Months", "cycles" to "Cycles"), unit) { unit = it } }
        }
        Field(stringResource(R.string.maint_notes), notes, { notes = it }, lines = 2)
        if (c0 != null && c0.b("is_installed")) DButton(stringResource(R.string.ac_removed_from), { removing = true }, kind = ButtonKind.Secondary, modifier = Modifier.padding(top = Tokens.Space.s3))
        if (c0 != null) DButton(stringResource(R.string.ac_delete_never), { deleting = true }, kind = ButtonKind.Quiet)
    }
    if (removing && c0 != null) {
        var date by rememberSaveable { mutableStateOf<String?>(LocalDate.now().toString()) }
        var rEntry by rememberSaveable { mutableStateOf<String?>(null) }
        Sheet(stringResource(R.string.ac_removed_from), { removing = false }) {
            DateRow(stringResource(R.string.rec_date), date, { date = it }, pastOnly = true)
            EntryChoice(recs, stringResource(R.string.ac_entry_records), rEntry, allowNone = stringResource(R.string.maint_not_in_logbook)) { rEntry = it }
            Note(stringResource(R.string.ac_removed_note))
            DButton(stringResource(R.string.ac_mark_removed), {
                recs.change("component.remove", "component", id, "Removed ${c0.s("name")}", json("componentId" to id, "date" to date, "entryId" to rEntry))
                removing = false; nav.back()
            }, enabled = date != null)
        }
    }
    if (deleting && c0 != null) Confirm(stringResource(R.string.ac_delete_component, c0.s("name") ?: ""), stringResource(R.string.ac_delete_component_body), stringResource(R.string.rec_delete), {
        recs.delete("component.delete", "component", id, "Delete ${c0.s("name")}", json("componentId" to id))
        nav.back()
    }, { deleting = false })
}

// --- Weight and balance (M-AIRCRAFT-04) ------------------------------------------------------------------

@Composable
fun WeightBalanceScreen(recs: Recs) {
    val nav = LocalRecNav.current
    val revs = recs.watch { recs.store.records("weight_balance", recs.id).sortedByDescending { it.s("revision_date") } }
    val components = recs.watch { recs.store.records("component", recs.id) }
    var editing by remember { mutableStateOf<Rec?>(null) }
    var adding by remember { mutableStateOf(false) }
    Board(stringResource(R.string.ac_wb), Section.Aircraft, back = stringResource(R.string.section_aircraft) to nav.back) {
        val cur = revs.firstOrNull()
        if (cur == null) Empty(stringResource(R.string.ac_wb_none), if (recs.canEdit) stringResource(R.string.ac_add_revision) else null) { adding = true }
        cur?.let { r ->
            GroupHeader(stringResource(R.string.ac_wb_current), count = r.s("revision_date")?.let(::longDate))
            val m = moment(r.d("empty_weight"), r.d("empty_weight_arm"), r.d("empty_weight_moment"))
            WbLine(stringResource(R.string.ac_empty_weight), "${fmt2(r.d("empty_weight"))} lb")
            WbLine(stringResource(R.string.ac_arm), "${fmt3(r.d("empty_weight_arm"))} in")
            WbLine(stringResource(R.string.ac_moment), fmt2(m))
            WbLine(stringResource(R.string.ac_max_gross), r.d("max_gross_weight")?.let { "${fmtNum(it)} lb" } ?: "—")
            WbLine(stringResource(R.string.ac_useful_load), r.d("max_gross_weight")?.let { g -> r.d("empty_weight")?.let { "${fmt2(g - it)} lb" } } ?: "—")
            Note(listOfNotNull(r.s("method"), r.s("reference"), r.s("reason")).joinToString(" · "), Modifier.padding(top = Tokens.Space.s2))
            PendingCaption(r)
            r.s("source_page_id")?.let { pid -> recs.store.mirror.raw("page", pid)?.s("page_sequence")?.let { PageCite("p. $it", stringResource(R.string.your_note), Section.Books, Modifier.padding(top = Tokens.Space.s2)) } }
            staleSince(r, components)?.let { Well(alarm = true) { Text(stringResource(R.string.ac_wb_stale_equipment, it), color = MyTailLogTheme.colors.onAlarmBg, style = MaterialTheme.typography.bodyMedium) } }
            if (recs.canEdit) DButton(stringResource(R.string.maint_edit), { editing = r }, kind = ButtonKind.Quiet)
        }
        if (revs.size > 1) {
            GroupHeader(stringResource(R.string.ac_earlier_revisions))
            revs.drop(1).forEach { r ->
                RecRow("${r.s("revision_date")?.take(4)} ${r.s("method") ?: ""} ${fmt2(r.d("empty_weight"))} lb", listOfNotNull(r.s("reason")), r, onClick = if (recs.canEdit) ({ editing = r }) else null)
            }
        }
        if (recs.canEdit && cur != null) DButton(stringResource(R.string.ac_add_revision), { adding = true }, kind = ButtonKind.Secondary, modifier = Modifier.padding(top = Tokens.Space.s4))
    }
    if (adding) WbForm(recs, null) { adding = false }
    editing?.let { WbForm(recs, it) { editing = null } }
}

@Composable
private fun WbLine(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Lede(label, Modifier.weight(1f))
        Text(value, color = MyTailLogTheme.colors.ink, style = MaterialTheme.typography.bodyLarge.merge(tabular).copy(fontWeight = FontWeight(700)), textAlign = TextAlign.End)
    }
}

@Composable
private fun WbForm(recs: Recs, r: Rec?, onDone: () -> Unit) {
    var date by rememberSaveable { mutableStateOf(r?.s("revision_date") ?: LocalDate.now().toString()) }
    var weight by rememberSaveable { mutableStateOf(fmtNum(r?.d("empty_weight"))) }
    var arm by rememberSaveable { mutableStateOf(fmtNum(r?.d("empty_weight_arm"))) }
    var gross by rememberSaveable { mutableStateOf(fmtNum(r?.d("max_gross_weight"))) }
    var method by rememberSaveable { mutableStateOf(r?.s("method") ?: "weighed") }
    var reason by rememberSaveable { mutableStateOf(r?.s("reason") ?: "") }
    var deleting by remember { mutableStateOf(false) }
    Sheet(if (r == null) stringResource(R.string.ac_add_revision) else stringResource(R.string.ac_wb_revision), onDone, full = true) {
        DateRow(stringResource(R.string.rec_date), date, { date = it ?: date }, pastOnly = true)
        Field(stringResource(R.string.ac_empty_weight_lb), weight, { weight = it }, number = true)
        Field(stringResource(R.string.ac_arm_in), arm, { arm = it }, number = true)
        Note(stringResource(R.string.ac_moment_computed, fmt2(moment(num(weight), num(arm), null))))
        Field(stringResource(R.string.ac_max_gross_lb), gross, { gross = it }, number = true)
        Segmented(listOf(stringResource(R.string.ac_weighed), stringResource(R.string.ac_computed)), if (method == "computed") 1 else 0) { method = if (it == 1) "computed" else "weighed" }
        Field(stringResource(R.string.ac_reason), reason, { reason = it })
        DButton(stringResource(R.string.save), {
            val fields = json("revision_date" to date, "empty_weight" to num(weight), "empty_weight_arm" to num(arm), "empty_weight_moment" to moment(num(weight), num(arm), null),
                "max_gross_weight" to num(gross), "method" to method, "reason" to reason.trim().ifEmpty { null }, "reference" to r?.s("reference"), "notes" to r?.s("notes"), "source_page_id" to r?.s("source_page_id"))
            val onServer = r != null && recs.store.mirror.raw("weight_balance", r.id) != null
            recs.change("wb.upsert", "weight_balance", r?.id ?: newId(), "Weight and balance $date", if (onServer) json("id" to r.id, "fields" to fields) else json("fields" to fields))
            onDone()
        }, enabled = num(weight) != null)
        if (r != null) DButton(stringResource(R.string.rec_delete), { deleting = true }, kind = ButtonKind.Quiet)
    }
    if (deleting && r != null) Confirm(stringResource(R.string.ac_delete_revision), null, stringResource(R.string.rec_delete), {
        recs.delete("wb.delete", "weight_balance", r.id, "Delete W&B revision", json("wbId" to r.id)); onDone()
    }, { deleting = false })
}

// --- Oil and engine (M-AIRCRAFT-05) ----------------------------------------------------------------------

private val ELEMENTS = listOf("Fe", "Cu", "Al", "Cr", "Ni", "Pb", "Si")

@Composable
fun OilScreen(recs: Recs) {
    val nav = LocalRecNav.current
    val adds = recs.watch { recs.store.records("oil_addition", recs.id).sortedByDescending { it.s("added_date") } }
    val samples = recs.watch { recs.store.records("oil_analysis_sample", recs.id).sortedByDescending { it.s("sample_date") } }
    var deleting by remember { mutableStateOf<Rec?>(null) }
    var adding by remember { mutableStateOf(false) }
    Board(stringResource(R.string.ac_oil), Section.Aircraft, back = stringResource(R.string.section_aircraft) to nav.back, toast = recs.toast, onToastDone = { recs.toast = null }) {
        Note("Consumption and compression trends are grouped by engine and lifecycle period in Engine history.")
        DButton("Open engine history", { nav.open(Routes.ENGINE_HISTORY) }, kind = ButtonKind.Secondary)
        if (recs.canEdit) DButton(stringResource(R.string.add_oil), { adding = true }, kind = ButtonKind.Secondary, icon = LucideIcons.Droplet, modifier = Modifier.padding(top = Tokens.Space.s2))
        GroupHeader(stringResource(R.string.ac_oil_added), count = adds.size.toString())
        adds.forEach { o ->
            RecRow("${fmtNum(o.d("quarts"))} qt", listOf(listOfNotNull(o.s("added_date")?.let(::longDate), o.d("tach")?.let { "tach ${fmt1(it)}" }, o.s("notes")).joinToString(" · ")), o,
                menu = if (recs.canEdit) listOf(stringResource(R.string.rec_delete) to { deleting = o }) else emptyList())
        }
        GroupHeader(stringResource(R.string.ac_lab))
        if (recs.canEdit) DButton("Import oil report", { nav.open(Routes.DOCUMENT_INBOX) }, kind = ButtonKind.Secondary)
        if (samples.isEmpty()) Note(stringResource(R.string.ac_no_samples), Modifier.padding(vertical = Tokens.Space.s2))
        else LabTable(samples.take(4))
    }
    deleting?.let { o ->
        Confirm(stringResource(R.string.ac_delete_oil, fmtNum(o.d("quarts")), o.s("added_date")?.let(::dayDate) ?: ""), null, stringResource(R.string.rec_delete), {
            recs.delete("oil.delete", "oil_addition", o.id, "Delete oil top-off", json("additionId" to o.id))
        }, { deleting = null })
    }
    if (adding) AddOilSheet(recs) { adding = false }
}

@Composable
private fun LabTable(samples: List<Rec>) {
    val c = MyTailLogTheme.colors
    val style = MaterialTheme.typography.bodyMedium.merge(tabular)
    Row(Modifier.fillMaxWidth().padding(top = Tokens.Space.s2)) {
        Text("", Modifier.width(44.dp))
        samples.forEach { s -> Text(s.s("sample_date")?.let(::dayDate) ?: "", color = c.ink3, style = style, textAlign = TextAlign.End, modifier = Modifier.weight(1f)) }
    }
    ELEMENTS.forEach { el ->
        Row(Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
            Text(el, color = c.ink, style = style.copy(fontWeight = FontWeight(700)), modifier = Modifier.width(44.dp))
            samples.forEach { s ->
                val v = (s.row["elements_ppm"] as? JsonObject)?.get(el)?.jsonPrimitive?.contentOrNull
                Text(v ?: "—", color = c.ink, style = style, textAlign = TextAlign.End, modifier = Modifier.weight(1f))
            }
        }
    }
    samples.firstOrNull()?.s("lab_comments")?.let { Note(it, Modifier.padding(top = Tokens.Space.s2)) }
}

/** M-FLIGHT-05 Add oil: quarts, date, an optional tach, notes. Saves without creating a reading. */
@Composable
fun AddOilSheet(recs: Recs, initialComponentId: String? = null, onDone: () -> Unit) {
    val engines = recs.watch { recs.store.records("component", recs.id).filter { com.mytaillog.core.domain.isCompleteEngine(it.s("name").orEmpty(), it.s("category"), it.s("component_kind"), it.s("model")) } }
    var componentId by rememberSaveable { mutableStateOf(initialComponentId ?: engines.filter { it.b("is_installed") }.singleOrNull()?.id) }
    var q by rememberSaveable { mutableStateOf(1) }
    var other by rememberSaveable { mutableStateOf("") }
    var date by rememberSaveable { mutableStateOf<String?>(LocalDate.now().toString()) }
    var withTach by rememberSaveable { mutableStateOf(false) }
    var tach by rememberSaveable { mutableStateOf(fmt1(recs.meter("tach"))) }
    var notes by rememberSaveable { mutableStateOf("") }
    val quarts = when (q) { 0 -> 0.5; 1 -> 1.0; 2 -> 2.0; else -> num(other) }
    Sheet(stringResource(R.string.add_oil), onDone) {
        if (engines.isNotEmpty()) Choice("Engine", listOf("" to "Unassigned") + engines.map { it.id to (it.s("name") ?: it.id) }, componentId ?: "") { componentId = it.ifEmpty { null } }
        Note(stringResource(R.string.ac_quarts))
        Segmented(listOf("½", "1", "2", stringResource(R.string.ac_other)), q) { q = it }
        if (q == 3) Field(stringResource(R.string.ac_quarts), other, { other = it }, number = true, placeholder = "0.5")
        DateRow(stringResource(R.string.rec_date), date, { date = it }, pastOnly = true)
        if (withTach) Field(stringResource(R.string.tach_label), tach, { tach = it }, number = true)
        else DButton(stringResource(R.string.ac_add_tach), { withTach = true }, kind = ButtonKind.Quiet)
        Field(stringResource(R.string.maint_notes), notes, { notes = it }, placeholder = "Phillips XC 20W-50")
        DButton(stringResource(R.string.add_oil), {
            val id = newId()
            recs.change("oil.create", "oil_addition", id, "Oil, ${fmtNum(quarts)} qt", json("id" to id, "date" to date, "quarts" to quarts, "componentId" to componentId, "tach" to (if (withTach) num(tach) else null), "notes" to notes.trim().ifEmpty { null }))
            recs.toast = Toast("${fmtNum(quarts)} qt added. " + if (recs.online) recs.str(R.string.rec_saved) else recs.str(R.string.rec_saved_on_phone))
            onDone()
        }, enabled = quarts != null && quarts > 0 && date != null, icon = LucideIcons.Droplet)
    }
}

// --- Details (M-AIRCRAFT-06) --------------------------------------------------------------------------------

@Composable
fun DetailsScreen(recs: Recs) {
    val nav = LocalRecNav.current
    val scope = rememberCoroutineScope()
    val sync by recs.store.sync.collectAsStateWithLifecycleCompat()
    val a = remember { recs.store.mirror.raw("aircraft", recs.id) }
    fun list(k: String) = (a?.get(k) as? JsonArray)?.joinToString(", ") { it.jsonPrimitive.content } ?: ""
    var make by rememberSaveable { mutableStateOf(a?.s("make") ?: "") }
    var model by rememberSaveable { mutableStateOf(a?.s("model") ?: "") }
    var year by rememberSaveable { mutableStateOf(a?.s("year") ?: "") }
    var serial by rememberSaveable { mutableStateOf(a?.s("serial_number") ?: "") }
    var engines by rememberSaveable { mutableStateOf(list("engine_serials")) }
    var props by rememberSaveable { mutableStateOf(list("prop_serials")) }
    var base by rememberSaveable { mutableStateOf(a?.s("home_base") ?: "") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val editable = recs.isOwner
    Board(stringResource(R.string.ac_details), Section.Aircraft, back = stringResource(R.string.section_aircraft) to nav.back, toast = recs.toast, onToastDone = { recs.toast = null }, footer = if (!editable) null else ({
        DButton(stringResource(R.string.save), {
            busy = true; error = null
            scope.launch {
                try {
                    fun arr(s: String) = JsonArray(s.split(',').map { it.trim() }.filter { it.isNotEmpty() }.map(::JsonPrimitive))
                    recs.api.saveDetails(recs.id, json("make" to make.trim().ifEmpty { null }, "model" to model.trim().ifEmpty { null }, "year" to year.toIntOrNull(), "serial_number" to serial.trim().ifEmpty { null },
                        "engine_serials" to arr(engines), "prop_serials" to arr(props), "home_base" to base.trim().ifEmpty { null }))
                    recs.kick(); recs.toast = Toast(recs.str(R.string.rec_saved))
                } catch (e: CancellationException) { throw e } catch (e: Exception) { error = e.message } finally { busy = false }
            }
        }, enabled = sync.online && !busy && (year.isEmpty() || year.toIntOrNull() != null), busyText = if (busy) stringResource(R.string.saving) else null)
        if (!sync.online) Note(stringResource(R.string.ac_details_offline))
    })) {
        Field(stringResource(R.string.ac_make), make, { if (editable) make = it })
        Field(stringResource(R.string.ac_model), model, { if (editable) model = it })
        Field(stringResource(R.string.ac_year), year, { if (editable) year = it.filter(Char::isDigit).take(4) }, number = true)
        Field(stringResource(R.string.ac_serial_number), serial, { if (editable) serial = it })
        Field(stringResource(R.string.ac_engine_serials), engines, { if (editable) engines = it })
        Field(stringResource(R.string.ac_prop_serials), props, { if (editable) props = it })
        Field(stringResource(R.string.ac_home_base), base, { if (editable) base = it })
        error?.let { Note(it, alarm = true) }
        if (!editable) Note(stringResource(R.string.ac_owner_only))
        Note(stringResource(R.string.ac_danger_on_web), Modifier.padding(top = Tokens.Space.s4))
    }
}

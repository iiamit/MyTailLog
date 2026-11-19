package com.mytaillog.app

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import com.mytaillog.core.domain.due.DueItem
import com.mytaillog.core.domain.due.PlanResult
import com.mytaillog.core.domain.due.StatusBody
import com.mytaillog.core.domain.due.VisitView
import com.mytaillog.core.domain.due.planDate
import com.mytaillog.design.ButtonKind
import com.mytaillog.design.DButton
import com.mytaillog.design.GroupHeader
import com.mytaillog.design.LineChip
import com.mytaillog.design.LucideIcons
import com.mytaillog.design.MarkKind
import com.mytaillog.design.MyTailLogTheme
import com.mytaillog.design.Section
import com.mytaillog.design.StatusMark
import com.mytaillog.design.Tokens
import com.mytaillog.design.Verdict
import com.mytaillog.design.focusRing
import com.mytaillog.design.line
import com.mytaillog.design.statusMark
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import kotlin.math.roundToInt

// Plan ahead (06 M-STATUS-03, T-STATUS-02) and one visit (M-STATUS-04). Everything is worked out on the phone
// from the snapshot with core's planDate, so it works offline; the 24-month visits come from the server when
// there is signal and fall back to the snapshot's 12 months.

/** What Plan ahead holds while it is open: the date, the hours, and the visits over its horizon. */
class PlanState(val body: StatusBody, val visits: List<VisitView>, date: String, hoursPerWeek: Double?) {
    var date by mutableStateOf(date)
    var hoursPerWeek by mutableStateOf(hoursPerWeek)
    val today: LocalDate = LocalDate.parse(body.today)
    val scale = PlanScale(today)
    private val merged get() = body.copy(visits = com.mytaillog.core.domain.due.Visits(visits.filter { it.id == null }, visits.filter { it.id != null }))
    val plan: PlanResult get() = planDate(merged, date, hoursPerWeek)
    /** Where every item lapses inside the horizon, for the rings. */
    val horizon: PlanResult get() = planDate(merged, scale.end.toString(), hoursPerWeek)
}

@Composable
fun rememberPlan(body: StatusBody, recs: Recs?, initial: String? = null): PlanState {
    var visits by remember(body) { mutableStateOf(body.visits.planned + body.visits.suggested) }
    val online = recs?.store?.sync?.collectAsStateWithLifecycleCompat()?.value?.online == true
    LaunchedEffect(body, online) {
        if (online && recs != null) runCatching { recs.api.visits(body.aircraftId) }.onSuccess { visits = it.planned + it.suggested }
    }
    var saved by rememberSaveable(body.aircraftId) { mutableStateOf(initial ?: LocalDate.parse(body.today).plusMonths(3).toString()) }
    var hours by rememberSaveable(body.aircraftId) { mutableStateOf(if (body.rate.basis == "none") null else body.rate.hoursPerWeek) }
    val state = remember(body, visits) { PlanState(body, visits, saved, hours) }
    LaunchedEffect(state.date, state.hoursPerWeek) { saved = state.date; hours = state.hoursPerWeek }
    return state
}

/** M-STATUS-03 on a phone: the controls and the results in one leaf, the visit button pinned. */
@Composable
fun PlanAheadPhone(host: StatusHost, recs: Recs?, onBack: () -> Unit, onVisit: (String) -> Unit) {
    val body = host.ui.snapshot?.body ?: return
    val s = rememberPlan(body, recs)
    var openKey by rememberSaveable { mutableStateOf<String?>(null) }
    val first = lapsedBy(s.plan).firstOrNull()?.let { coveringVisit(it.coveredByVisit, s.visits) }
    Board(
        stringResource(R.string.plan_title), Section.Status, back = stringResource(R.string.section_status) to onBack,
        footer = if (first == null) null else ({ DButton(stringResource(R.string.plan_open_visit, visitDay(first)), { onVisit(visitKey(first)) }, icon = LucideIcons.Merge) }),
    ) {
        PlanControls(s, onVisit)
        PlanResults(s, onVisit) { openKey = it }
    }
    ItemSheet(host.ui, openKey) { openKey = null }
}

/** Pace, the hours chip and the line ahead with its date scrubber (T-STATUS-02's left leaf). */
@Composable
fun PlanControls(s: PlanState, onVisit: (String) -> Unit) {
    val c = MyTailLogTheme.colors
    var editing by remember { mutableStateOf(false) }
    val p = s.plan
    Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).focusRing().clickable(role = Role.Button) { editing = true }, verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
        Text(
            s.hoursPerWeek?.let { stringResource(R.string.plan_pace, hours1(it)) } ?: stringResource(R.string.plan_pace_none),
            color = c.ink3, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f),
        )
        Text(p.hoursUntil?.let { "+${it.roundToInt()} h" } ?: stringResource(R.string.plan_set_hours), color = c.ink, style = MaterialTheme.typography.labelLarge)
        Icon(LucideIcons.ChevronsUpDown, null, tint = c.ink, modifier = Modifier.padding(start = 4.dp).size(16.dp))
    }
    PlanLine(s, onVisit)
    if (editing) HoursSheet(s) { editing = false }
}

/** The statement, what lapses and which visit covers it, close behind, and what can't be checked. */
@Composable
fun PlanResults(s: PlanState, onVisit: (String) -> Unit, onItem: (String) -> Unit) {
    val c = MyTailLogTheme.colors
    val p = s.plan
    val byKey = s.body.items.associateBy { it.key }
    val (text, bold) = planStatement(p, s.today)
    Verdict(text, listOf(bold), Modifier.padding(top = Tokens.Space.s4))
    val lapsed = lapsedBy(p)
    if (lapsed.isNotEmpty()) {
        GroupHeader(stringResource(R.string.plan_lapsed_by, dayDate(p.date, s.today)), count = stringResource(R.string.plan_covered_by))
        lapsed.forEach { l ->
            val item = byKey[l.key] ?: return@forEach
            val v = coveringVisit(l.coveredByVisit, s.visits)
            RecRow(
                item.label, onClick = { onItem(item.key) },
                below = {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        bookName(item.line)?.let { LineChip(item.line, it) }
                        Note(if (l.`when` == "already") stringResource(R.string.plan_lapsed_already) else stringResource(R.string.plan_due, l.dueDate?.let { dayDate(it, s.today) } ?: ""))
                    }
                },
                trailing = {
                    if (v != null) Text(
                        stringResource(R.string.plan_visit_link, visitDay(v)), color = c.ink, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight(700)),
                        modifier = Modifier.heightIn(min = 44.dp).focusRing().clickable(role = Role.Button) { onVisit(visitKey(v)) }.padding(vertical = Tokens.Space.s2),
                    ) else Note(stringResource(R.string.plan_no_visit))
                },
            )
        }
    }
    closeBehind(p, s.body.items, s.today)?.let { Note(it, Modifier.padding(top = Tokens.Space.s3)) }
    p.cannotCheck.forEach { x ->
        val label = byKey[x.key]?.label ?: return@forEach
        when (x.reason) {
            "no_date" -> Note(stringResource(R.string.plan_no_date, label), Modifier.padding(top = Tokens.Space.s2))
            "no_recent_flying" -> Note(stringResource(R.string.plan_no_pace, label), Modifier.padding(top = Tokens.Space.s2))
        }
    }
}

/** The hours sheet (M-STATUS-03): hours flown by the date, which sets the pace used for it. */
@Composable
private fun HoursSheet(s: PlanState, onDone: () -> Unit) {
    val days = ChronoUnit.DAYS.between(s.today, LocalDate.parse(s.date)).coerceAtLeast(1)
    var hours by remember { mutableStateOf(s.plan.hoursUntil?.roundToInt()?.toString() ?: "") }
    Sheet(stringResource(R.string.plan_hours_title, dayDate(s.date, s.today)), onDone) {
        Field(stringResource(R.string.plan_hours_field), hours, { hours = it.filter(Char::isDigit).take(4) }, number = true)
        Note(if (s.body.rate.basis == "none") stringResource(R.string.plan_pace_unknown) else stringResource(R.string.plan_pace_recent, hours1(s.body.rate.hoursPerWeek)))
        DButton(stringResource(R.string.plan_use_this), {
            s.hoursPerWeek = hours.toIntOrNull()?.let { h -> Math.round(h * 7.0 / days * 10) / 10.0 }
            onDone()
        }, enabled = hours.isNotEmpty(), modifier = Modifier.padding(top = Tokens.Space.s4))
    }
}

private val PLAN_LINES = listOf("airframe" to "Airframe", "engine" to "Engine", "propeller" to "Propeller", "avionics" to "Avionics")
private fun planRow(line: String?) = when (line) { "prop" -> 2; else -> PLAN_LINES.indexOfFirst { it.first == line } }

/**
 * LineAhead with the DateScrubber (10 §8.3): 24 months, the first six at double scale; rings where items lapse,
 * solid inside the bracket from today to the marker; suggested and booked visits as dashed caps. Drag the marker
 * (snaps to days, a tick per ring crossed); tap a cap to open its visit, anywhere else to move the marker there.
 * TalkBack hears one adjustable element that moves a week per step.
 */
@Composable
fun PlanLine(s: PlanState, onVisit: (String) -> Unit, height: androidx.compose.ui.unit.Dp = 220.dp) {
    val c = MyTailLogTheme.colors
    val measurer = rememberTextMeasurer()
    val label = MaterialTheme.typography.labelSmall.copy(color = c.ink3, fontWeight = FontWeight(600))
    val markerLabel = MaterialTheme.typography.labelMedium.copy(color = c.ink, fontWeight = FontWeight(800))
    val haptics = LocalHapticFeedback.current
    val byKey = remember(s.body) { s.body.items.associateBy { it.key } }
    val rings = remember(s.horizon) {
        lapsedBy(s.horizon).mapNotNull { l -> byKey[l.key]?.let { i -> Triple(i, LocalDate.parse(if (l.`when` == "already") s.body.today else l.dueDate ?: return@mapNotNull null), planRow(i.line)) } }.filter { it.third >= 0 }
    }
    val marker = LocalDate.parse(s.date)
    val p = s.plan
    val count = lapsedBy(p).size
    var lastCount by remember { mutableStateOf(count) }
    LaunchedEffect(count) { if (count != lastCount) { haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove); lastCount = count } }
    val weeks = (ChronoUnit.DAYS.between(s.today, s.scale.end) / 7).toFloat()
    val spoken = stringResource(R.string.plan_line_spoken, longDate(s.date), if (count == 0) stringResource(R.string.plan_nothing_lapses) else pluralLapse(count))
    Canvas(
        Modifier.fillMaxWidth().height(height).padding(top = Tokens.Space.s3)
            .semantics {
                contentDescription = spoken
                progressBarRangeInfo = ProgressBarRangeInfo(ChronoUnit.DAYS.between(s.today, marker) / 7f, 0f..weeks, weeks.toInt() - 1)
                setProgress { v -> s.date = minOf(s.today.plusWeeks(v.roundToInt().coerceAtLeast(1).toLong()), s.scale.end).toString(); true }
            }
            .pointerInput(s) {
                val pad = 12.dp.toPx()
                detectHorizontalDragGestures { change, _ -> change.consume(); s.date = s.scale.date((change.position.x - pad) / (size.width - 2 * pad)).toString() }
            }
            .pointerInput(s, s.visits) {
                val pad = 12.dp.toPx()
                detectTapGestures { pos ->
                    val w = size.width - 2 * pad
                    val hit = s.visits.firstOrNull { v -> kotlin.math.abs(pad + s.scale.x(LocalDate.parse(v.weekOf)) * w - pos.x) < 16.dp.toPx() }
                    if (hit != null && pos.y < size.height - 36.dp.toPx()) onVisit(visitKey(hit))
                    else s.date = s.scale.date((pos.x - pad) / w).toString()
                }
            },
    ) {
        val pad = 12.dp.toPx()
        val w = size.width - 2 * pad
        fun x(d: LocalDate) = pad + s.scale.x(d) * w
        val top = 44.dp.toPx()
        val gap = 32.dp.toPx()
        val bottom = top + (PLAN_LINES.size - 1) * gap
        val mx = x(marker)
        // The win bracket: today to the marker.
        drawRect(c.leaf2, Offset(pad, top - 14.dp.toPx()), Size(mx - pad, bottom - top + 28.dp.toPx()))
        val stroke = Tokens.Map.lineStrokeThin.toPx()
        val dots = PathEffect.dashPathEffect(floatArrayOf(0.1f, Tokens.Map.futureDotSpacing.toPx() / 2))
        PLAN_LINES.forEachIndexed { i, (line, name) ->
            val y = top + i * gap
            drawText(measurer, name, Offset(pad, y - 18.dp.toPx()), label)
            drawLine(c.line(line), Offset(pad, y), Offset(pad + w, y), stroke, StrokeCap.Round, dots)
        }
        // Visit caps: dashed, spanning the lines their items sit on.
        s.visits.forEach { v ->
            val rows = v.items.mapNotNull { byKey[it.key]?.line }.map(::planRow).filter { it >= 0 }
            if (rows.isEmpty()) return@forEach
            val vx = x(LocalDate.parse(v.weekOf))
            val y0 = top + rows.min() * gap - 10.dp.toPx()
            val y1 = top + rows.max() * gap + 10.dp.toPx()
            drawRoundRect(c.ink2, Offset(vx - 7.dp.toPx(), y0), Size(14.dp.toPx(), y1 - y0), CornerRadius(7.dp.toPx()), style = Stroke(1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 3.dp.toPx()))))
        }
        val r = Tokens.Map.ringRadius.toPx()
        rings.forEach { (item, date, row) ->
            val kind = if (!date.isAfter(marker)) MarkKind.Overdue else markKind(item.status)
            statusMark(kind, Offset(x(date).coerceIn(pad + r, pad + w - r), top + row * gap), r, c, Tokens.Map.ringStroke.toPx())
        }
        // The marker and its handle, with its date.
        drawLine(c.ink, Offset(mx, top - 22.dp.toPx()), Offset(mx, bottom + 14.dp.toPx()), 2.dp.toPx())
        drawCircle(c.ink, 8.dp.toPx(), Offset(mx, bottom + 14.dp.toPx()))
        val m = measurer.measure(dayDate(s.date, s.today), markerLabel)
        drawText(m, topLeft = Offset((mx - m.size.width / 2).coerceIn(0f, size.width - m.size.width), top - 40.dp.toPx()))
        s.scale.ticks().forEachIndexed { i, (tx, text) ->
            val t = measurer.measure(text, label)
            val left = when (i) { 0 -> pad; s.scale.ticks().lastIndex -> pad + w - t.size.width; else -> pad + tx * w - t.size.width / 2 }
            drawText(t, topLeft = Offset(left, bottom + 28.dp.toPx()))
        }
    }
}

@Composable
private fun pluralLapse(n: Int) = androidx.compose.ui.res.pluralStringResource(R.plurals.plan_items_lapse, n, word(n).replaceFirstChar { it.uppercase() })

// --- One visit (M-STATUS-04) -----------------------------------------------------------------------------

/**
 * A suggested or booked visit: what rides along, who did each last and on which page; book it, change or cancel a
 * booking, or send the list to the shop. Viewers read only.
 */
@Composable
fun VisitScreen(host: StatusHost, recs: Recs?, key: String, back: Pair<String, () -> Unit>?) {
    val body = host.ui.snapshot?.body ?: return
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var extra by remember { mutableStateOf(emptyList<VisitView>()) }
    var booked by remember { mutableStateOf<VisitView?>(null) }
    var toast by remember { mutableStateOf<Toast?>(null) }
    var booking by remember { mutableStateOf(false) }
    var cancelling by remember { mutableStateOf(false) }
    var sending by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var openKey by rememberSaveable { mutableStateOf<String?>(null) }
    val online = recs?.store?.sync?.collectAsStateWithLifecycleCompat()?.value?.online == true
    LaunchedEffect(online) { if (online && recs != null) runCatching { recs.api.visits(body.aircraftId) }.onSuccess { extra = it.planned + it.suggested } }
    // After booking, follow the new visit once the server knows it; until then show what was booked here.
    val v = booked?.let { b -> findVisit(body, extra, b.id!!) ?: b } ?: findVisit(body, extra, key)
    val title = v?.let { stringResource(R.string.visit_title, dayDate(it.weekOf)) } ?: stringResource(R.string.visit_title_none)
    val providers = recs?.watch { recs.store.records("service_provider", recs.id) }.orEmpty()
    val shop = v?.providerIds?.firstOrNull()?.let { id -> providers.firstOrNull { it.id == id }?.s("name") }
    val canEdit = recs?.canEdit == true
    val planned = v != null && v.id != null && v.status == "planned"
    Board(
        title, Section.Status, back = back, toast = toast, onToastDone = { toast = null },
        footer = if (v == null || !canEdit) null else ({
            when {
                v.id == null -> DButton(stringResource(R.string.visit_book), { booking = true })
                planned -> {
                    DButton(
                        shop?.let { stringResource(R.string.visit_send_to, it) } ?: stringResource(R.string.visit_send), {
                            sending = true; error = null
                            scope.launch {
                                try {
                                    val r = recs!!.api.sendVisit(recs.id, v.id!!, shop ?: "Shop", v.providerIds.firstOrNull())
                                    val text = visitMessage(recs.tail, null, v, body.items, r.s("url") ?: "")
                                    val to = r.s("mailto")?.removePrefix("mailto:")?.substringBefore('?')?.takeIf { it.contains('@') }
                                    val send = android.content.Intent(android.content.Intent.ACTION_SEND).setType("text/plain")
                                        .putExtra(android.content.Intent.EXTRA_SUBJECT, context.getString(R.string.visit_send_subject, recs.tail, longDate(v.weekOf)))
                                        .putExtra(android.content.Intent.EXTRA_TEXT, text)
                                    to?.let { send.putExtra(android.content.Intent.EXTRA_EMAIL, arrayOf(java.net.URLDecoder.decode(it, "UTF-8"))) }
                                    context.startActivity(android.content.Intent.createChooser(send, null))
                                } catch (e: CancellationException) { throw e } catch (e: Exception) { error = e.message } finally { sending = false }
                            }
                        }, kind = ButtonKind.Secondary, icon = LucideIcons.Send, enabled = online && !sending,
                        busyText = if (sending) stringResource(R.string.visit_sending) else null,
                    )
                    if (!online) Note(stringResource(R.string.visit_send_offline))
                    ButtonPair(stringResource(R.string.visit_cancel), { cancelling = true }, stringResource(R.string.visit_change), { booking = true })
                }
                else -> Unit
            }
        }),
    ) {
        if (v == null) { Empty(stringResource(R.string.visit_gone)); return@Board }
        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            Lede(visitStatement(v, body.items), Modifier.weight(1f))
            StatusMark(if (v.id == null) MarkKind.Neutral else MarkKind.Current, visitStatusWord(if (v.id == null) "suggested" else v.status), compact = true)
        }
        shop?.let { Note(stringResource(R.string.visit_at, it), Modifier.padding(top = Tokens.Space.s2)) }
        GroupHeader(stringResource(R.string.visit_in_this), count = v.items.count { !it.done }.toString())
        val byKey = body.items.associateBy { it.key }
        v.items.filter { !it.done }.forEach { vi ->
            val item = byKey[vi.key] ?: return@forEach
            DueRow(item, body.today, onClick = { openKey = item.key })
            item.lastDone?.let { d -> lastDoneLine(item, d.signer, d.date)?.let { Note(it, Modifier.padding(bottom = Tokens.Space.s2)) } }
        }
        error?.let { Note(it, Modifier.padding(top = Tokens.Space.s2), alarm = true) }
        if (!canEdit && v.id == null) Note(stringResource(R.string.visit_viewer), Modifier.padding(top = Tokens.Space.s3))
    }
    ItemSheet(host.ui, openKey) { openKey = null }
    if (booking && v != null && recs != null) BookSheet(recs, v, body.items, providers, onDone = { booking = false }) { made ->
        booked = made
        toast = Toast(recs.str(if (recs.online) R.string.visit_booked else R.string.visit_booked_offline))
    }
    if (cancelling && v?.id != null && recs != null) Confirm(
        stringResource(R.string.visit_cancel_title, dayDate(v.weekOf)), stringResource(R.string.visit_cancel_body), stringResource(R.string.visit_cancel), {
            recs.change("visit.setStatus", "planned_visit", v.id!!, "Cancel the visit of ${dayDate(v.weekOf)}", json("visitId" to v.id, "status" to "cancelled"))
            booked = v.copy(status = "cancelled")
            toast = Toast(recs.str(R.string.visit_cancelled))
        }, { cancelling = false }, keep = stringResource(R.string.visit_keep),
    )
}

/** "AeroCheck Instruments did it last, on Dec 3, 2024." */
private fun lastDoneLine(item: DueItem, signer: String?, date: String?): String? = when {
    signer != null && date != null -> "$signer did it last, on ${longDate(date)}."
    date != null -> "Last done ${longDate(date)}."
    else -> null
}

/** Book this visit / Change (M-STATUS-04): which week, where, then visit.create or visit.update (both queue offline). */
@Composable
private fun BookSheet(recs: Recs, v: VisitView, items: List<DueItem>, providers: List<Rec>, onDone: () -> Unit, onBooked: (VisitView) -> Unit) {
    val byKey = items.associateBy { it.key }
    val defaultShop = v.providerIds.firstOrNull() ?: v.items.firstNotNullOfOrNull { byKey[it.key]?.providerId } ?: providers.firstOrNull { it.b("is_default") }?.id
    var week by rememberSaveable { mutableStateOf(v.visitDate ?: v.weekOf) }
    var shop by rememberSaveable { mutableStateOf(defaultShop) }
    var name by rememberSaveable { mutableStateOf("") }
    var kind by rememberSaveable { mutableStateOf("mechanic") }
    val adding = shop == ADD_SHOP
    val change = v.id != null
    Sheet(stringResource(if (change) R.string.visit_change_title else R.string.visit_book), onDone) {
        DateRow(stringResource(R.string.visit_which_week), week, { it?.let { d -> week = d } })
        Note(stringResource(R.string.visit_week_of, longDate(mondayOf(LocalDate.parse(week)).toString())))
        Choice(
            stringResource(R.string.visit_where),
            providers.filter { it.s("deleted_at") == null }.map { it.id to (it.s("name") ?: "") } + (ADD_SHOP to stringResource(R.string.visit_add_shop)),
            shop,
        ) { shop = it }
        if (adding) {
            Field(stringResource(R.string.visit_shop_name), name, { name = it.take(120) })
            Choice(stringResource(R.string.visit_shop_kind), SHOP_KINDS.map { it to recs.str(shopKindName(it)) }, kind) { kind = it }
        }
        DButton(stringResource(if (change) R.string.visit_save else R.string.visit_book_it), {
            var providerId = shop?.takeIf { it != ADD_SHOP }
            var dep: String? = null
            if (adding) {
                providerId = newId()
                dep = recs.change("provider.upsert", "service_provider", providerId, "Add ${name.trim()}", json("id" to providerId, "fields" to json("name" to name.trim(), "kind" to kind)))
            }
            val monday = mondayOf(LocalDate.parse(week)).toString()
            val day = week.takeIf { it != monday }
            val made = if (change) {
                recs.change("visit.update", "planned_visit", v.id!!, "Change the visit of ${dayDate(v.weekOf)}", json("visitId" to v.id, "weekOf" to monday, "visitDate" to day, "providerId" to providerId), dependsOn = dep)
                v.copy(weekOf = monday, visitDate = day, providerIds = listOfNotNull(providerId))
            } else {
                val id = newId()
                recs.change(
                    "visit.create", "planned_visit", id, "Book the visit of ${dayDate(monday)}",
                    json("id" to id, "weekOf" to monday, "visitDate" to day, "providerId" to providerId, "fromSuggestionKey" to v.suggestionKey, "itemKeys" to JsonArray(v.items.filter { !it.done }.map { JsonPrimitive(it.key) })),
                    dependsOn = dep,
                )
                v.copy(id = id, status = "planned", weekOf = monday, visitDate = day, providerIds = listOfNotNull(providerId))
            }
            onBooked(made)
            onDone()
        }, enabled = !adding || name.isNotBlank(), modifier = Modifier.padding(top = Tokens.Space.s4))
    }
}

private const val ADD_SHOP = "+"
private val SHOP_KINDS = listOf("mechanic", "avionics_shop", "engine_shop", "prop_shop")
private fun shopKindName(k: String) = when (k) {
    "avionics_shop" -> R.string.shop_avionics
    "engine_shop" -> R.string.shop_engine
    "prop_shop" -> R.string.shop_prop
    else -> R.string.shop_mechanic
}

/** The visits group on Status (09 §3.5): each suggestion or booking as a row, so they are reachable without the line. */
@Composable
fun VisitRows(body: StatusBody, onVisit: (String) -> Unit, all: List<VisitView> = body.visits.planned + body.visits.suggested) {
    if (all.isEmpty()) return
    GroupHeader(stringResource(R.string.visit_group), count = all.size.toString())
    val byKey = body.items.associateBy { it.key }
    all.forEach { v ->
        RecRow(
            stringResource(R.string.visit_title, dayDate(v.weekOf)),
            listOf(v.items.filter { !it.done }.mapNotNull { byKey[it.key]?.label }.joinToString(", ")),
            onClick = { onVisit(visitKey(v)) },
            trailing = { StatusMark(if (v.id == null) MarkKind.Neutral else MarkKind.Current, visitStatusWord(if (v.id == null) "suggested" else v.status), compact = true) },
        )
    }
}

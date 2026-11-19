package com.mytaillog.app

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mytaillog.design.ButtonKind
import com.mytaillog.design.DButton
import com.mytaillog.design.GroupHeader
import com.mytaillog.design.LucideIcons
import com.mytaillog.design.MyTailLogTheme
import com.mytaillog.design.Section
import com.mytaillog.design.StatusMark
import com.mytaillog.design.Tokens
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.LocalDate

// M-FLIGHT-03 Confirm the flight and M-FLIGHT-04 Saved: tach and hobbs steppers, oil in one tap, the
// date (past only), one Save; then what the flight moved, with Undo. Everything goes through the outbox.

/**
 * MeterStepper (02): − and + 64×64 around a value typed as-is ("4214.8" stays 4214.8); tap ±0.1, hold
 * repeats every 90 ms and after 18 ticks steps by 1.0. One adjustable element for TalkBack.
 */
@Composable
fun MeterStepper(label: String, was: String?, text: String, onText: (String) -> Unit, delta: String?) {
    val c = MyTailLogTheme.colors
    val haptics = LocalHapticFeedback.current
    val scope = rememberCoroutineScope()
    val value = num(text)
    fun step(by: Double) { onText(fmt1(((value ?: 0.0) + by).coerceAtLeast(0.0))); haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove) }
    @Composable
    fun Key(icon: androidx.compose.ui.graphics.vector.ImageVector, sign: Int, spoken: String) {
        var job by remember { mutableStateOf<Job?>(null) }
        Box(
            Modifier.size(64.dp).clip(RoundedCornerShape(Tokens.Radius.m)).border(1.dp, c.controlBorder, RoundedCornerShape(Tokens.Radius.m))
                .semantics { contentDescription = spoken; role = Role.Button }
                .pointerInput(value) {
                    detectTapGestures(onPress = {
                        step(0.1 * sign)
                        job = scope.launch {
                            delay(400)
                            var n = 0
                            while (true) { n++; step(if (n > 18) 1.0 * sign else 0.1 * sign); if (n == 19) haptics.performHapticFeedback(HapticFeedbackType.LongPress); delay(90) }
                        }
                        tryAwaitRelease(); job?.cancel()
                    })
                },
            contentAlignment = Alignment.Center,
        ) { Icon(icon, null, tint = c.ink, modifier = Modifier.size(28.dp)) }
    }
    Column(Modifier.padding(vertical = Tokens.Space.s2).semantics(mergeDescendants = false) {
        customActions = listOf(CustomAccessibilityAction("Increase by 0.1") { step(0.1); true }, CustomAccessibilityAction("Decrease by 0.1") { step(-0.1); true })
    }) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text(label, color = c.ink, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight(700)))
            was?.let { Note("  $it") }
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s2)) {
            Key(minusIcon, -1, "Decrease $label")
            BasicTextField(
                text, { v -> onText(v.filter { it.isDigit() || it == '.' }.take(8)) },
                textStyle = MaterialTheme.typography.headlineMedium.copy(color = c.ink, fontSize = 34.sp, fontWeight = FontWeight(700), textAlign = androidx.compose.ui.text.style.TextAlign.Center, fontFeatureSettings = "tnum"),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), singleLine = true, cursorBrush = SolidColor(c.ink),
                modifier = Modifier.weight(1f).semantics { contentDescription = "$label, ${text.ifEmpty { "empty" }}${delta?.let { ", $it" } ?: ""}" },
            )
            Key(LucideIcons.Plus, 1, "Increase $label")
        }
        delta?.let { Lede(it) }
    }
}

private val minusIcon = androidx.compose.ui.graphics.vector.ImageVector.Builder("Minus", 24.dp, 24.dp, 24f, 24f).apply {
    addPath(androidx.compose.ui.graphics.vector.addPathNodes("M5 12h14"), stroke = SolidColor(androidx.compose.ui.graphics.Color.Black), strokeLineWidth = 2f,
        strokeLineCap = androidx.compose.ui.graphics.StrokeCap.Round)
}.build()

/** What one Save wrote, for M-FLIGHT-04 and its Undo. */
data class SavedFlight(val readingId: String?, val oilId: String?, val tach: Double?, val lastTach: Double?, val hobbs: Double?, val lastHobbs: Double?, val quarts: Double?)

@Composable
fun FlightConfirm(recs: Recs, last: LastTach, initial: String, fromPhoto: Double?, denied: Boolean, onClose: () -> Unit) {
    val c = MyTailLogTheme.colors
    val lastHobbs = remember { recs.meter("hobbs") }
    var tach by rememberSaveable { mutableStateOf(initial) }
    var hobbs by rememberSaveable { mutableStateOf(fmt1(lastHobbs)) }
    var hobbsOn by rememberSaveable { mutableStateOf(lastHobbs != null) } // hours-only aircraft: hobbs hidden by default
    var oil by rememberSaveable { mutableStateOf(0) }
    var oilOther by rememberSaveable { mutableStateOf("") }
    var date by rememberSaveable { mutableStateOf(LocalDate.now().toString()) }
    var asking by remember { mutableStateOf(false) }
    var saved by remember { mutableStateOf<SavedFlight?>(null) }
    BackHandler(onBack = onClose)
    saved?.let { FlightSaved(recs, it, onClose); return }
    val t = num(tach)
    val h = num(hobbs).takeIf { hobbsOn }
    val quarts = when (oil) { 1 -> 1.0; 2 -> 2.0; 3 -> num(oilOther); else -> null }
    val tachMoved = t != null && t != last.value
    val hobbsMoved = h != null && h != lastHobbs
    val lower = t != null && last.value != null && t < last.value
    fun save(reset: Boolean) {
        val id = if (tachMoved || hobbsMoved) newId() else null
        if (reset && t != null) {
            val rid = newId()
            recs.change("meterReset.create", "meter_reset", rid, "Tach replaced", json("id" to rid, "meter" to "tach", "date" to date, "prior" to last.value, "next" to t))
        }
        id?.let {
            val payload = json("id" to it, "date" to date, "tach" to t.takeIf { tachMoved }, "hobbs" to h.takeIf { hobbsMoved },
                "source" to (if (fromPhoto != null) "tach_photo" else "manual"), "ocrValue" to fromPhoto, "ownerEdited" to (fromPhoto != null && fromPhoto != t))
            recs.change("reading.create", "hours_reading", it, flightLabel(last.value, t ?: 0.0), payload)
        }
        val oilId = quarts?.let { q -> newId().also { oid -> recs.change("oil.create", "oil_addition", oid, "Oil, ${fmtNum(q)} qt", json("id" to oid, "date" to date, "quarts" to q, "tach" to t)) } }
        saved = SavedFlight(id, oilId, t.takeIf { tachMoved }, last.value, h.takeIf { hobbsMoved }, lastHobbs, quarts)
    }
    Board(stringResource(R.string.flight_title), Section.Aircraft, back = stringResource(R.string.flight_photo) to onClose, footer = {
        DButton(stringResource(R.string.tach_save), { if (lower) asking = true else save(false) }, enabled = tachMoved || hobbsMoved || (quarts != null && quarts > 0))
    }) {
        if (denied) Note(stringResource(R.string.tach_allow_camera))
        if (fromPhoto != null) Well { Text(stringResource(R.string.flight_read_from_photo), color = c.ink, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight(700))); Note(stringResource(R.string.flight_check_meter)) }
        MeterStepper(stringResource(R.string.tach_label), last.value?.let { v -> "was ${fmt1(v)}${last.date?.let { " on ${dayDate(it)}" } ?: ""}" }, tach, { tach = it },
            if (t != null && last.value != null && t >= last.value) "${fmt1(t - last.value)} hours this flight" else null)
        if (lower) Well(alarm = true) { Text(stringResource(R.string.flight_lower, fmt1(last.value)), color = c.onAlarmBg, style = MaterialTheme.typography.bodyMedium) }
        // The mini line ahead in words: what the next hours-limited item does as the tach goes up.
        val next = recs.snapshot?.items?.filter { it.hours?.meter == "tach" }?.minByOrNull { it.hours!!.dueAt }
        if (next != null && t != null) Note("${next.label} now ${fmt1(next.hours!!.dueAt - t)} h away, was ${fmt1(next.hours!!.dueAt - (last.value ?: t))} h", Modifier.padding(bottom = Tokens.Space.s2))
        if (hobbsOn) {
            MeterStepper("Hobbs", lastHobbs?.let { "was ${fmt1(it)}" }, hobbs, { hobbs = it }, if (h != null && lastHobbs != null && h >= lastHobbs) "${fmt1(h - lastHobbs)} hours" else null)
            TextButton({ hobbsOn = false }, Modifier.heightIn(min = 44.dp)) { Text(stringResource(R.string.flight_not_this_time), color = c.ink) }
        } else Row(verticalAlignment = Alignment.CenterVertically) {
            Note(stringResource(R.string.flight_hobbs_off), Modifier.weight(1f))
            TextButton({ hobbsOn = true }, Modifier.heightIn(min = 44.dp)) { Text(stringResource(R.string.flight_record_it), color = c.ink) }
        }
        Note(stringResource(R.string.flight_oil_added), Modifier.padding(top = Tokens.Space.s2))
        Segmented(listOf("None", "1 qt", "2 qt", stringResource(R.string.ac_other)), oil) { oil = it }
        if (oil == 3) Field(stringResource(R.string.ac_quarts), oilOther, { oilOther = it }, number = true, placeholder = "0.5")
        DateRow(stringResource(R.string.rec_date), date, { date = it ?: date }, pastOnly = true)
    }
    if (asking) Sheet(stringResource(R.string.flight_replaced_q), { asking = false }) {
        Lede("${fmt1(last.value)} → ${fmt1(t)}")
        DButton(stringResource(R.string.flight_new_meter), { asking = false; save(true) })
        DButton(stringResource(R.string.flight_mistyped), { asking = false }, kind = ButtonKind.Secondary)
        DButton(stringResource(R.string.flight_as_typed), { asking = false; save(false) }, kind = ButtonKind.Quiet)
    }
}

@Composable
private fun FlightSaved(recs: Recs, f: SavedFlight, onDone: () -> Unit) {
    val c = MyTailLogTheme.colors
    val items = recs.snapshot?.items.orEmpty()
    val moved = (if (f.tach != null && f.lastTach != null) movedBy(items, "tach", f.lastTach, f.tach) else emptyList()) +
        (if (f.hobbs != null && f.lastHobbs != null) movedBy(items, "hobbs", f.lastHobbs, f.hobbs) else emptyList())
    val logged = listOfNotNull(
        if (f.tach != null && f.lastTach != null && f.tach >= f.lastTach) "Logged ${fmt1(f.tach - f.lastTach)} h, tach ${fmt1(f.tach)}" else f.tach?.let { "Tach ${fmt1(it)}" },
        f.hobbs?.let { "hobbs ${fmt1(it)}" },
    ).joinToString(", ")
    val oil = f.quarts?.let { "${fmtNum(it)} qt of oil" }
    val lead = moved.minByOrNull { it.after }?.let { "${it.label} now ${fmt1(it.after)} h away. " } ?: ""
    Board(if (f.readingId != null) stringResource(R.string.flight_saved) else stringResource(R.string.flight_oil_saved), Section.Aircraft, footer = {
        ButtonPair(stringResource(R.string.undo), {
            f.readingId?.let { recs.delete("reading.delete", "hours_reading", it, "Remove flight", json("readingId" to it)) }
            f.oilId?.let { recs.delete("oil.delete", "oil_addition", it, "Remove oil", json("additionId" to it)) }
            recs.toast = Toast(recs.str(R.string.flight_removed))
            onDone()
        }, stringResource(R.string.done), onDone, secondaryIcon = LucideIcons.Undo2)
    }) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s2)) { Icon(LucideIcons.CircleCheck, null, tint = c.ink) }
        Text(lead + listOfNotNull(logged.ifEmpty { null }, oil).joinToString(", with ") + ".", color = c.ink, style = MaterialTheme.typography.titleLarge)
        if (!recs.online) Note(stringResource(R.string.on_this_phone_note))
        if (moved.isNotEmpty()) {
            GroupHeader(stringResource(R.string.flight_what_moved))
            moved.forEach { m ->
                RecRow(m.label, listOf("was ${fmt1(m.before)} h → ${fmt1(m.after)} h"), trailing = { StatusMark(markKind(m.status), statusWord(m.status), compact = true) })
            }
            Note(stringResource(R.string.flight_calendar_same), Modifier.padding(top = Tokens.Space.s2))
        }
    }
}

package com.mytaillog.app

import android.Manifest
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.app.NotificationManagerCompat
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mytaillog.design.ButtonKind
import com.mytaillog.design.DButton
import com.mytaillog.design.GroupHeader
import com.mytaillog.design.MyTailLogTheme
import com.mytaillog.design.Section
import com.mytaillog.design.Tokens
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

const val INBOX = "aircraft/inbox"
const val REMINDERS = "aircraft/reminders"

/** Settings' rows into the two screens below (06 M-SYS-02), above the account part. */
@Composable
fun NotifyRows(onInbox: () -> Unit, onReminders: () -> Unit) {
    com.mytaillog.design.PhoneRow(stringResource(R.string.notify_title), onClick = onInbox)
    com.mytaillog.design.PhoneRow(stringResource(R.string.reminders_title), onClick = onReminders)
}

/** "12 min ago", "3 h ago", "Nov 16", as the web's inbox says it. */
fun inboxWhen(iso: String, now: Instant): String {
    val at = runCatching { Instant.parse(iso) }.getOrNull() ?: return ""
    val mins = Duration.between(at, now).toMinutes()
    return when {
        mins < 60 -> "${mins.coerceAtLeast(1)} min ago"
        mins < 24 * 60 -> "${(mins + 30) / 60} h ago"
        else -> at.atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("MMM d", Locale.US))
    }
}

/**
 * The notification inbox (C-NOTIFY-02, the web's 03 §5.4 on the phone): GET /api/me/notifications, read state and
 * row actions on the server so it agrees across devices. Tapping a row opens its deep link in the app.
 */
@Composable
fun InboxScreen(api: NotifyApi, back: Pair<String, () -> Unit>?, onOpen: (String?) -> Unit, onSettings: () -> Unit) {
    val c = MyTailLogTheme.colors
    val scope = rememberCoroutineScope()
    var items by remember { mutableStateOf<List<InboxItem>?>(null) }
    var failed by remember { mutableStateOf(false) }
    var reload by remember { mutableIntStateOf(0) }
    LaunchedEffect(reload) {
        failed = false
        try { items = api.inbox() } catch (e: CancellationException) { throw e } catch (_: Exception) { failed = true }
    }
    Board(stringResource(R.string.notify_title), Section.Aircraft, back = back, footer = {
        Row(horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s2)) {
            DButton(stringResource(R.string.notify_read_all), {
                scope.launch {
                    items.orEmpty().filter { !it.read }.forEach { runCatching { api.markRead(it.id) } }
                    reload++
                }
            }, kind = ButtonKind.Secondary, enabled = items.orEmpty().any { !it.read })
            DButton(stringResource(R.string.notify_settings), onSettings, kind = ButtonKind.Quiet)
        }
    }) {
        val list = items
        when {
            failed && list == null -> Empty(stringResource(R.string.notify_failed), stringResource(R.string.try_again)) { reload++ }
            list == null -> Note(stringResource(R.string.notify_loading))
            list.isEmpty() -> Lede(stringResource(R.string.notify_empty))
            else -> list.forEachIndexed { i, n ->
                if (i > 0) HorizontalDivider(color = c.rule)
                InboxRow(n, onOpen = {
                    scope.launch {
                        if (!n.read) runCatching { api.markRead(n.id) }
                        onOpen(n.deepLink)
                    }
                }, onAction = { actionId ->
                    scope.launch {
                        val next = try { api.act(n.id, actionId) } catch (e: CancellationException) { throw e } catch (_: Exception) { null }
                        if (next != null) onOpen(next) else reload++
                    }
                })
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun InboxRow(n: InboxItem, onOpen: () -> Unit, onAction: (String) -> Unit) {
    val c = MyTailLogTheme.colors
    val unread = stringResource(R.string.notify_unread)
    val time = inboxWhen(n.createdAt, Instant.now())
    Column(Modifier.fillMaxWidth().padding(vertical = Tokens.Space.s2)) {
        Column(
            Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(onClick = onOpen)
                .semantics(mergeDescendants = true) { contentDescription = listOfNotNull(unread.takeIf { !n.read }, n.title, n.body, time).joinToString(". ") },
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s2)) {
                if (!n.read) Box(Modifier.size(8.dp).background(c.ink, CircleShape))
                Text(n.title, color = c.ink, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight(700)), modifier = Modifier.weight(1f))
                Text(time, color = c.ink3, style = MaterialTheme.typography.labelSmall)
            }
            Text(n.body, color = c.ink2, style = MaterialTheme.typography.bodyMedium, maxLines = 3)
        }
        if (n.actions.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s2), modifier = Modifier.padding(top = Tokens.Space.s2)) {
            n.actions.forEach { a -> DButton(a.label, { onAction(a.id) }, kind = ButtonKind.Secondary) }
        }
    }
}

/** One row of the lead-time table: the alerts key, its label, and which of days and hours it takes. */
private data class Kind(val key: String, val label: Int, val days: Boolean, val hours: Boolean)

private val KINDS = listOf(
    Kind("annual", R.string.reminders_kind_annual, days = true, hours = false),
    Kind("oil", R.string.reminders_kind_oil, days = false, hours = true),
    Kind("ad", R.string.reminders_kind_ad, days = true, hours = true),
    Kind("document", R.string.reminders_kind_document, days = true, hours = false),
    Kind("visit", R.string.reminders_kind_visit, days = true, hours = false),
    Kind("default", R.string.reminders_kind_default, days = true, hours = true),
)

private val HHMM = Regex("^([01]\\d|2[0-3]):[0-5]\\d$")

/** `{ alerts: { key: value } }`, the merge-patch the server applies per alerts key (09 §2.11). */
fun alertPatch(key: String, value: JsonElement): JsonObject = buildJsonObject { put("alerts", buildJsonObject { put(key, value) }) }

/**
 * Reminders (06 M-SYS-05): this phone's switch and registration state, then the account's settings exactly as the
 * web's Settings › Reminders shows them, each saved on its own through PATCH /api/me/preferences.
 */
@Composable
fun RemindersScreen(api: NotifyApi, back: Pair<String, () -> Unit>?) {
    val context = LocalContext.current
    val resources = LocalResources.current
    val scope = rememberCoroutineScope()
    val prefsDevice = remember { devicePrefs(context) }
    var reading by remember { mutableStateOf(prefsDevice.getBoolean(ReadingWorker.PREF_READING, true)) }
    var prefs by remember { mutableStateOf<JsonObject?>(null) }
    var failed by remember { mutableStateOf(false) }
    var said by remember { mutableStateOf<String?>(null) }
    var test by remember { mutableStateOf<String?>(null) }
    val saved = stringResource(R.string.reminders_saved)
    val notSaved = stringResource(R.string.reminders_not_saved)
    LaunchedEffect(Unit) {
        try { prefs = api.preferences() } catch (e: CancellationException) { throw e } catch (_: Exception) { failed = true }
    }
    fun save(patch: JsonObject) {
        scope.launch {
            said = try { prefs = api.savePreferences(patch); saved } catch (e: CancellationException) { throw e } catch (_: Exception) { notSaved }
        }
    }

    Board(stringResource(R.string.reminders_title), Section.Aircraft, back = back) {
        PhoneSwitch(api)
        Toggle(stringResource(R.string.reminders_reading), reading) { on -> reading = on; prefsDevice.edit().putBoolean(ReadingWorker.PREF_READING, on).apply() }
        HorizontalDivider(color = MyTailLogTheme.colors.rule, modifier = Modifier.padding(vertical = Tokens.Space.s2))

        val p = prefs
        if (p == null) {
            if (failed) Note(stringResource(R.string.reminders_load_failed), alarm = true) else Note(stringResource(R.string.notify_loading))
        } else {
            val alerts = p["alerts"]?.jsonObject ?: JsonObject(emptyMap())
            fun alert(key: String) = alerts[key] as? JsonObject ?: JsonObject(emptyMap())
            fun bool(o: JsonObject, k: String) = o[k]?.jsonPrimitive?.booleanOrNull ?: false
            val on = p["notify_due"]?.jsonPrimitive?.booleanOrNull ?: false
            Toggle(stringResource(R.string.reminders_master), on) { save(buildJsonObject { put("notify_due", it) }) }
            Toggle(stringResource(R.string.reminders_weekly), alerts["weekly_while_lapsed"]?.jsonPrimitive?.booleanOrNull ?: true, enabled = on) {
                save(alertPatch("weekly_while_lapsed", JsonPrimitive(it)))
            }
            KINDS.forEach { k ->
                val a = alert(k.key)
                Toggle(stringResource(k.label), bool(a, "enabled"), enabled = on) { save(alertPatch(k.key, buildJsonObject { put("enabled", it) })) }
                Row(horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s2)) {
                    if (k.days) LeadField(stringResource(R.string.reminders_days), a["lead_days"]?.jsonPrimitive?.intOrNull, Modifier.weight(1f)) {
                        save(alertPatch(k.key, buildJsonObject { put("lead_days", it) }))
                    }
                    if (k.hours) LeadField(stringResource(R.string.reminders_hours), a["lead_hours"]?.jsonPrimitive?.intOrNull, Modifier.weight(1f)) {
                        save(alertPatch(k.key, buildJsonObject { put("lead_hours", it) }))
                    }
                }
            }
            GroupHeader(stringResource(R.string.reminders_by))
            val channels = alert("channels")
            Toggle(stringResource(R.string.reminders_email), bool(channels, "email"), enabled = on) { save(alertPatch("channels", buildJsonObject { put("email", it) })) }
            Toggle(stringResource(R.string.reminders_push), bool(channels, "push"), enabled = on) { save(alertPatch("channels", buildJsonObject { put("push", it) })) }
            GroupHeader(stringResource(R.string.reminders_quiet))
            val quiet = alert("quiet_hours")
            Row(horizontalArrangement = Arrangement.spacedBy(Tokens.Space.s2)) {
                listOf("start" to R.string.reminders_quiet_from, "end" to R.string.reminders_quiet_until).forEach { (edge, label) ->
                    val now = quiet[edge]?.jsonPrimitive?.contentOrNull ?: ""
                    BlurField(stringResource(label), now, Modifier.weight(1f), valid = { HHMM.matches(it) }) {
                        save(alertPatch("quiet_hours", buildJsonObject { put(edge, it) }))
                    }
                }
            }
            Note(stringResource(R.string.reminders_note), Modifier.padding(top = Tokens.Space.s2))
        }
        said?.let { Note(it, Modifier.semantics { liveRegion = LiveRegionMode.Polite }, alarm = it == notSaved) }
        HorizontalDivider(color = MyTailLogTheme.colors.rule, modifier = Modifier.padding(vertical = Tokens.Space.s2))
        val sending = stringResource(R.string.reminders_test_sending)
        val limit = stringResource(R.string.reminders_test_limit)
        val offline = stringResource(R.string.reminders_offline)
        val nothing = stringResource(R.string.reminders_test_nothing)
        DButton(stringResource(R.string.reminders_test), {
            test = sending
            scope.launch {
                test = try {
                    val r = api.test()
                    val devices = resources.getQuantityString(R.plurals.reminders_devices, r.devices, r.devices)
                    when {
                        r.devices > 0 && r.email -> resources.getString(R.string.reminders_test_both, devices)
                        r.devices > 0 -> resources.getString(R.string.reminders_test_devices, devices)
                        r.email -> resources.getString(R.string.reminders_test_email)
                        else -> nothing
                    }
                } catch (e: CancellationException) {
                    throw e
                } catch (e: UploadHttpException) {
                    if (e.status == 429) limit else e.message
                } catch (_: Exception) {
                    offline
                }
            }
        }, kind = ButtonKind.Secondary, enabled = test != sending)
        test?.let { Note(it, Modifier.padding(top = Tokens.Space.s2).semantics { liveRegion = LiveRegionMode.Polite }) }
    }
}

/** "Reminders on this phone" and what the phone can say about it (06 M-SYS-05 state line, today's diagnostics kept). */
@Composable
private fun PhoneSwitch(api: NotifyApi) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val prefs = remember { devicePrefs(context) }
    var on by remember { mutableStateOf(prefs.getBoolean(Push.PREF_ON, true)) }
    var osOn by remember { mutableStateOf(NotificationManagerCompat.from(context).areNotificationsEnabled()) }
    LifecycleResumeEffect(Unit) {
        osOn = NotificationManagerCompat.from(context).areNotificationsEnabled()
        onPauseOrDispose {}
    }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        osOn = granted
        if (!granted) context.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName))
    }
    val state by Push.state.collectAsStateWithLifecycle()
    Toggle(stringResource(R.string.reminders_phone), on) { v ->
        on = v
        prefs.edit().putBoolean(Push.PREF_ON, v).apply()
        scope.launch { if (v) Push.register(context, api) else Push.unregister(context, api) }
    }
    val line = when {
        !on -> stringResource(R.string.reminders_phone_off)
        !osOn -> stringResource(R.string.reminders_os_off)
        state == PushState.Registered -> stringResource(R.string.reminders_phone_on)
        state == PushState.NotConfigured -> stringResource(R.string.reminders_failed, stringResource(R.string.reminders_no_fcm))
        state is PushState.Failed -> stringResource(R.string.reminders_failed, (state as PushState.Failed).reason)
        else -> null
    }
    line?.let { Note(it, Modifier.semantics { liveRegion = LiveRegionMode.Polite }, alarm = on && (!osOn || state is PushState.Failed || state == PushState.NotConfigured)) }
    if (on && !osOn) DButton(stringResource(R.string.reminders_allow), {
        if (Build.VERSION.SDK_INT >= 33) ask.launch(Manifest.permission.POST_NOTIFICATIONS)
        else context.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName))
    }, kind = ButtonKind.Secondary, modifier = Modifier.padding(vertical = Tokens.Space.s2))
}

/** A whole-number lead time, saved when it loses focus with a new value (the web saves on blur too). */
@Composable
private fun LeadField(label: String, value: Int?, modifier: Modifier, onSave: (Int) -> Unit) {
    BlurField(label, value?.toString() ?: "", modifier, number = true, valid = { it.toIntOrNull()?.let { n -> n >= 0 } == true }) { onSave(it.toInt()) }
}

@Composable
private fun BlurField(label: String, value: String, modifier: Modifier, number: Boolean = false, valid: (String) -> Boolean, onSave: (String) -> Unit) {
    var text by remember(value) { mutableStateOf(value) }
    Field(label, text, { text = if (number) it.filter(Char::isDigit) else it }, modifier.onFocusChanged { f ->
        if (!f.isFocused && text != value && valid(text)) onSave(text)
    }, number = number)
}

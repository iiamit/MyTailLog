package com.mytaillog.app

import android.view.KeyEvent
import java.net.URI

// One route table for notifications, widgets, shortcuts, App Actions and App Links (05 §5.5). Pure, so it is unit-tested.

/** Where a link lands inside the app. */
enum class LinkTarget { Status, Items, Item, Plan, Visit, Review, Queue, Scan, Flight, NewSquawk, Squawk, Docs, Share, Settings, Reminders, Inbox }

/** A parsed link: [aircraftId] null means the last opened aircraft. */
data class AppLink(val aircraftId: String?, val target: LinkTarget, val arg: String? = null)

/** The https form every widget, shortcut and in-app notification uses. */
const val APP_LINK_ROOT = "https://mytaillog.com/app"

fun appLink(aircraftId: String?, path: String = ""): String =
    APP_LINK_ROOT + (aircraftId?.let { "/a/$it" } ?: "") + (if (path.isEmpty()) "" else "/$path")

/**
 * `https://mytaillog.com/app/a/{id}/…` (05 §5.5), `https://mytaillog.com/app/{route}` (last opened aircraft), and the
 * server's `mytaillog://aircraft/{id}/…` deep links (notification rows and pushes, same vocabulary as the web's
 * appLinkToWeb). Null for anything else, including the sign-in return (`/app/auth/callback`).
 */
fun parseAppLink(raw: String?): AppLink? {
    if (raw.isNullOrBlank()) return null
    val uri = runCatching { URI(raw.trim()) }.getOrNull() ?: return null
    val path: String = when (uri.scheme?.lowercase()) {
        "mytaillog" -> "/" + (uri.host ?: "") + (uri.path ?: "")
        "https", "http" -> {
            val host = uri.host?.lowercase() ?: return null
            if (host != "mytaillog.com" && !host.endsWith(".mytaillog.com")) return null
            val p = uri.path ?: return null
            if (!p.startsWith("/app/") && p != "/app") return null
            p.removePrefix("/app")
        }
        else -> return null
    }
    val segs = path.split('/').filter { it.isNotEmpty() }
    if (segs.firstOrNull() == "auth") return null
    val (id, rest) = if (segs.size >= 2 && segs[0] in setOf("a", "aircraft")) segs[1] to segs.drop(2) else null to segs
    // The web's section words ("status", "books", "logbooks", "maint") are dropped so both vocabularies meet.
    val r = if (rest.firstOrNull() in setOf("status", "books", "logbooks", "maint", "maintenance") && rest.size > 1) rest.drop(1) else rest
    fun link(t: LinkTarget, arg: String? = null) = AppLink(id, t, arg)
    return when {
        r.isEmpty() || r == listOf("status") -> link(LinkTarget.Status)
        r == listOf("due") || r == listOf("items") -> link(LinkTarget.Items)
        r.size == 2 && r[0] == "item" -> link(LinkTarget.Item, r[1])
        r == listOf("plan") -> link(LinkTarget.Plan)
        r.size == 2 && r[0] == "visit" -> link(LinkTarget.Visit, r[1])
        r.firstOrNull() == "review" -> link(LinkTarget.Review)
        r == listOf("queue") -> link(LinkTarget.Queue)
        r == listOf("scan") -> link(LinkTarget.Scan)
        r == listOf("flight") -> link(LinkTarget.Flight)
        r == listOf("squawk", "new") -> link(LinkTarget.NewSquawk)
        r.size == 2 && r[0] == "squawk" -> link(LinkTarget.Squawk, r[1])
        r == listOf("docs") || r == listOf("documents") -> link(LinkTarget.Docs)
        r == listOf("share") -> link(LinkTarget.Share)
        r == listOf("settings") -> link(LinkTarget.Settings)
        r == listOf("settings", "notifications") -> link(LinkTarget.Reminders)
        r == listOf("notifications") -> link(LinkTarget.Inbox)
        else -> link(LinkTarget.Status) // an unknown path still opens the aircraft (03 §10.3)
    }
}

/** The scan setup sheet, which is not a route: Shell opens it over Logbooks. */
const val SCAN_SHEET = "logbooks/scan-sheet"

/**
 * Where a link lands: the section, then the screen pushed on it (null: the section's top). The phone pushes the
 * route on that tab; the tablet opens the section and puts records routes in the right leaf.
 * shortcut: an item link opens Status (the item sheet is the screen's own state), not the item itself.
 */
data class Landing(val section: Destination, val route: String? = null)

fun landing(link: AppLink): Landing = when (link.target) {
    LinkTarget.Status, LinkTarget.Item -> Landing(Destination.Status)
    LinkTarget.Items -> Landing(Destination.Status, STATUS_ALL_ITEMS)
    LinkTarget.Plan -> Landing(Destination.Status, STATUS_PLAN)
    LinkTarget.Visit -> Landing(Destination.Status, "$STATUS_VISIT/${link.arg}")
    LinkTarget.Flight -> Landing(Destination.Status, TACH_CAMERA)
    LinkTarget.Review -> Landing(Destination.Logbooks, BOOKS_REVIEW)
    LinkTarget.Queue -> Landing(Destination.Logbooks, SCAN_QUEUE)
    LinkTarget.Scan -> Landing(Destination.Logbooks, SCAN_SHEET)
    LinkTarget.NewSquawk -> Landing(Destination.Maintenance, Routes.NEW_SQUAWK)
    LinkTarget.Squawk -> Landing(Destination.Maintenance, Routes.of(Routes.SQUAWK, link.arg ?: ""))
    LinkTarget.Docs -> Landing(Destination.Documents)
    LinkTarget.Share -> Landing(Destination.Share)
    LinkTarget.Settings -> Landing(Destination.Aircraft, SETTINGS_ON_PHONE)
    LinkTarget.Reminders -> Landing(Destination.Aircraft, REMINDERS)
    LinkTarget.Inbox -> Landing(Destination.Aircraft, INBOX)
}

/** App Actions' OPEN_APP_FEATURE hands over the bound shortcut id (res/xml/shortcuts.xml). */
fun featureLink(feature: String?): AppLink? = when (feature?.lowercase()) {
    "flight" -> AppLink(null, LinkTarget.Flight)
    "due" -> AppLink(null, LinkTarget.Status)
    "scan" -> AppLink(null, LinkTarget.Scan)
    "squawk" -> AppLink(null, LinkTarget.NewSquawk)
    else -> null
}

/** The extra FCM puts the server's `data.deepLink` under when the system draws the notification. */
const val EXTRA_DEEP_LINK = "deepLink"
const val EXTRA_FEATURE = "feature"

/** What an incoming intent asks for: its data URI, a push's deep link, or an App Actions feature. */
fun linkFromIntent(data: String?, deepLink: String?, feature: String?): AppLink? =
    parseAppLink(data) ?: parseAppLink(deepLink) ?: featureLink(feature)

/** Pushes and reading notes group by aircraft (05 §10.2 `setGroup`); account-wide ones share one group. */
fun notificationGroup(deepLink: String?): String = parseAppLink(deepLink)?.aircraftId?.let { "aircraft-$it" } ?: "account"

/** Hardware keyboard commands at the shell (06 M-SYS-08). Back (Esc, Ctrl+[) goes to the back dispatcher instead. */
sealed interface KeyCommand {
    data class Section(val index: Int) : KeyCommand
    data object LogFlight : KeyCommand
    data object Sync : KeyCommand
    data object Settings : KeyCommand
    data object Back : KeyCommand
}

fun keyCommand(keyCode: Int, ctrl: Boolean, shift: Boolean): KeyCommand? = when {
    keyCode == KeyEvent.KEYCODE_ESCAPE && !ctrl && !shift -> KeyCommand.Back
    !ctrl -> null
    keyCode in KeyEvent.KEYCODE_1..KeyEvent.KEYCODE_6 && !shift -> KeyCommand.Section(keyCode - KeyEvent.KEYCODE_1)
    keyCode == KeyEvent.KEYCODE_F && shift -> KeyCommand.LogFlight
    keyCode == KeyEvent.KEYCODE_R && !shift -> KeyCommand.Sync
    keyCode == KeyEvent.KEYCODE_COMMA && !shift -> KeyCommand.Settings
    keyCode == KeyEvent.KEYCODE_LEFT_BRACKET && !shift -> KeyCommand.Back
    else -> null
}

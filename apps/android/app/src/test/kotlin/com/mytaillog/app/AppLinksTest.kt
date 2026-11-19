package com.mytaillog.app

import android.view.KeyEvent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AppLinksTest {
    private val id = "d5c25951-f64a-5331-9b60-9ee02b456a25"

    @Test
    fun theNativeRouteTableParses() {
        assertEquals(AppLink(id, LinkTarget.Status), parseAppLink("https://mytaillog.com/app/a/$id"))
        assertEquals(AppLink(id, LinkTarget.Items), parseAppLink("https://mytaillog.com/app/a/$id/due"))
        assertEquals(AppLink(id, LinkTarget.Item, "mx:1"), parseAppLink("https://mytaillog.com/app/a/$id/item/mx:1"))
        assertEquals(AppLink(id, LinkTarget.Plan), parseAppLink("https://mytaillog.com/app/a/$id/plan?date=2026-12-01"))
        assertEquals(AppLink(id, LinkTarget.Review), parseAppLink("https://mytaillog.com/app/a/$id/review/p1"))
        assertEquals(AppLink(id, LinkTarget.NewSquawk), parseAppLink("https://mytaillog.com/app/a/$id/squawk/new"))
        assertEquals(AppLink(id, LinkTarget.Squawk, "s1"), parseAppLink("https://mytaillog.com/app/a/$id/squawk/s1"))
    }

    @Test
    fun theServersDeepLinksParse() {
        // What /api/me/notifications rows, the action route and reading-done pushes carry (lib/extraction/queue.ts).
        assertEquals(AppLink(id, LinkTarget.Status), parseAppLink("mytaillog://aircraft/$id/status"))
        assertEquals(AppLink(id, LinkTarget.Visit, "v1"), parseAppLink("mytaillog://aircraft/$id/status/visit/v1"))
        assertEquals(AppLink(id, LinkTarget.Plan), parseAppLink("mytaillog://aircraft/$id/status/plan"))
        assertEquals(AppLink(id, LinkTarget.Review), parseAppLink("mytaillog://aircraft/$id/logbooks/review?batch=b1"))
        assertEquals(AppLink(id, LinkTarget.Squawk, "s1"), parseAppLink("mytaillog://aircraft/$id/maint/squawk/s1"))
        // Unknown paths still open the aircraft, as on the web.
        assertEquals(AppLink(id, LinkTarget.Status), parseAppLink("mytaillog://aircraft/$id/books/map?at=2025-01-01"))
    }

    @Test
    fun shortcutsUseTheLastOpenedAircraft() {
        assertEquals(AppLink(null, LinkTarget.Flight), parseAppLink("https://mytaillog.com/app/flight"))
        assertEquals(AppLink(null, LinkTarget.Status), parseAppLink("https://mytaillog.com/app/status"))
        assertEquals(AppLink(null, LinkTarget.Scan), parseAppLink("https://mytaillog.com/app/scan"))
        assertEquals(AppLink(null, LinkTarget.NewSquawk), parseAppLink("https://mytaillog.com/app/squawk/new"))
        assertEquals(AppLink(null, LinkTarget.Reminders), parseAppLink("https://mytaillog.com/app/settings/notifications"))
        assertEquals(AppLink(null, LinkTarget.Flight), featureLink("flight"))
        assertEquals(AppLink(null, LinkTarget.Status), featureLink("due"))
        assertNull(featureLink("dance"))
    }

    @Test
    fun signInReturnsAndOtherSitesAreNotAppLinks() {
        assertNull(parseAppLink("https://mytaillog.com/app/auth/callback?code=x"))
        assertNull(parseAppLink("com.mytaillog.app://auth/callback?code=x"))
        assertNull(parseAppLink("https://example.com/app/a/$id"))
        assertNull(parseAppLink("https://mytaillog.com/r/token"))
        assertNull(parseAppLink(null))
        // The intent's data wins; then a push's deepLink extra; then an App Actions feature.
        assertEquals(AppLink(id, LinkTarget.Review), linkFromIntent(null, "mytaillog://aircraft/$id/logbooks/review", "flight"))
        assertEquals(AppLink(null, LinkTarget.Flight), linkFromIntent(null, null, "flight"))
        assertNull(linkFromIntent("com.mytaillog.app://auth/callback", null, null))
    }

    @Test
    fun linksLandOnTheirSection() {
        assertEquals(Landing(Destination.Status, TACH_CAMERA), landing(AppLink(null, LinkTarget.Flight)))
        assertEquals(Landing(Destination.Status, "$STATUS_VISIT/v1"), landing(AppLink(id, LinkTarget.Visit, "v1")))
        assertEquals(Landing(Destination.Logbooks, BOOKS_REVIEW), landing(AppLink(id, LinkTarget.Review)))
        assertEquals(Landing(Destination.Logbooks, SCAN_SHEET), landing(AppLink(null, LinkTarget.Scan)))
        assertEquals(Landing(Destination.Maintenance, "maint/squawk/s1"), landing(AppLink(id, LinkTarget.Squawk, "s1")))
        assertEquals(Landing(Destination.Aircraft, INBOX), landing(AppLink(null, LinkTarget.Inbox)))
        assertEquals(Landing(Destination.Status), landing(AppLink(id, LinkTarget.Item, "mx:1")))
    }

    @Test
    fun notificationsGroupByAircraft() {
        assertEquals("aircraft-$id", notificationGroup("mytaillog://aircraft/$id/status/plan"))
        assertEquals("aircraft-$id", notificationGroup(appLink(id, "review")))
        // Two aircraft never share a group; account-wide rows share one.
        assertEquals("aircraft-other", notificationGroup("mytaillog://aircraft/other/status"))
        assertEquals("account", notificationGroup(null))
        assertEquals("account", notificationGroup("https://mytaillog.com/app/settings"))
    }

    @Test
    fun keyboardCommands() {
        assertEquals(KeyCommand.Section(0), keyCommand(KeyEvent.KEYCODE_1, ctrl = true, shift = false))
        assertEquals(KeyCommand.Section(5), keyCommand(KeyEvent.KEYCODE_6, ctrl = true, shift = false))
        assertNull(keyCommand(KeyEvent.KEYCODE_7, ctrl = true, shift = false))
        assertNull(keyCommand(KeyEvent.KEYCODE_1, ctrl = false, shift = false)) // typing a digit is just a digit
        assertEquals(KeyCommand.LogFlight, keyCommand(KeyEvent.KEYCODE_F, ctrl = true, shift = true))
        assertNull(keyCommand(KeyEvent.KEYCODE_F, ctrl = true, shift = false)) // Ctrl+F is find, not ours
        assertEquals(KeyCommand.Sync, keyCommand(KeyEvent.KEYCODE_R, ctrl = true, shift = false))
        assertEquals(KeyCommand.Settings, keyCommand(KeyEvent.KEYCODE_COMMA, ctrl = true, shift = false))
        assertEquals(KeyCommand.Back, keyCommand(KeyEvent.KEYCODE_ESCAPE, ctrl = false, shift = false))
        assertEquals(KeyCommand.Back, keyCommand(KeyEvent.KEYCODE_LEFT_BRACKET, ctrl = true, shift = false))
    }
}

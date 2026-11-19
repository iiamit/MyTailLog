package com.mytaillog.app

import com.mytaillog.core.domain.due.VisitItem
import com.mytaillog.core.domain.due.VisitView
import com.mytaillog.core.domain.due.Visits
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.LocalDate

class WidgetDataTest {
    private val snap = sampleSnapshot().let { it.copy(computedAt = "2026-11-18T12:00:00Z") }
    private val today = LocalDate.parse("2026-11-18")
    private val now = Instant.parse("2026-11-18T13:00:00Z")

    @Test
    fun liveSampleListsWhatComesDueInSixtyDays() {
        val v = widgetView("N734DM", snap, today, now)
        assertEquals(
            listOf(
                "Transponder check lapsed May 31",
                "Annual lapsed Jul 31",
                "ELT inspection lapsed Jul 31",
                "Pitot-static check due Nov 30, IFR only",
                "Oil change in 9.7 h",
            ),
            v.rows.map { "${it.lead} ${it.rest}" },
        )
        assertNull(v.empty)
        assertNull(v.asOf)
        assertTrue(v.summary.startsWith("N734DM, next 60 days: Transponder check lapsed May 31. Annual"))
        // The bitmap's window is the fixed 60 days; only listed items have rings.
        assertEquals("2027-01-17", v.line!!.to)
        assertEquals(4, v.line!!.rings.size)
        assertEquals("12 days", v.rows[3].value)
    }

    @Test
    fun unconfirmedEntriesNeverCount() {
        // An item whose only record was read by AI and not yet confirmed: the engine says "no record" and names the
        // waiting entry. The widget neither lists it nor treats the waiting entry as done.
        val waiting = snap.body.items.first().copy(key = "mx:waiting", label = "Compass swing", status = "no_record", calendar = null, hours = null, waitingEntryId = "e1")
        val oil = snap.body.items.single { it.label == "Oil change" }
        val v = widgetView("N734DM", snap.copy(body = snap.body.copy(items = listOf(waiting, oil.copy(waitingEntryId = "e2")))), today, now)
        assertEquals(listOf("Oil change"), v.rows.map { it.lead })
        assertEquals("due_soon", v.rows.single().status) // a waiting entry doesn't move it
        assertFalse(v.summary.contains("Compass"))
    }

    @Test
    fun dayCountsMoveAtMidnightWithoutANewSnapshot() {
        // Two weeks later the pitot-static check (due Nov 30) has lapsed and moves up with the other lapsed items.
        val v = widgetView("N734DM", snap, LocalDate.parse("2026-12-02"), Instant.parse("2026-12-02T09:00:00Z"))
        val pitot = v.rows.single { it.lead == "Pitot-static check" }
        assertEquals("lapsed Nov 30, IFR only", pitot.rest)
        assertEquals("overdue", pitot.status)
        assertEquals(3, v.rows.indexOf(pitot))
        assertEquals("as of Nov 18", v.asOf) // more than 24 hours old
    }

    @Test
    fun aVisitNamesItsItemsOnOneLine() {
        val body = snap.body
        val pitot = body.items.single { it.label == "Pitot-static check" }.key
        val oil = body.items.single { it.label == "Oil change" }.key
        val visit = VisitView("v1", null, "planned", "2026-11-23", "2026-11-25", "KBED", emptyList(), listOf(VisitItem(pitot, null, "due_soon", false), VisitItem(oil, null, "due_soon", false)), 2, emptyList())
        val v = widgetView("N734DM", snap.copy(body = body.copy(visits = Visits(planned = listOf(visit)))), today, now)
        assertEquals(listOf("Transponder check", "Annual", "ELT inspection", "Nov 25 visit:"), v.rows.map { it.lead })
        assertEquals("pitot-static check and oil change", v.rows.last().rest)
        assertNull(v.rows.last().key)
    }

    @Test
    fun emptyAndSignedOut() {
        val clear = widgetView("N734DM", snap.copy(body = snap.body.copy(items = emptyList())), today, now)
        assertEquals("Nothing due before Jan 17", clear.empty)
        assertEquals("N734DM, next 60 days: Nothing due before Jan 17.", clear.summary)
        val none = widgetView(null, null, today, now)
        assertEquals("Open MyTailLog to choose an aircraft.", none.empty)
        assertNull(none.line)
    }

    @Test
    fun readingNoteFollowsTheBatch() {
        fun b(expected: Int, queued: Int = 0, reading: Int = 0, waiting: Int = 0, read: Int = 0, look: Int = 0) =
            BatchProgress("b", "Airframe", expected, expected, queued, reading, waiting, read, 0, look, 0)
        assertEquals(ReadingNote("Reading 4 pages · 2 of 4 read", 2, 4, false), readingNote(listOf(b(4, reading = 2, read = 2))))
        assertEquals("4 pages wait for tomorrow's reading allowance.", readingNote(listOf(b(4, waiting = 4)))!!.text)
        assertEquals("1 page waits for tomorrow's reading allowance.", readingNote(listOf(b(1, waiting = 1)))!!.text)
        val done = readingNote(listOf(b(4, read = 4, look = 1), b(2, read = 2, look = 1)))!!
        assertEquals("6 pages are read. 2 need a look.", done.text)
        assertTrue(done.done)
        assertEquals("1 page is read.", readingNote(listOf(b(1, read = 1)))!!.text)
        assertNull(readingNote(emptyList()))
    }

    @Test
    fun inboxRowsAndReminderPatches() {
        val o = kotlinx.serialization.json.Json.parseToJsonElement(
            """{"items":[{"id":"n1","aircraftId":"a","kind":"visit","title":"N734DM: three items fit one visit","body":"Oil change in 9.7 h.","deepLink":"mytaillog://aircraft/a/status/plan","actions":[{"id":"plan_visit","label":"Plan the visit"},{"id":"remind_friday","label":"Remind me Friday"}],"payload":{},"createdAt":"2026-11-18T12:00:00Z","readAt":null},
               {"id":"n2","aircraftId":null,"kind":"reading_done","title":"34 pages read","body":"They don't count until you confirm them.","deepLink":null,"actions":null,"createdAt":"2026-11-17T12:00:00Z","readAt":"2026-11-17T13:00:00Z"}]}""",
        ) as kotlinx.serialization.json.JsonObject
        val rows = parseInbox(o)
        assertEquals(listOf("plan_visit", "remind_friday"), rows[0].actions.map { it.id })
        assertFalse(rows[0].read)
        assertTrue(rows[1].read)
        assertEquals(emptyList<InboxAction>(), rows[1].actions)
        assertEquals("1 h ago", inboxWhen("2026-11-18T12:00:00Z", now))
        assertEquals(buildJsonObject { put("alerts", buildJsonObject { put("oil", buildJsonObject { put("lead_hours", 12) }) }) }, alertPatch("oil", buildJsonObject { put("lead_hours", 12) }))
        assertEquals("""{"alerts":{"weekly_while_lapsed":false}}""", alertPatch("weekly_while_lapsed", JsonPrimitive(false)).toString())
    }
}

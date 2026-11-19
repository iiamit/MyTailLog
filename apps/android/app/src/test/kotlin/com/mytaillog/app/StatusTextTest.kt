package com.mytaillog.app

import com.mytaillog.core.api.StatusSnapshot
import com.mytaillog.core.api.parseStatus
import com.mytaillog.core.domain.due.DueItem
import com.mytaillog.design.MarkKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant
import java.time.ZoneOffset

/** Real snapshot from the test project's demo aircraft N734DM (GET /api/aircraft/{id}/status, 2026-11-18). */
fun sampleSnapshot(): StatusSnapshot =
    parseStatus(StatusTextTest::class.java.classLoader!!.getResource("status-n734dm.json")!!.readText())

class StatusTextTest {
    private val snap = sampleSnapshot()
    private val body = snap.body
    private val today = body.today
    private fun item(label: String): DueItem = body.items.single { it.label == label }

    @Test
    fun theLiveSampleParses() {
        assertEquals("3 items are overdue.", body.verdict.text)
        assertEquals(listOf(listOf(0, 19)), body.verdict.emphasis)
        assertEquals(7, body.items.size)
        assertEquals("2026-11-18T22:54:40.168Z", snap.computedAt)
        assertEquals(3, body.lineAhead.undated.size)
    }

    @Test
    fun groupsFollowTheHorizon() {
        val groups = grouped(body.items, today).map { (g, list) -> g to list.map { it.label } }
        assertEquals(
            listOf(
                DueGroup.Overdue to listOf("Transponder check", "Annual", "ELT inspection"),
                DueGroup.Near to listOf("Pitot-static check", "Oil change"),
                DueGroup.Later to listOf("AD 2011-10-09", "Engine overhaul"),
            ),
            groups,
        )
        // Current but projected inside 60 days, or within 25 h: near.
        val ad = item("AD 2011-10-09")
        assertEquals(DueGroup.Near, groupOf(ad.copy(hours = ad.hours!!.copy(remaining = 20.0)), today))
        assertEquals(DueGroup.Near, groupOf(ad.copy(hours = ad.hours!!.copy(projectedDate = "2027-01-10")), today))
        assertEquals(DueGroup.NoRecord, groupOf(ad.copy(status = "no_record"), today))
        // Home lists all but Later's tail: 3 + 2 + 1 of 7, so "See all" shows.
        assertEquals(6, shownOnHome(body.items, today, body.situation))
    }

    @Test
    fun rowValuesAndSlips() {
        assertEquals("lapsed 110 days ago", overdueText(item("Annual")))
        assertNull(rowValue(item("Annual")))
        assertEquals("12 days", rowValue(item("Pitot-static check")))
        assertEquals("9.7 h", rowValue(item("Oil change")))
        assertEquals(MarkKind.DueSoon, markKind("due_soon"))
        val oil = item("Oil change")
        assertEquals("2.3 h over", overdueText(oil.copy(status = "overdue", hours = oil.hours!!.copy(remaining = -2.3))))
        assertEquals("1 day", rowValue(item("Pitot-static check").let { it.copy(calendar = it.calendar!!.copy(daysLeft = 1)) }))
    }

    @Test
    fun limitsNameTheFirstOnlyWhenThereAreTwo() {
        assertEquals(listOf(LimitText(LimitKind.Hours, "4,222.1 tach", null, false)), limits(item("Oil change"), today))
        val both = item("Annual").copy(hours = item("Oil change").hours!!.copy(projectedDate = "2026-12-12"), first = "hours")
        assertEquals(
            listOf(
                LimitText(LimitKind.Calendar, "Jul 31, 2026", null, false),
                LimitText(LimitKind.Hours, "4,222.1 tach", "about Dec 12", true),
            ),
            limits(both, today),
        )
        assertEquals(listOf("IFR only"), qualifiers(item("Pitot-static check")))
        assertEquals(listOf("advisory"), qualifiers(item("Oil change")))
    }

    @Test
    fun spokenRowsCarryStatusInWords() {
        assertEquals("Annual, overdue, lapsed 110 days ago, due Jul 31, 2026, Airframe", spokenRow(item("Annual"), today))
        assertEquals("Oil change, due soon, 9.7 h left, due 4,222.1 tach, advisory, Engine", spokenRow(item("Oil change"), today))
    }

    @Test
    fun itemDetailWording() {
        assertEquals("end of July 2026 (Jul 31) · lapsed 110 days ago", calendarDue(item("Annual")))
        assertEquals("4,222.1 tach · 9.7 h left", hoursDue(item("Oil change")))
        assertEquals("9.7 h left, no recent flying to date it", projection(item("Oil change"), body.rate, today))
        val rate = body.rate.copy(hoursPerWeek = 1.4, basis = "trailing_90_hobbs")
        val projected = item("Oil change").let { it.copy(hours = it.hours!!.copy(projectedDate = "2026-12-12")) }
        assertEquals("about Dec 12 at your recent 1.4 h a week (from hobbs)", projection(projected, rate, today))
        assertEquals("Jul 20, 2025 at 4,168.3 tach", lastDoneText(item("Annual")))
        assertEquals("May 1, 2024", lastDoneText(item("Transponder check")))
    }

    @Test
    fun syncLineAndFreshness() {
        val at = Instant.parse("2026-11-18T22:54:40Z")
        val utc = ZoneOffset.UTC
        assertEquals("synced 22:54", syncState(snap.computedAt, at.plusSeconds(60), utc))
        assertEquals("synced yesterday 22:54", syncState(snap.computedAt, at.plusSeconds(3600 * 24), utc))
        assertEquals("synced Nov 18", syncState(snap.computedAt, at.plusSeconds(3600 * 72), utc))
        assertEquals("not synced yet", syncState(null, at, utc))
        assertNull(freshness(snap.computedAt, at.plusSeconds(3600), utc))
        assertEquals("From records synced Nov 18, 10:54 PM.", freshness(snap.computedAt, at.plusSeconds(3600 * 7), utc))
    }

    @Test
    fun lineAheadGeometryAndWords() {
        val ahead = body.lineAhead
        assertEquals(LINE_PAST, lineX(today, ahead), 0f)
        assertEquals(1f, lineX(ahead.to, ahead), 0f)
        assertEquals(listOf("Today", "May", "Nov 2027"), lineTicks(ahead).map { it.second })
        assertEquals(
            "Line ahead, next 12 months. Transponder check, overdue. Annual, overdue. ELT inspection, overdue. Pitot-static check, due soon, Nov 30, 2026.",
            lineSummary(ahead, body.items),
        )
        assertEquals("Not on the line: Oil change, needs a date", undatedLines(ahead, body.items).first())
    }
}

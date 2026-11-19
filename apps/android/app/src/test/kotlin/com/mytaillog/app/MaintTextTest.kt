package com.mytaillog.app

import com.mytaillog.core.domain.due.DueItem
import com.mytaillog.core.domain.due.HoursLimit
import com.mytaillog.design.MarkKind
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate

/** Wording and arithmetic of Maintenance, Aircraft, Documents and the flight's "what it moved" (06, 12). */
class MaintTextTest {
    private val today = LocalDate.parse("2026-11-19")

    @Test
    fun adSentencesSayWhetherItRecursItsLastComplianceOrWhyNot() {
        assertEquals(
            "Recurring, every 100 hours. Complied Jul 14, 2026 at 4168.3; next at tach 4268.3, 55.9 h.",
            adSentence("complied", true, 100.0, null, "2026-07-14", 4168.3, null, 4268.3, null, 4212.4),
        )
        assertEquals("One-time. Complied Mar 2, 2019.", adSentence("complied", false, null, null, "2019-03-02", null, null, null, null, 4212.4))
        assertEquals("Reason: a different pump part number is installed.", adSentence("not_applicable", false, null, null, null, null, null, null, "a different pump part number is installed", null))
        assertEquals("One-time. No compliance recorded yet.", adSentence("open", false, null, null, null, null, null, null, null, null))
    }

    @Test
    fun adStatusSettlesOneTimeAndNotApplicableAndTakesTheRestFromTheDueList() {
        assertEquals(MarkKind.Neutral to "Not applicable", adStatus("not_applicable", false, null))
        assertEquals(MarkKind.Neutral to "Complied", adStatus("complied", false, null))
        assertEquals(MarkKind.DueSoon to "Due soon", adStatus("complied", true, item("ad:1", "due_soon")))
        assertEquals(listOf("Overdue", "Due soon", "Current", "Complied", "Not applicable"), listOf("Not applicable", "Complied", "Current", "Overdue", "Due soon").sortedBy(::adRank))
    }

    @Test
    fun itemRulesAndTheEditorPreviewShowBothLimitsAndWhichComesFirst() {
        assertEquals("Required · every 12 calendar months", itemRule(true, 12, null, true))
        assertEquals("Advisory · every 50 hours", itemRule(false, null, 50.0, false))
        // The annual runs to the end of the month.
        assertEquals("2027-07-31" to null, nextDue("annual", "2026-07-14", null, 12, null))
        assertEquals(
            "Next due works out to Jul 31, 2027, or tach 4268.3, the hours first, about Feb 20, 2027.",
            nextDuePreview("annual", "2026-07-14", 4168.3, 12, 100.0, "tach", 4212.4, 0.6, today),
        )
        assertEquals("Next due works out to tach 4262.4.", nextDuePreview("oil_change", null, 4212.4, null, 50.0, "tach", 4212.4, null, today))
        assertNull(nextDuePreview("other", null, null, 12, null, "tach", null, null, today))
    }

    @Test
    fun squawkWordsNeverRestOnColourAlone() {
        assertEquals("Watch · 10 days ago · Dana · 1 photo", squawkMeta("medium", "2026-11-09T10:00:00Z", "Dana Morgan", 1, today))
        assertEquals("Ground", severityWord("high"))
        assertEquals(MarkKind.Overdue, severityMark("high")) // a slip, the word beside it
        assertEquals("Low", severityWord("anything else"))
    }

    @Test
    fun oilBurnAndWeightAndBalance() {
        assertEquals(9.2, hoursPerQuart(listOf(4100.0 to 1.0, 4109.2 to 1.0))!!, 1e-9)
        assertEquals(listOf(9.0, 4.5), burnIntervals(listOf(4100.0 to 1.0, 4109.0 to 1.0, 4118.0 to 2.0)))
        assertNull(hoursPerQuart(listOf(4100.0 to 1.0)))
        assertEquals(57_347.36, moment(1447.80, 39.61, null)!!, 0.01)
        val rev = Rec(buildJsonObject { put("id", "w"); put("revision_date", "2019-05-01") })
        val pump = Rec(buildJsonObject { put("id", "c"); put("name", "Rapco vacuum pump"); put("install_date", "2021-03-02"); put("is_installed", true) })
        assertEquals("Rapco vacuum pump (2021)", staleSince(rev, listOf(pump)))
    }

    @Test
    fun aFlightListsEveryHoursItemItMovedWithBeforeAndAfter() {
        val oil = item("mx:oil", "current", HoursLimit("tach", 4221.9, 9.5, null, "rate", false), "Oil and filter")
        val annual = item("mx:annual", "current", null, "Annual inspection")
        val moved = movedBy(listOf(oil, annual), "tach", 4212.4, 4214.8)
        assertEquals(1, moved.size)
        assertEquals(9.5, moved[0].before, 1e-9)
        assertEquals(7.1, moved[0].after, 1e-9)
        assertEquals("Oil and filter", moved[0].label)
    }

    @Test
    fun readsTheFederalRegisterAndTheTimeChecks() {
        val fr = Json.parseToJsonElement("""{"count":1,"results":[{"title":"Airworthiness Directives; Lycoming Engines","effective_on":"2026-06-01","html_url":"https://fr/x","abstract":"We are adopting…","docket_ids":["FAA-2025-1","AD 2026-11-04"]}]}""").jsonObject
        val ad = parseFoundAds(fr).single()
        assertEquals("2026-11-04", ad.adNumber)
        assertEquals("2026-06-01", ad.effectiveOn)
        val tc = parseTimeChecks(Json.parseToJsonElement("""[{"component":"prop","entryId":"e1","pageRef":{"pageId":"p","label":"Propeller p. 12"},"written":936.5,"calculated":963.5,"result":"apart","difference":27.0,"digitSwap":true,"dismissed":false}]""")).single()
        assertEquals("Propeller p. 12", tc.pageLabel)
        assertEquals(true, tc.apart && tc.digitSwap)
    }

    @Test
    fun documentsCarryAboardAndReadings() {
        assertEquals(listOf("airworthiness_cert", "registration", "poh_afm", "weight_balance"), CARRY_ABOARD)
        assertEquals("PDF · added Jan 2026", docMeta("application/pdf", "2026-01-05T10:00:00Z"))
        assertEquals("from MyFlightBook", readingSource("myflightbook"))
        assertEquals(true, editableReading("tach_photo"))
        assertEquals(false, editableReading("myflightbook"))
    }

    private fun item(key: String, status: String, hours: HoursLimit? = null, label: String = key) = DueItem(
        key, "maintenance", "x", label, "", null, true, false, false, status, null, hours, null, null, null, null, null, null,
    )
}

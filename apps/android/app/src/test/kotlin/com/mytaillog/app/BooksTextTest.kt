package com.mytaillog.app

import com.mytaillog.core.api.Books
import com.mytaillog.core.api.EntryRow
import com.mytaillog.core.api.GapRow
import com.mytaillog.core.api.LogbookRow
import com.mytaillog.core.api.PageRow
import com.mytaillog.core.api.parseMap
import com.mytaillog.core.domain.PushResult
import com.mytaillog.core.domain.map.LayoutOptions
import com.mytaillog.core.domain.map.layoutMap
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

private val json = Json { ignoreUnknownKeys = true }
private fun res(name: String) = BooksTextTest::class.java.classLoader!!.getResource(name)!!.readText()

/** The demo aircraft N734DM as the deployed API served it: 14 pages, 2 waiting for review, 2 being read. */
fun sampleBooks(): Books = Books(
    map = parseMap(res("books-n734dm-map.json")),
    entries = json.decodeFromString(res("books-n734dm-entries.json")),
    pages = json.decodeFromString(res("books-n734dm-pages.json")),
    logbooks = listOf(
        LogbookRow("4d7a696b-901e-47c2-818b-63f434ca39d1", "airframe"),
        LogbookRow("9d28bc25-f9a1-47f8-8bd5-ada761d128f3", "engine"),
        LogbookRow("84eb9ad7-ceb0-4311-bd11-38cdd6a00138", "prop"),
        LogbookRow("91e1b762-b2dd-49a0-a771-c089c6dfbb3f", "avionics"),
        LogbookRow("b744fec3-7f1b-40ee-80a2-3b8c68fccd09", "other"),
    ),
    gaps = listOf(GapRow("4636fcdb-dda9-582d-b7bc-3b2fbd1a1d68", "open", null, "2026-11-19T00:25:23Z")),
)

class BooksTextTest {
    private val b = sampleBooks()

    @Test
    fun structuredDocumentsWithNoEntriesStayVisibleAndRequireWebsiteApproval() {
        val pending = PageRow("doc", "other", extractionStatus = "extracted", needsLook = true, updatedAt = "v1")
        val books = b.copy(pages = b.pages + pending)
        assertTrue(reviewQueue(books).any { it.id == pending.id })
        assertTrue(needsWebsiteReview(books, pending))
        val approved = pending.copy(reviewStatus = "confirmed")
        assertTrue(reviewQueue(b.copy(pages = b.pages + approved)).none { it.id == approved.id })
    }

    @Test
    fun theQueueIsThePagesWithEntriesReadByAiInBookOrder() {
        val q = reviewQueue(b)
        assertEquals(listOf("Airframe p. 6", "Engine p. 3"), q.map { pageLabel(b, it.id) })
        assertEquals(4, q.sumOf { p -> entriesOn(b, p.id).count { it.trust == "ai_read" } })
        assertEquals(2, beingRead(b).size)
    }

    @Test
    fun pagesScannedIntoOtherAreListedAndLinkedFromTheMap() {
        val other = "b744fec3-7f1b-40ee-80a2-3b8c68fccd09"
        // Other is last on the shelf even when the server lists it first, and the map never draws it.
        val shuffled = b.copy(logbooks = b.logbooks.reversed())
        assertEquals(listOf("airframe", "engine", "prop", "avionics", "other"), shelf(shuffled).map { it.type })
        assertTrue(b.map.lines.none { it.lineId == other })
        assertEquals(emptyList<Pair<LogbookRow, Int>>(), offMapBooks(b)) // no Other pages yet: no link under the map
        val scanned = b.copy(pages = b.pages + (1..3).map { PageRow("o$it", other, it, updatedAt = "2026-11-20T00:00:00Z") })
        assertEquals(listOf(other to 3), offMapBooks(scanned).map { it.first.id to it.second })
        assertEquals("Other", bookTitle(scanned, other))
        assertEquals("Other logbook, 3 pages, not drawn on the map.", offMapLine("Other", 3))
        assertEquals("Other logbook, 1 page, not drawn on the map.", offMapLine("Other", 1))
    }

    @Test
    fun theLeastCertainFieldComesFirst() {
        val e = b.entries.first { it.id == "793c6000-3b1e-5629-9539-5e866d60e738" }
        val fields = reviewFields(e)
        assertEquals(Field.Date, fields.first())
        assertTrue(e.doubtful(Field.Date))
        assertFalse(e.doubtful(Field.Tach))
        assertFalse(Field.Hobbs in fields) // no value, no doubt
        assertEquals("Replaced landing light", entryTitle(e))
        assertEquals("Mar 2, 2026 · tach 4,205.8 · M. Torres, A&P 3667012", entryMeta(e))
    }

    @Test
    fun editedValuesParseAtTheBoundary() {
        assertEquals(1874.6, parseField(Field.Tach, "1,874.6").getOrNull())
        assertTrue(parseField(Field.Tach, "18x4").isFailure)
        assertTrue(parseField(Field.Date, "Mar 2").isFailure)
        assertEquals(null, parseField(Field.Work, "  ").getOrNull())
        assertEquals("4205.8", b.entries.first { it.tach == 4205.8 }.editText(Field.Tach))
    }

    @Test
    fun confirmingAPageUpdatesEditedEntriesConfirmsTheRestThenMarksThePage() {
        val page = PageRow("p1", "L1", 6, updatedAt = "t-page")
        val a = EntryRow(id = "a", logbookId = "L1", trust = "ai_read", tach = 1874.6, updatedAt = "t-a")
        val c = EntryRow(id = "c", logbookId = "L1", trust = "ai_read", updatedAt = "t-c")
        val ms = confirmPage("ac", page, listOf(a, c), mapOf(
            "a" to mapOf(Field.Tach to Outcome.Edited("1814.6"), Field.Date to Outcome.NotOnPage),
            "c" to mapOf(Field.Tach to Outcome.LooksRight),
        ))
        assertEquals(listOf("entry.update", "entry.confirm", "page.review"), ms.map { it.type })
        val fields = ms[0].payload["fields"]!!.jsonObject
        assertEquals("1814.6", fields["tach"]!!.jsonPrimitive.content)
        assertTrue("entry_date" in fields)
        assertEquals(listOf("t-a", "t-c", "t-page"), ms.map { it.base })
        // An "edit" that leaves the value as read is just a confirmation.
        assertEquals("entry.confirm", confirmPage("ac", page, listOf(a), mapOf("a" to mapOf(Field.Tach to Outcome.Edited("1874.6"))))[0].type)

        // Undo is based on the rows the confirmation returned.
        val rows = listOf("t-a2", "t-c2", "t-page2").mapIndexed { i, t -> PushResult("$i", PushResult.Status.Ok, buildJsonObject { put("updated_at", JsonPrimitive(t)) }) }
        val undo = undoPage("ac", page, listOf(a, c), rows)
        assertEquals(listOf("t-a2", "t-c2", "t-page2"), undo.map { it.base })
        assertEquals("false", undo[0].payload["confirmed"]!!.jsonPrimitive.content)
        assertEquals("unreviewed", undo[2].payload["status"]!!.jsonPrimitive.content)
    }

    @Test
    fun cleanMatchesTheServerRule() {
        val e = EntryRow(id = "a", logbookId = "L", trust = "ai_read", confidence = 0.9, fieldConfidence = mapOf("tach" to 0.8, "hobbs" to null), updatedAt = "t")
        assertTrue(isClean(e))
        assertFalse(isClean(e.copy(fieldConfidence = mapOf("tach" to 0.6))))
        assertFalse(isClean(e.copy(isContinuation = true)))
    }

    @Test
    fun everyMapElementHasANamedTargetAndTapsFindThem() {
        val layout = layoutMap(b.map, LayoutOptions("phone", renderedWidth = 358.0))
        val all = targets(b, b.map, layout)
        assertEquals(layout.stops.size + layout.interchanges.size + layout.rings.size + layout.segments.mapNotNull { it.gapId }.toSet().size, all.size)
        // Newest first, so TalkBack reads down the map.
        assertEquals(all.sortedBy { it.y }.map { it.target }, all.map { it.target })
        val first = layout.stops.first()
        assertTrue(MapTarget.Stop(first.ids) in hits(layout, all, first.x, first.y, 22.0))
        assertTrue(all.any { it.name.contains("read by AI") })
        val gap = all.first { it.target is MapTarget.Gap }
        assertTrue(gap.target in hits(layout, all, gap.x, gap.y, 22.0))
    }

    @Test
    fun oneBookKeepsOnlyThatBookAndLabelsEveryStop() {
        val m = shownModel(b, "engine")
        assertEquals(listOf("engine"), m.lines.map { it.logbook })
        assertTrue(m.stops.isNotEmpty() && m.stops.all { it.major && it.label != null })
        assertTrue(m.interchanges.isEmpty())
        val layout = layoutMap(m, LayoutOptions("phone", renderedWidth = 358.0))
        assertEquals(m.stops.size, layout.stops.size)
    }
}

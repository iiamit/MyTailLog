package com.mytaillog.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

class CaptureLogicTest {
    /** A dark table with a bright quadrilateral page; corners in grid pixels. */
    private fun frame(w: Int, h: Int, quad: List<Pair<Float, Float>>?, table: Int = 60, page: Int = 220): IntArray {
        val out = IntArray(w * h) { table }
        quad ?: return out
        fun inside(x: Float, y: Float): Boolean {
            var s = 0
            for (i in quad.indices) {
                val (ax, ay) = quad[i]; val (bx, by) = quad[(i + 1) % quad.size]
                val cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax)
                s += if (cross >= 0) 1 else -1
            }
            return abs(s) == quad.size
        }
        for (y in 0 until h) for (x in 0 until w) if (inside(x + 0.5f, y + 0.5f)) out[y * w + x] = page
        return out
    }

    @Test
    fun findsATiltedPageAndItsCorners() {
        val q = listOf(30f to 12f, 130f to 20f, 124f to 110f, 24f to 104f)
        val f = PageFinder.find(frame(160, 120, q), 160, 120)
        assertEquals(PageHint.HoldStill, f.hint)
        val quad = assertNotNullQuad(f.quad)
        assertEquals(30f / 160, quad.tl.x, 0.02f); assertEquals(12f / 120, quad.tl.y, 0.02f)
        assertEquals(124f / 160, quad.br.x, 0.02f); assertEquals(110f / 120, quad.br.y, 0.02f)
    }

    @Test
    fun saysWhatIsWrongWhenThereIsNoPage() {
        assertEquals(PageHint.MoreLight, PageFinder.find(frame(160, 120, null, table = 20), 160, 120).hint)
        // Too small: under a quarter of the frame.
        assertEquals(PageHint.Looking, PageFinder.find(frame(160, 120, listOf(60f to 40f, 90f to 40f, 90f to 70f, 60f to 70f)), 160, 120).hint)
        // Cut by the frame on two sides.
        assertEquals(PageHint.MoveBack, PageFinder.find(frame(160, 120, listOf(-10f to -10f, 150f to -10f, 150f to 130f, -10f to 130f)), 160, 120).hint)
        // A bright blob that isn't page-shaped (a triangle).
        assertNull(PageFinder.find(frame(160, 120, listOf(10f to 110f, 150f to 110f, 80f to 5f)), 160, 120).quad)
    }

    @Test
    fun rotatesOutlinesIntoTheUprightFrame() {
        val q = Quad(Pt(0.1f, 0.2f), Pt(0.9f, 0.2f), Pt(0.9f, 0.8f), Pt(0.1f, 0.8f))
        val r = q.rotated(90)
        assertEquals(Pt(0.2f, 0.1f).x, r.tl.x, 1e-4f)
        assertEquals(0.1f, r.tl.y, 1e-4f)
        assertEquals(q, q.rotated(360))
    }

    @Test
    fun steadyShotFiresOncePerPageAfterSixHundredMilliseconds() {
        val s = SteadyShot()
        val q = Quad(Pt(0.1f, 0.1f), Pt(0.9f, 0.1f), Pt(0.9f, 0.9f), Pt(0.1f, 0.9f))
        assertFalse(s.update(q, true, 0))
        assertFalse(s.update(q, true, 300))
        assertFalse(s.update(q, false, 500)) // the phone moved: start again
        assertFalse(s.update(q, true, 600))
        assertFalse(s.update(q, true, 1100))
        assertTrue(s.update(q, true, 1300))
        assertFalse(s.update(q, true, 2500)) // the same page is not taken twice
        assertFalse(s.update(null, true, 2600)) // page turned
        assertFalse(s.update(q, true, 2700))
        assertFalse(s.update(q, true, 2800))
        assertTrue(s.update(q, true, 3400))
    }

    @Test
    fun dHashIsSixteenHexCharacters() {
        assertEquals("ffffffffffffffff", dHash(IntArray(72) { it % 9 }))
        assertEquals("0000000000000000", dHash(IntArray(72) { 5 }))
    }

    @Test
    fun readsTheYearsOnAPageAndSaysWhereItLands() {
        val text = "6/11/84 Annual inspection\nJun 11, 1984 oil change 12-3-1985\n99/99/99 not a date"
        val years = PageDates.years(text, 2026)
        assertEquals(listOf(1984, 1985, 1984), years)
        assertEquals(1984, PageDates.median(years))
        assertNull(PageDates.median(emptyList()))
        assertEquals("Lands in 1984, inside the airframe gap", PageDates.landsIn(1984, "Airframe", listOf(1983..1991), emptyList()))
        assertEquals("Lands in 1993, after page 203", PageDates.landsIn(1993, "Airframe", listOf(1983..1991), listOf(203 to 1993, 204 to 1995, 12 to 1980)))
        assertEquals(2024, PageDates.years("1/2/24", 2026).single())
        assertEquals(1999, PageDates.years("1/2/99", 2026).single())
    }

    @Test
    fun tachCandidatesReadDrumsAndTenths() {
        assertTrue(4214.8 in TachReader.candidates("4 2 1 4 8"))
        assertTrue(4214.8 in TachReader.candidates("HOURS 4214.8"))
        assertEquals(4214.8, TachReader.pick("42148", last = 4212.4, days = 1)!!, 1e-9)
        // Lower than the last reading, or beyond 24 h a day, is never offered.
        assertNull(TachReader.pick("4200.1", last = 4212.4, days = 1))
        assertNull(TachReader.pick("4260.0", last = 4212.4, days = 1))
        assertEquals(4212.4 + 100, TachReader.ceiling(4212.4, 30), 1e-9)
        // Nothing known yet: the longest run wins.
        assertEquals(4214.8, TachReader.pick("TACH 4214.8", last = null, days = 1)!!, 1e-9)
    }

    @Test
    fun aValueIsFoundAfterThreeFramesInARow() {
        val v = FrameVote()
        assertNull(v.update(4214.8)); assertNull(v.update(4214.8)); assertEquals(4214.8, v.update(4214.8)!!, 0.0)
        val w = FrameVote()
        assertNull(w.update(4214.8)); assertNull(w.update(4214.3)); assertNull(w.update(4214.8)); assertNull(w.update(null))
    }

    @Test
    fun confirmWarnsAboutLowerAndLargeReadings() {
        assertEquals("Lower than the last reading (4212.4). Is this a new meter?", tachWarning(4200.0, 4212.4, "2026-11-14", 1))
        assertEquals("That's 31.0 hours since Nov 14. Check it.", tachWarning(4243.4, 4212.4, "2026-11-14", 4))
        assertNull(tachWarning(4214.8, 4212.4, "2026-11-14", 1))
        assertEquals("Flight, tach 4212.4 to 4214.8", flightLabel(4212.4, 4214.8))
        assertEquals("Flight saved. Logged 2.4 h, tach 4214.8.", savedLine(4214.8, 4212.4))
    }

    @Test
    fun theGuideCropMatchesACentreCroppedPreview() {
        // 1080×1920 view over a 1080×1440 frame: scaled 1.333, guide 840×360 px → 756×324 frame px with padding.
        val r = guideRect(1080, 1440, 1080, 1920, 840f, 360f)
        assertEquals(756, r[2]); assertEquals(324, r[3])
        assertEquals((1080 - 756) / 2, r[0]); assertEquals((1440 - 324) / 2, r[1])
    }

    @Test
    fun syncLineAndBarsSayWhatIsOnThePhone() {
        val base = SyncState()
        assertEquals("synced 9:38", syncLineState(base, "synced 9:38"))
        assertEquals("offline", syncLineState(base.copy(online = false), "synced 9:38"))
        assertEquals("3 waiting", syncLineState(base.copy(waiting = 1, pages = 2), "x"))
        assertEquals("1 to decide", syncLineState(base.copy(conflicts = 1, waiting = 4), "x"))
        assertEquals("sync failed", syncLineState(base.copy(failed = true), "x"))
        assertNull(offlineBarText(base))
        assertEquals("Offline. Everything here works except reading pages and Ask.", offlineBarText(base.copy(online = false)))
        assertEquals("3 changes on this phone. They upload when you have signal.", offlineBarText(base.copy(online = false, waiting = 3)))
        assertEquals("2 pages on this phone. They upload when you have signal.", offlineBarText(base.copy(online = false, pages = 2)))
        assertEquals("Uploading 1 of 2", offlineBarText(base.copy(uploading = 0 to 2, pages = 2)))
        assertEquals("3 changes and 2 pages on this phone.", summaryLine(3, 2))
        assertEquals("Uploading 2 pages to N734QA", uploadingText(2, "N734QA"))
        assertEquals("Pages are read when you have signal.", allowanceLine(Allowance(31, 50, false, false), online = false))
        assertEquals(
            "Reading allowance today: 31 of 50 pages used, shared by your aircraft. Pages past it wait for tomorrow.",
            allowanceLine(Allowance(31, 50, false, false), online = true),
        )
    }

    @Test
    fun offlineBatchProgressCountsLikeTheServer() {
        val b = batchProgress("b", null, 4, listOf(Triple("extracted", true, false), Triple("queued", false, true), Triple("processing", false, false)))
        assertEquals(3, b.uploaded); assertEquals(1, b.read); assertEquals(1, b.needsLook); assertEquals(1, b.queued); assertEquals(1, b.reading); assertEquals(1, b.waitingDecision)
    }

    private fun assertNotNullQuad(q: Quad?): Quad { assertNotNull(q); return q!! }
}

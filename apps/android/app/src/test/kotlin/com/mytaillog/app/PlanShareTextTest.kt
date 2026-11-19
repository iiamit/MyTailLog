package com.mytaillog.app

import com.google.zxing.BinaryBitmap
import com.google.zxing.RGBLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader
import com.mytaillog.core.domain.due.VisitItem
import com.mytaillog.core.domain.due.VisitView
import com.mytaillog.core.domain.due.Visits
import com.mytaillog.core.domain.due.planDate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/** Phase 5's words and geometry: the plan horizon, the statement, visits, record room rows and the QR. */
class PlanShareTextTest {
    private val body = sampleSnapshot().body

    @Test fun firstSixMonthsAreDrawnAtDoubleScale() {
        val s = PlanScale(LocalDate.parse("2026-11-18"))
        assertEquals(0f, s.x(s.today), 0f)
        assertEquals(1f, s.x(s.end), 0f)
        // Six months of 24 get 2/(2+3) of the width.
        assertEquals(0.4f, s.x(s.today.plusMonths(6)), 0.01f)
        // Every day round-trips through the scrubber.
        var d = s.today.plusDays(1)
        while (d <= s.end) { assertEquals(d, s.date(s.x(d))); d = d.plusDays(7) }
        assertEquals(s.today.plusDays(1), s.date(-1f))
    }

    @Test fun statementCountsWhatLapsesAndTheVisitsThatCoverIt() {
        val p = planDate(body, "2027-03-01")
        val (text, bold) = planStatement(p, LocalDate.parse(body.today))
        val n = lapsedBy(p).size
        assertTrue(text, text.startsWith("By Mar 1, 2027, ${word(n)} items lapse unless they are done."))
        assertEquals("Mar 1, 2027", text.substring(bold))
        val keys = lapsedBy(p).map { it.key }
        val visit = VisitView(null, "abcdef0123456789", "suggested", "2026-11-23", null, "KDEMO", emptyList(), keys.map { VisitItem(it, null, "overdue", false) }, 0, emptyList())
        val covered = planDate(body.copy(visits = Visits(listOf(visit))), "2027-03-01")
        assertTrue(planStatement(covered, LocalDate.parse(body.today)).first.endsWith("unless the visit happens."))
        assertEquals(visit, coveringVisit(lapsedBy(covered).first().coveredByVisit, listOf(visit)))
        assertEquals("By Nov 19, nothing tracked lapses.", planStatement(planDate(body.copy(items = emptyList()), "2026-11-19"), LocalDate.parse(body.today)).first)
    }

    @Test fun visitsInWords() {
        val items = body.items.take(2)
        val v = VisitView(null, "s", "suggested", "2026-12-07", null, "", emptyList(), listOf(VisitItem(items[0].key, null, "overdue", false), VisitItem(items[1].key, null, "due_soon", false)), 1, emptyList())
        assertEquals("One visit, two items: one before it comes due, and the ${items[0].label.replaceFirstChar { it.lowercase() }} that has lapsed.", visitStatement(v, body.items))
        assertEquals("s:s", visitKey(v))
        assertEquals(LocalDate.parse("2026-12-07"), mondayOf(LocalDate.parse("2026-12-10")))
        val msg = visitMessage("N734DM", null, v, body.items, "https://x/m/abc")
        assertTrue(msg, msg.contains("- ${items[0].label}") && msg.endsWith("https://x/m/abc\n"))
        assertEquals("Planned", visitStatusWord("planned"))
    }

    @Test fun roomsReadTheServerRow() {
        val json = """[{"id":"r1","label":"Pre-buy for J. Okafor","audience":"buyer","cover":"map","mapWindow":"whole_life",
            "includes":{"summary":true,"dossier":true,"logbookIds":["a","b"],"scans":true,"documentIds":["d"],"squawks":false,"reporters":false,"gapsNote":true},
            "url":"https://mytaillog.com/r/abc","createdAt":"2026-11-18T10:00:00Z","expiresAt":"2026-12-18T10:00:00Z","revokedAt":null,"active":true,"opens":3,"lastOpenedAt":"2026-11-17T09:00:00Z"}]"""
        val r = parseRooms(json).single()
        val now = Instant.parse("2026-11-18T12:00:00Z")
        assertEquals("Expires Dec 18 · opened 3 times · last Nov 17", roomLine(r, now, ZoneOffset.UTC))
        assertEquals("Dec 18, 2026, in 30 days", roomExpiry(r, now, ZoneOffset.UTC))
        assertEquals("2 logbooks with their scans, 1 document and the maintenance summary", roomHolds(r))
        assertEquals("mytaillog.com/r/abc", shortUrl(r.url!!))
        assertEquals("revoked Nov 18", roomExpiry(r.copy(revokedAt = "2026-11-18T11:00:00Z", active = false), now, ZoneOffset.UTC))
        assertTrue(isRoomList(json)); assertTrue(!isRoomList("""{"error":"x"}"""))
        assertNull(parseRooms("""{"error":"x"}""").firstOrNull())
        assertEquals(listOf("Status", "Logbooks"), parseOpens("""[{"openedAt":"2026-11-17T09:41:00Z","lastAt":"2026-11-17T09:50:00Z","sections":["status","logbooks"]}]""").single().sections.map { it.replaceFirstChar(Char::uppercase) })
    }

    @Test fun aNewRoomSaysWhatItHolds() {
        val d = RoomDraft.of(Audience.Insurer, "N734DM", listOf("a"), listOf("d"))
        val b = d.body()
        assertEquals("insurer", b.s("audience")); assertEquals("last_5_years", b.s("mapWindow")); assertEquals(14.0, b.d("expiresInDays"))
        assertEquals("[]", b["logbookIds"].toString()); assertEquals("[\"d\"]", b["documentIds"].toString())
        assertTrue(!d.copy(summary = false, documentIds = emptySet()).holdsSomething)
    }

    @Test fun theQrEncodesExactlyTheShownLink() {
        val url = "https://mytaillog.com/r/Abc_DEF-0123456789abcdefghijklmnopqrstuvwxyzAB"
        val m = qrMatrix(url)
        val k = 4 // pixels per module; the 220 dp card draws them larger still
        val q = 4 * k // the quiet zone the card's padding gives on screen
        val w = m.width * k + 2 * q
        val px = IntArray(w * w) { i -> val x = Math.floorDiv(i % w - q, k); val y = Math.floorDiv(i / w - q, k); if (x in 0 until m.width && y in 0 until m.height && m[x, y]) 0xFF000000.toInt() else -1 }
        val text = QRCodeReader().decode(BinaryBitmap(HybridBinarizer(RGBLuminanceSource(w, w, px)))).text
        assertEquals(url, text)
    }
}

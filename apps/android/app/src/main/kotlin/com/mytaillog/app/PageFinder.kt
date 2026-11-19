package com.mytaillog.app

import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max

/** A point as fractions of the frame (0..1), upright. */
data class Pt(val x: Float, val y: Float)

/** A page outline, corners from top-left clockwise, in upright frame fractions. */
data class Quad(val tl: Pt, val tr: Pt, val br: Pt, val bl: Pt) {
    val corners get() = listOf(tl, tr, br, bl)

    /** The largest distance any corner moved, in frame fractions. */
    fun moved(o: Quad) = corners.zip(o.corners).maxOf { (a, b) -> hypot(a.x - b.x, a.y - b.y) }

    /** This outline in an image rotated by [degrees] clockwise (CameraX's rotationDegrees), corners re-ordered. */
    fun rotated(degrees: Int): Quad {
        val f: (Pt) -> Pt = when (((degrees % 360) + 360) % 360) {
            90 -> { p -> Pt(1 - p.y, p.x) }
            180 -> { p -> Pt(1 - p.x, 1 - p.y) }
            270 -> { p -> Pt(p.y, 1 - p.x) }
            else -> { p -> p }
        }
        return of(corners.map(f))
    }

    companion object {
        /** Order four points as TL, TR, BR, BL by the sums and differences of their coordinates. */
        fun of(p: List<Pt>) = Quad(
            p.minBy { it.x + it.y }, p.maxBy { it.x - it.y }, p.maxBy { it.x + it.y }, p.minBy { it.x - it.y },
        )
    }
}

/** What the camera says under the preview (06 M-SCAN-02). */
enum class PageHint { Looking, HoldStill, MoveBack, MoreLight }

data class Finding(val quad: Quad?, val hint: PageHint)

/**
 * Page edge detection for ScanCamera (05 §15.1), on a small luminance grid of each analysis frame.
 * A logbook page is the large bright region against a darker table: Otsu threshold, the largest bright
 * connected region, its four extreme corners, and checks that it is page-shaped and covers ≥ 25%.
 * shortcut: a brightness heuristic instead of OpenCV's Canny + approxPolyDP (the OpenCV AAR is 112 MB and
 * untestable on the JVM); a white page on a white table is not found and the shutter is used instead.
 */
object PageFinder {
    private const val MIN_AREA = 0.25f
    private const val MIN_FILL = 0.85f

    fun find(lum: IntArray, w: Int, h: Int): Finding {
        val n = w * h
        if (n == 0 || lum.size < n) return Finding(null, PageHint.Looking)
        if (lum.take(n).average() < 45) return Finding(null, PageHint.MoreLight)
        val t = otsu(lum, n)
        val seen = BooleanArray(n)
        val queue = IntArray(n)
        var best: Region? = null
        for (start in 0 until n) {
            if (seen[start] || lum[start] <= t) continue
            val r = Region()
            var head = 0; var tail = 0
            queue[tail++] = start; seen[start] = true
            while (head < tail) {
                val i = queue[head++]
                val x = i % w; val y = i / w
                r.add(x, y, w, h)
                if (x > 0) { val j = i - 1; if (!seen[j] && lum[j] > t) { seen[j] = true; queue[tail++] = j } }
                if (x < w - 1) { val j = i + 1; if (!seen[j] && lum[j] > t) { seen[j] = true; queue[tail++] = j } }
                if (y > 0) { val j = i - w; if (!seen[j] && lum[j] > t) { seen[j] = true; queue[tail++] = j } }
                if (y < h - 1) { val j = i + w; if (!seen[j] && lum[j] > t) { seen[j] = true; queue[tail++] = j } }
            }
            if (best == null || r.count > best.count) best = r
        }
        val r = best ?: return Finding(null, PageHint.Looking)
        // A page cut by the frame touches its edges along a long stretch.
        if (r.edge > (w + h) * 0.5f) return Finding(null, PageHint.MoveBack)
        if (r.count < n * MIN_AREA) return Finding(null, PageHint.Looking)
        val quad = Quad(r.tl.norm(w, h), r.tr.norm(w, h), r.br.norm(w, h), r.bl.norm(w, h))
        val area = area(quad)
        // Four distinct corners: a triangle or a blob shares extremes and is not a page.
        val c = quad.corners
        val distinct = c.indices.all { i -> (i + 1 until c.size).all { j -> hypot(c[i].x - c[j].x, c[i].y - c[j].y) > 0.1f } }
        if (!distinct || area < MIN_AREA || r.count.toFloat() / n < MIN_FILL * area) return Finding(null, PageHint.Looking)
        return Finding(quad, PageHint.HoldStill)
    }

    /** Shoelace area in frame fractions. */
    fun area(q: Quad): Float {
        val c = q.corners
        var s = 0f
        for (i in c.indices) { val a = c[i]; val b = c[(i + 1) % c.size]; s += a.x * b.y - b.x * a.y }
        return abs(s) / 2
    }

    private fun otsu(lum: IntArray, n: Int): Int {
        val hist = IntArray(256)
        for (i in 0 until n) hist[lum[i].coerceIn(0, 255)]++
        val total = n.toDouble()
        val sumAll = (0..255).sumOf { it.toDouble() * hist[it] }
        var sumB = 0.0; var wB = 0.0; var bestVar = -1.0; var bestT = 127
        for (t in 0..255) {
            wB += hist[t]
            if (wB == 0.0) continue
            val wF = total - wB
            if (wF == 0.0) break
            sumB += t.toDouble() * hist[t]
            val mB = sumB / wB; val mF = (sumAll - sumB) / wF
            val v = wB * wF * (mB - mF) * (mB - mF)
            if (v > bestVar) { bestVar = v; bestT = t }
        }
        return bestT
    }

    private class Region {
        var count = 0; var edge = 0
        var tl = IntArray(2); var tr = IntArray(2); var br = IntArray(2); var bl = IntArray(2)
        private var minSum = Int.MAX_VALUE; private var maxSum = Int.MIN_VALUE
        private var minDiff = Int.MAX_VALUE; private var maxDiff = Int.MIN_VALUE
        fun add(x: Int, y: Int, w: Int, h: Int) {
            count++
            if (x == 0 || y == 0 || x == w - 1 || y == h - 1) edge++
            if (x + y < minSum) { minSum = x + y; tl = intArrayOf(x, y) }
            if (x + y > maxSum) { maxSum = x + y; br = intArrayOf(x, y) }
            if (x - y > maxDiff) { maxDiff = x - y; tr = intArrayOf(x, y) }
            if (x - y < minDiff) { minDiff = x - y; bl = intArrayOf(x, y) }
        }
    }

    private fun IntArray.norm(w: Int, h: Int) = Pt((this[0] + 0.5f) / w, (this[1] + 0.5f) / h)
}

/**
 * "Hold still" and auto-capture (05 §15.1): corners move < 2% of the frame diagonal for 0.6 s while the
 * phone is still. Fires once per page; re-arms when the page leaves or moves well away (the next page).
 */
class SteadyShot(private val needMs: Long = 600, private val tolerance: Float = 0.02f * 1.4142f) {
    private var last: Quad? = null
    private var since: Long? = null
    private var taken: Quad? = null

    fun update(q: Quad?, still: Boolean, now: Long): Boolean {
        val prev = last
        last = q
        if (q == null) { since = null; taken = null; return false }
        taken?.let { if (q.moved(it) > 0.1f) taken = null }
        if (prev == null || !still || q.moved(prev) > tolerance) { since = null; return false }
        val start = since ?: now.also { since = it }
        if (taken != null || now - start < needMs) return false
        taken = q
        since = null
        return true
    }
}

/** 64-bit dHash (09 §3.9.3) of a 9×8 luminance grid, row-major: 16 hex characters. */
fun dHash(gray9x8: IntArray): String {
    require(gray9x8.size == 72)
    var bits = 0UL
    for (y in 0 until 8) for (x in 0 until 8) {
        bits = (bits shl 1) or if (gray9x8[y * 9 + x] < gray9x8[y * 9 + x + 1]) 1UL else 0UL
    }
    return bits.toString(16).padStart(16, '0')
}

/** Where the page lands in time (05 §15.1): the years of the dates legible on the page. */
object PageDates {
    private val NUMERIC = Regex("""\b(\d{1,2})\s?[/.-]\s?(\d{1,2})\s?[/.-]\s?(\d{4}|\d{2})\b""")
    private val NAMED = Regex("""\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b""", RegexOption.IGNORE_CASE)

    fun years(text: String, thisYear: Int): List<Int> {
        val out = mutableListOf<Int>()
        for (m in NUMERIC.findAll(text)) {
            val (mo, d, y) = m.destructured
            if (mo.toInt() !in 1..12 || d.toInt() !in 1..31) continue
            out += fullYear(y, thisYear) ?: continue
        }
        for (m in NAMED.findAll(text)) {
            if (m.groupValues[2].toInt() !in 1..31) continue
            out += fullYear(m.groupValues[3], thisYear) ?: continue
        }
        return out
    }

    private fun fullYear(y: String, thisYear: Int): Int? {
        val v = y.toInt()
        val full = if (y.length == 2) (if (2000 + v > thisYear) 1900 + v else 2000 + v) else v
        return full.takeIf { it in 1900..thisYear }
    }

    /** The median year, or null when no date was read (then the line is omitted). */
    fun median(years: List<Int>) = years.sorted().takeIf { it.isNotEmpty() }?.let { it[(it.size - 1) / 2] }

    /**
     * "Lands in 1984, inside the airframe gap" / "Lands in 1993, after page 203". [gaps] are the book's
     * gap years; [pageYears] is (page number, latest entry year on it) for the pages already read.
     */
    fun landsIn(year: Int, book: String, gaps: List<IntRange>, pageYears: List<Pair<Int, Int>>): String {
        if (gaps.any { year in it }) return "Lands in $year, inside the ${book.lowercase()} gap"
        val after = pageYears.filter { it.second <= year }.maxOfOrNull { it.first }
        return if (after != null) "Lands in $year, after page $after" else "Lands in $year"
    }
}

/** The fraction of the frame's luminance grid sampled from a camera Y plane, [step] pixels apart. */
fun sampleLuma(plane: java.nio.ByteBuffer, rowStride: Int, pixelStride: Int, width: Int, height: Int, step: Int): Triple<IntArray, Int, Int> {
    val w = max(1, width / step); val h = max(1, height / step)
    val out = IntArray(w * h)
    for (y in 0 until h) for (x in 0 until w) {
        out[y * w + x] = plane.get(y * step * rowStride + x * step * pixelStride).toInt() and 0xff
    }
    return Triple(out, w, h)
}

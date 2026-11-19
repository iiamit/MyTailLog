package com.mytaillog.app

import kotlin.math.abs
import kotlin.math.min

/**
 * Reading the tach on the phone (05 §16, C-HOURS-03): candidates are runs of 3 to 6 digits with or
 * without a point; a mechanical meter shows tenths on the last drum, so a run without a point is also
 * tried as value / 10. Only plausible values are offered: at least the last reading and at most
 * last + 24 h per day since it (capped at +100 h). Ranked by closeness to last + a typical flight.
 */
object TachReader {
    private val RUN = Regex("""\d{3,6}(?:\.\d{1,2})?|\d{1,5}\.\d{1,2}""")

    fun candidates(text: String): List<Double> {
        // Drums are often read as separate characters: "4 2 1 4 8".
        val joined = text.replace(Regex("""(?<=\d)[ ,](?=\d)"""), "")
        return RUN.findAll(joined).flatMap { m ->
            val v = m.value.toDoubleOrNull() ?: return@flatMap emptySequence()
            if ('.' in m.value) sequenceOf(v) else sequenceOf(v, v / 10)
        }.distinct().toList()
    }

    /** The upper bound a reading can plausibly reach [days] after [last]. */
    fun ceiling(last: Double, days: Long) = last + min(24.0 * maxOf(days, 1), 100.0)

    fun plausible(v: Double, last: Double?, days: Long) = last == null || (v >= last && v <= ceiling(last, days))

    /** The best plausible value in [text], or null. [typical] is the recent median flight, in hours. */
    fun pick(text: String, last: Double?, days: Long, typical: Double = 1.5): Double? {
        val ok = candidates(text).filter { plausible(it, last, days) }
        if (last == null) return ok.maxByOrNull { it.toString().length }
        return ok.minByOrNull { abs(it - (last + typical)) }
    }
}

/** "A value is found when the same candidate wins 3 consecutive frames" (05 §16). */
class FrameVote(private val need: Int = 3) {
    private var value: Double? = null
    private var count = 0

    fun update(v: Double?): Double? {
        if (v == null || v != value) { value = v; count = if (v == null) 0 else 1 } else count++
        return if (count >= need) v else null
    }
}

/** M-FLIGHT-03's checks on a reading the owner is about to save (07 F07 branches). Null when it looks right. */
fun tachWarning(value: Double, last: Double?, lastDate: String?, days: Long): String? {
    last ?: return null
    if (value < last) return "Lower than the last reading (${fmtHours(last)}). Is this a new meter?"
    val jump = value - last
    if (jump > 24) return "That's ${fmtHours(jump)} hours since ${lastDate?.let(::shortDate) ?: "the last reading"}. Check it."
    return null
}

fun fmtHours(v: Double) = String.format(java.util.Locale.US, "%.1f", v)

private fun shortDate(iso: String) = runCatching {
    java.time.LocalDate.parse(iso.take(10)).format(java.time.format.DateTimeFormatter.ofPattern("MMM d", java.util.Locale.US))
}.getOrDefault(iso)

package com.mytaillog.core.domain.due

import kotlinx.serialization.Serializable
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max

// Port of apps/web/src/lib/due/plan.ts (08 C-PLAN-01, 09 §3.3 meter on a date, §4.4), the phones' offline subset
// 09 §3.12 item 5. packages/shared/fixtures/plan-date.json pins both. Change one, change both and regenerate.

@Serializable data class Spare(val days: Int? = null, val hours: Double? = null)
@Serializable data class PlanLapse(val key: String, val `when`: String, val dueDate: String?, val coveredByVisit: String?)
@Serializable data class PlanSpare(val key: String, val spare: Spare)
@Serializable data class PlanCannot(val key: String, val reason: String)
@Serializable data class MetersOnDate(val tach: Double?, val hobbs: Double?)
@Serializable data class PlanResult(
    val date: String,
    val hoursPerWeek: Double?,
    val hoursUntil: Double?,
    val metersOnDate: MetersOnDate,
    val lapsed: List<PlanLapse>,
    val lapses: List<PlanLapse>,
    val stillInDate: List<PlanSpare>,
    val cannotCheck: List<PlanCannot>,
)

private fun r1(x: Double): Double = floor(x * 10 + 0.5) / 10

/**
 * `hoursPerWeek` null → the rate in use rounded to 0.5 h; with no recent flying and no estimate, hours limits
 * cannot be checked. 0 → no flying, so only calendar limits can lapse.
 */
fun planDate(status: StatusBody, date: String, hoursPerWeek: Double? = null): PlanResult {
    val days = max(0, Dates.between(status.today, date))
    val rate = hoursPerWeek ?: if (status.rate.basis == "none") null else floor(status.rate.hoursPerWeek * 2 + 0.5) / 2
    val hoursUntil = rate?.let { r1(it / 7 * days) }
    fun meter(m: String): Double? {
        val face = status.meters[m]?.face ?: return null
        return hoursUntil?.let { r1(face + it) }
    }

    val covering = mutableMapOf<String, String>()
    for (v in status.visits.suggested) for (i in v.items) if (i.key !in covering) covering[i.key] = "sugg:${v.suggestionKey}"
    for (v in status.visits.planned) for (i in v.items) if (v.id != null) covering[i.key] = v.id

    val lapsed = mutableListOf<PlanLapse>()
    val lapses = mutableListOf<PlanLapse>()
    val still = mutableListOf<PlanSpare>()
    val cannot = mutableListOf<PlanCannot>()
    for (item in status.items) {
        val covered = covering[item.key]
        if (item.status == "overdue") {
            lapsed.add(PlanLapse(item.key, "already", item.firstDate ?: item.calendar?.dueDate, covered)); continue
        }
        if (item.status == "no_record") {
            cannot.add(PlanCannot(item.key, if (item.source == "document") "no_date" else "no_record")); continue
        }
        val cal = item.calendar
        val hrs = item.hours
        if (cal == null && hrs == null) { cannot.add(PlanCannot(item.key, "no_date")); continue }
        if (cal == null && hoursUntil == null) { cannot.add(PlanCannot(item.key, "no_recent_flying")); continue }

        val calLapse = if (cal != null && cal.dueDate < date) cal.dueDate else null
        val hrsLapse = if (hrs != null && hoursUntil != null && rate!! > 0 && hrs.remaining <= hoursUntil)
            Dates.addDays(status.today, ceil(hrs.remaining / (rate / 7)).toLong()) else null
        val lapse = listOfNotNull(calLapse, hrsLapse).minOrNull()
        if (lapse != null) { lapses.add(PlanLapse(item.key, "by_date", lapse, covered)); continue }
        still.add(PlanSpare(item.key, Spare(
            days = cal?.let { Dates.between(date, it.dueDate) },
            hours = if (hrs != null && hoursUntil != null) r1(hrs.remaining - hoursUntil) else null,
        )))
    }
    val order = compareBy<PlanLapse>({ it.dueDate ?: "9999" }, { it.key })
    return PlanResult(date, rate, hoursUntil, MetersOnDate(meter("tach"), meter("hobbs")), lapsed.sortedWith(order), lapses.sortedWith(order), still, cannot)
}

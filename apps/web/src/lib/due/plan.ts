import { addDays, daysBetween, type StatusBody } from "./engine";

// ===========================================================================
// Plan ahead for a date (08 C-PLAN-01, 09 §3.3 meter-on-a-date, §4.4): which items will have lapsed by `date` if the
// aircraft flies `hoursPerWeek` until then. Pure, on top of a computed status, so the web scrubber, the
// POST /plan endpoint and the phones (apps/core .../due/PlanDate.kt, fixture plan-date.json) give the same answer.
// Change one, change both and regenerate the fixtures. Relative imports only: the fixture generator runs this outside Next.
// ===========================================================================

export type PlanLapse = { key: string; when: "already" | "by_date"; dueDate: string | null; coveredByVisit: string | null };
export type PlanSpare = { key: string; spare: { days?: number; hours?: number } };
export type PlanCannot = { key: string; reason: "no_date" | "no_record" | "no_recent_flying" };
export type PlanResult = {
  date: string;
  hoursPerWeek: number | null;
  hoursUntil: number | null;
  metersOnDate: { tach: number | null; hobbs: number | null };
  lapsed: PlanLapse[];
  lapses: PlanLapse[];
  stillInDate: PlanSpare[];
  cannotCheck: PlanCannot[];
};

const round1 = (x: number) => Math.round(x * 10) / 10;
const byDate = (a: { dueDate: string | null; key: string }, b: { dueDate: string | null; key: string }) =>
  (a.dueDate ?? "9999") < (b.dueDate ?? "9999") ? -1 : (a.dueDate ?? "9999") > (b.dueDate ?? "9999") ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0;

/**
 * `hoursPerWeek` null → the rate in use, rounded to 0.5 h (W-STATUS-03); with no recent flying and no estimate, hours
 * limits cannot be checked. 0 → no flying, so only calendar limits can lapse.
 */
export function planDate(status: StatusBody, date: string, hoursPerWeek: number | null = null): PlanResult {
  const days = Math.max(0, daysBetween(status.today, date));
  const rate = hoursPerWeek ?? (status.rate.basis === "none" ? null : Math.round(status.rate.hoursPerWeek * 2) / 2);
  const hoursUntil = rate == null ? null : round1((rate / 7) * days);
  const meter = (m: "tach" | "hobbs") => {
    const face = status.meters[m].face;
    return face == null || hoursUntil == null ? null : round1(face + hoursUntil);
  };

  // The visit that would clear an item: the planned one holding it, else a suggested one listing it.
  const covering = new Map<string, string>();
  for (const v of status.visits.suggested) for (const i of v.items) if (!covering.has(i.key)) covering.set(i.key, `sugg:${v.suggestionKey}`);
  for (const v of status.visits.planned) for (const i of v.items) if (v.id) covering.set(i.key, v.id);

  const out: PlanResult = { date, hoursPerWeek: rate, hoursUntil, metersOnDate: { tach: meter("tach"), hobbs: meter("hobbs") }, lapsed: [], lapses: [], stillInDate: [], cannotCheck: [] };
  for (const item of status.items) {
    const coveredByVisit = covering.get(item.key) ?? null;
    if (item.status === "overdue") {
      out.lapsed.push({ key: item.key, when: "already", dueDate: item.firstDate ?? item.calendar?.dueDate ?? null, coveredByVisit });
      continue;
    }
    // A document's "no record" is a missing expiry date (W-STATUS-03 "has no date on file").
    if (item.status === "no_record") { out.cannotCheck.push({ key: item.key, reason: item.source === "document" ? "no_date" : "no_record" }); continue; }
    const cal = item.calendar;
    const hrs = item.hours;
    if (!cal && !hrs) { out.cannotCheck.push({ key: item.key, reason: "no_date" }); continue; }
    if (!cal && hrs && hoursUntil == null) { out.cannotCheck.push({ key: item.key, reason: "no_recent_flying" }); continue; }

    // The date each limit is reached, when it is reached by the chosen date.
    const calLapse = cal && cal.dueDate < date ? cal.dueDate : null;
    const hrsLapse = hrs && hoursUntil != null && rate! > 0 && hrs.remaining <= hoursUntil
      ? addDays(status.today, Math.ceil(hrs.remaining / (rate! / 7)))
      : null;
    const lapse = [calLapse, hrsLapse].filter((d): d is string => !!d).sort()[0];
    if (lapse) { out.lapses.push({ key: item.key, when: "by_date", dueDate: lapse, coveredByVisit }); continue; }
    const spare: PlanSpare["spare"] = {};
    if (cal) spare.days = daysBetween(date, cal.dueDate);
    if (hrs && hoursUntil != null) spare.hours = round1(hrs.remaining - hoursUntil);
    out.stillInDate.push({ key: item.key, spare });
  }
  out.lapsed.sort(byDate);
  out.lapses.sort(byDate);
  return out;
}

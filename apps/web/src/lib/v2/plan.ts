import { addDays, addMonths, fmtDate, type DueItem, type Rate, type Ring } from "@/lib/due/engine";
import type { PlanResult } from "@/lib/due/plan";
import { fmtMeter } from "@/lib/v2/status";
import { monD } from "@/lib/v2/visits";

// Plan ahead on the web (W-STATUS-03, 08 C-PLAN-01). Pure: the client recomputes on every scrub (09 §3.12).

/** Today + 90 days, rounded up to the 1st of the following month (Mar 1, 2027 from Nov 18, 2026). */
export function defaultPlanDate(today: string): string {
  const d = addDays(today, 90);
  return addMonths(`${d.slice(0, 7)}-01`, 1);
}

/** The chosen date clamped to today … today + 24 months (D5). */
export const clampPlanDate = (date: string, today: string) => {
  const end = addMonths(today, 24);
  return date < today ? today : date > end ? end : date;
};

/** Flying rate field: 0 to 60 in half hours (W-STATUS-03). Null when the input is not a number. */
export function parseRate(v: string | null | undefined): number | null {
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(60, Math.max(0, Math.round(n * 2) / 2)) : null;
}

/** The rate the screen opens with: the rate in use rounded to 0.5 h, or null with no recent flying and no estimate. */
export const defaultRate = (rate: Rate) => (rate.basis === "none" ? null : Math.round(rate.hoursPerWeek * 2) / 2);

/**
 * Rings over the plan's 24 months (as the engine draws the 12-month line ahead, 09 §3.4), with every item that lapses
 * by the chosen date drawn as overdue (10 §8.3).
 */
export function planRings(items: DueItem[], today: string, to: string, lapsing: Set<string>): Ring[] {
  const out: Ring[] = [];
  for (const i of items) {
    if (i.source === "document" || !i.line || !i.firstDate || i.status === "no_record") continue;
    const date = i.status === "overdue" ? today : i.firstDate;
    if (date > to) continue;
    out.push({ itemKey: i.key, line: i.line, date, dateKind: i.first === "hours" ? "projected" : "calendar", status: lapsing.has(i.key) ? "overdue" : i.status });
  }
  return out;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "By Mar 1, 5 items will have lapsed unless they are done first." (12 §3: numerals always). */
export function planAnswer(p: PlanResult): string {
  const n = p.lapsed.length + p.lapses.length;
  return n === 0
    ? `By ${monD(p.date)}, nothing tracked will have lapsed.`
    : `By ${monD(p.date)}, ${plural(n, "item", "items")} will have lapsed unless ${n === 1 ? "it is" : "they are"} done first.`;
}

/** "About 44 hours, so the tach reads about 4,256.0 that day." */
export function planHelper(p: PlanResult): string | null {
  if (p.hoursUntil == null) return null;
  const h = Math.round(p.hoursUntil);
  const tach = p.metersOnDate.tach;
  return `About ${plural(h, "hour", "hours")}${tach != null ? `, so the tach reads about ${fmtMeter(tach)} that day` : ""}.`;
}

/** The limit that lapses: "tach 4,222.1, about Dec 12" or "Dec 31, 2026". */
export function lapseLimit(item: DueItem, dueDate: string | null): string {
  if (item.first === "hours" && item.hours) return `${item.hours.meter} ${fmtMeter(item.hours.dueAt)}${dueDate ? `, about ${monD(dueDate)}` : ""}`;
  if (item.calendar) return fmtDate(item.calendar.dueDate);
  return dueDate ? fmtDate(dueDate) : "no date";
}

/** "Still in date on Mar 1: the seat-rail AD, with about 12 h to spare, and the annual, with 152 days." */
export function stillInDateText(p: PlanResult, label: (key: string) => string): string | null {
  if (!p.stillInDate.length) return null;
  const parts = p.stillInDate.map((s) => {
    const bits = [s.spare.hours != null ? `about ${fmtMeter(s.spare.hours)} h to spare` : null, s.spare.days != null ? plural(s.spare.days, "day", "days") : null].filter(Boolean);
    return `${label(s.key)}${bits.length ? `, with ${bits.join(" and ")}` : ""}`;
  });
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join("; ")}; and ${parts[parts.length - 1]}`;
  return `Still in date on ${monD(p.date)}: ${list}.`;
}

/** "The insurance policy has no date on file, so it cannot be checked." */
export function cannotText(c: PlanResult["cannotCheck"][number], label: string): string {
  if (c.reason === "no_recent_flying") return `${label}: no recent flying, so its hours can't be dated.`;
  if (c.reason === "no_record") return `${label}: no record yet, so it cannot be checked.`;
  return `${label} has no date on file, so it cannot be checked.`;
}

/** Spoken value of the scrubber: "March 1, 2027, 5 items lapse". */
export function scrubberText(p: PlanResult): string {
  const d = new Date(`${p.date}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const n = p.lapsed.length + p.lapses.length;
  return `${d}, ${n === 0 ? "nothing lapses" : `${plural(n, "item lapses", "items lapse")}`}`;
}

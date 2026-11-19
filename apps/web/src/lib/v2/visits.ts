import { addDays, type VisitView } from "@/lib/due/engine";

// Visits on the web (W-STATUS-01 notices and VisitPanel, 02 §4.7 VisitCapsule, 09 §4.3 VisitView). Pure.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Dec 7" */
export const monD = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;

/** `?visit=` value: the planned visit's id, or `sugg:{suggestion_key}` (W-STATUS-03). */
export const visitParam = (v: VisitView) => v.id ?? `sugg:${v.suggestionKey}`;
export const findVisit = (visits: VisitView[], param: string | undefined) => (param ? visits.find((v) => visitParam(v) === param) ?? null : null);

export const VISIT_WORD: Record<string, string> = {
  suggested: "Suggested", planned: "Planned", in_shop: "In the shop", awaiting_records: "Awaiting records",
};

export function visitTitle(v: VisitView): string {
  const lead = v.status === "suggested" ? "Suggested visit" : v.status === "planned" ? "Planned visit" : VISIT_WORD[v.status] ?? "Visit";
  return `${lead}, week of ${monD(v.weekOf)}`;
}

/** The cap's label above its top end (02 §4.7): "Visit 1, Dec 7" for suggestions, "Dec 9 visit" when booked. */
export function capLabel(v: VisitView, n: number): string {
  return v.status === "suggested" ? `Visit ${n}, ${monD(v.weekOf)}` : `${monD(v.visitDate ?? v.weekOf)} visit`;
}

/** "about 10 h early" / "13 days early" (W-STATUS-03 early costs). */
export function earlyText(e: VisitView["items"][number]["earlyBy"]): string | null {
  if (!e) return null;
  if (e.hours) return `about ${e.hours} h early`;
  if (e.days) return `${e.days} ${e.days === 1 ? "day" : "days"} early`;
  return null;
}

/** Book lines a visit touches; squawks sit on the airframe line. Unknown items fall back to every lane. */
export function visitLines(v: VisitView, lineOf: (key: string) => string | null | undefined, lanes: string[]): string[] {
  const have = new Set(v.items.map((i) => (i.key.startsWith("squawk:") ? "airframe" : lineOf(i.key))).filter((l): l is string => !!l));
  const hit = lanes.filter((l) => have.has(l));
  return hit.length ? hit : lanes;
}

export const mondayOnOrBefore = (d: string) => addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));

/** The week a visit should move to so an at-risk item is done before it lapses: the Monday before, never in the past. */
export function moveWeekFor(firstDate: string, today: string): string {
  const nextMonday = mondayOnOrBefore(addDays(today, 7));
  const target = mondayOnOrBefore(addDays(firstDate, -3));
  return target < nextMonday ? nextMonday : target;
}

export type VisitNotice =
  | { kind: "at_risk"; visit: VisitView; itemKey: string; daysBefore: number; moveTo: string }
  | { kind: "in_shop"; visit: VisitView }
  | { kind: "happened"; visit: VisitView };

/** W-STATUS-01 notices about visits, in order At risk, In the shop?, Did it happen?; at most two. */
export function visitNotices(planned: VisitView[], today: string): VisitNotice[] {
  const out: VisitNotice[] = [];
  for (const v of planned) {
    const r = v.atRisk[0];
    if (v.status === "planned" && r) {
      const days = Math.round((Date.parse(`${v.visitDate ?? v.weekOf}T00:00:00Z`) - Date.parse(`${r.firstDate}T00:00:00Z`)) / 86_400_000);
      out.push({ kind: "at_risk", visit: v, itemKey: r.itemKey, daysBefore: Math.max(days, 1), moveTo: moveWeekFor(r.firstDate, today) });
    }
  }
  for (const v of planned) if (v.status === "planned" && v.weekOf <= today) out.push({ kind: "in_shop", visit: v });
  for (const v of planned) if (v.status === "awaiting_records") out.push({ kind: "happened", visit: v });
  return out.slice(0, 2);
}

/** itemKey → "In the Dec 7 visit" for DueRows riding on a live planned visit. */
export function visitRowNotes(planned: VisitView[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of planned) for (const i of v.items) if (!i.done) out[i.key] = `In the ${monD(v.visitDate ?? v.weekOf)} visit`;
  return out;
}

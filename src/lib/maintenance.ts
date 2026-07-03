import { addMonths } from "@/lib/compliance";

// Standard recurring maintenance items. Regulatory items are mandatory under
// Part 91; advisory items (TBO, prop overhaul, oil) are NOT regulatory — the UI
// must keep them visually distinct so they aren't mistaken for legal
// requirements. Intervals are defaults the owner can adjust.
export type StandardItem = {
  kind: string;
  label: string;
  regulatory: boolean;
  interval_months: number | null;
  interval_hours: number | null;
};

export const STANDARD_ITEMS: StandardItem[] = [
  { kind: "annual", label: "Annual inspection (91.409)", regulatory: true, interval_months: 12, interval_hours: null },
  { kind: "transponder", label: "Transponder test (91.413)", regulatory: true, interval_months: 24, interval_hours: null },
  { kind: "pitot_static", label: "Pitot-static / altimeter (91.411)", regulatory: true, interval_months: 24, interval_hours: null },
  { kind: "elt", label: "ELT inspection (91.207)", regulatory: true, interval_months: 12, interval_hours: null },
  { kind: "vor", label: "VOR check (91.171) — IFR", regulatory: true, interval_months: 1, interval_hours: null },
  { kind: "hundred_hour", label: "100-hour inspection (91.409)", regulatory: true, interval_months: null, interval_hours: 100 },
  { kind: "oil_change", label: "Oil change", regulatory: false, interval_months: null, interval_hours: 50 },
  { kind: "engine_tbo", label: "Engine TBO (advisory)", regulatory: false, interval_months: null, interval_hours: 2000 },
  { kind: "prop_overhaul", label: "Propeller overhaul (advisory)", regulatory: false, interval_months: 72, interval_hours: null },
];

// The common Part 91 set most owners want seeded (excludes IFR/for-hire/advisory).
export const DEFAULT_SEED_KINDS = ["annual", "transponder", "pitot_static", "elt"];

/** Next-due from last-done + interval. Null components stay null (not yet done). */
export function maintenanceNextDue(item: {
  interval_months: number | null;
  interval_hours: number | null;
  last_done_date: string | null;
  last_done_hours: number | null;
}): { next_due_date: string | null; next_due_hours: number | null } {
  return {
    next_due_date:
      item.last_done_date && item.interval_months
        ? addMonths(item.last_done_date, item.interval_months)
        : null,
    next_due_hours:
      item.last_done_hours != null && item.interval_hours != null
        ? Math.round((item.last_done_hours + item.interval_hours) * 10) / 10
        : null,
  };
}

type MxItemLite = {
  kind: string;
  interval_hours: number | null;
  last_done_hours: number | null;
  next_due_date: string | null;
  next_due_hours: number | null;
};

/**
 * Effective next-due for an item, accounting for cross-item resets. A 100-hour
 * inspection is due 100 hours after the LATER of the last 100-hour or the last
 * annual — an annual inspection resets the 100-hour clock. So the 100-hour's
 * next-due-hours is computed from max(its own last-done, the annual's last-done)
 * + interval. Everything else uses its own stored next-due.
 */
export function effectiveNextDue(
  item: MxItemLite,
  allItems: MxItemLite[],
): { next_due_date: string | null; next_due_hours: number | null } {
  if (item.kind === "hundred_hour" && item.interval_hours != null) {
    const annual = allItems.find((i) => i.kind === "annual");
    const bases = [item.last_done_hours, annual?.last_done_hours].filter(
      (v): v is number => v != null,
    );
    if (bases.length > 0) {
      return {
        next_due_date: item.next_due_date,
        next_due_hours: Math.round((Math.max(...bases) + item.interval_hours) * 10) / 10,
      };
    }
  }
  return { next_due_date: item.next_due_date, next_due_hours: item.next_due_hours };
}

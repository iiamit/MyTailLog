import type { AdStatus } from "@/lib/database.types";

export const AD_STATUS_LABEL: Record<AdStatus, string> = {
  open: "Open",
  complied: "Complied (CW)",
  previously_complied: "Previously complied (PCW)",
  not_applicable: "Does not apply (DNA)",
  superseded: "Superseded",
};

// Days-until / hours-until thresholds for the "due soon" bucket.
export const DUE_SOON_DAYS = 90;
export const DUE_SOON_HOURS = 10;

/** Add whole calendar months to an ISO date (YYYY-MM-DD), UTC. */
export function addMonths(isoDate: string, months: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export type NextDue = { next_due_date: string | null; next_due_hours: number | null };

/**
 * Next-due for a recurring AD/SB, from the last compliance plus the interval.
 * Only meaningful once complied; otherwise null (an open item is due now).
 */
export function computeNextDue(p: {
  recurring: boolean;
  status: AdStatus;
  complied_date: string | null;
  complied_hours: number | null;
  interval_months: number | null;
  interval_hours: number | null;
}): NextDue {
  if (!p.recurring || p.status !== "complied") {
    return { next_due_date: null, next_due_hours: null };
  }
  return {
    next_due_date:
      p.complied_date && p.interval_months
        ? addMonths(p.complied_date, p.interval_months)
        : null,
    next_due_hours:
      p.complied_hours != null && p.interval_hours != null
        ? Math.round((p.complied_hours + p.interval_hours) * 10) / 10
        : null,
  };
}

export type Urgency = "overdue" | "due_soon" | "upcoming" | "none";

/**
 * Urgency of a next-due, comparing against today and the aircraft's current
 * hours. "Overdue" if either the calendar or hours limit has passed; "due soon"
 * within the thresholds above. Returns "none" when there's no next-due at all.
 */
export function urgencyOf(
  r: { next_due_date: string | null; next_due_hours: number | null },
  currentHours: number | null,
  today: Date = new Date(),
): Urgency {
  const todayStr = today.toISOString().slice(0, 10);
  let overdue = false;
  let soon = false;

  if (r.next_due_date) {
    if (r.next_due_date < todayStr) {
      overdue = true;
    } else {
      const days =
        (Date.parse(r.next_due_date + "T00:00:00Z") -
          Date.parse(todayStr + "T00:00:00Z")) /
        86_400_000;
      if (days <= DUE_SOON_DAYS) soon = true;
    }
  }
  if (r.next_due_hours != null && currentHours != null) {
    if (r.next_due_hours <= currentHours) overdue = true;
    else if (r.next_due_hours - currentHours <= DUE_SOON_HOURS) soon = true;
  }

  if (overdue) return "overdue";
  if (soon) return "due_soon";
  if (r.next_due_date || r.next_due_hours != null) return "upcoming";
  return "none";
}

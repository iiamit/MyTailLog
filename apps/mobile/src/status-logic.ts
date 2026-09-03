import { AD_STATUS_LABEL, urgencyOf, type Urgency } from "@/lib/compliance";
import { METERS, type Meter } from "@/lib/hobbsTach";

// Pure rules behind the airworthiness screens — no Capacitor, no SQLite, no
// import.meta.env — so apps/web/test/mobile-status-logic.test.ts can run them.

/** Short human date — "12 Sep", or "12 Sep 2027" when it isn't this year. */
export function shortDate(iso: string | null, now = new Date()): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  const sameYear = d.getUTCFullYear() === now.getUTCFullYear();
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
    timeZone: "UTC",
  });
}

// --- Meter replacement -------------------------------------------------------

export type ReadingLite = { date: string | null; value: number | null };

/**
 * A new reading below the latest one on the same meter. Not an error — meters
 * get replaced — but it needs a decision, because pre-replacement history breaks
 * every hour countdown unless a meter_reset row explains the drop.
 *
 * Returns the reading it fell below, or null when nothing is wrong.
 */
export function detectBackwardsReading(
  readings: ReadingLite[],
  newReading: number | null,
): { prior: number; asOf: string | null } | null {
  if (newReading == null || !Number.isFinite(newReading)) return null;
  // ponytail: latest by date, later in the array wins a tie; no magnitude
  // heuristic — a 0.1 drop is a mis-key, but the owner decides that, not us.
  let last: ReadingLite | null = null;
  for (const r of readings) {
    if (r.value == null) continue;
    if (!last || (r.date ?? "") >= (last.date ?? "")) last = r;
  }
  if (!last || last.value == null || newReading >= last.value) return null;
  return { prior: last.value, asOf: last.date };
}

// --- Maintenance item form ---------------------------------------------------

export type ItemFields = {
  kind: string;
  label: string;
  regulatory: boolean;
  interval_months: number | null;
  interval_hours: number | null;
  last_done_date: string | null;
  last_done_hours: number | null;
  notes: string | null;
  meter: Meter | null;
};

/** Owner-readable reason the item can't be saved, or null when it can. */
export function validateItem(f: ItemFields): string | null {
  if (!f.label.trim()) return "Give the item a name.";
  if (f.interval_months != null && (!Number.isInteger(f.interval_months) || f.interval_months <= 0))
    return "Months between must be a whole number above zero.";
  if (f.interval_hours != null && (!Number.isFinite(f.interval_hours) || f.interval_hours <= 0))
    return "Hours between must be above zero.";
  if (f.interval_months == null && f.interval_hours == null)
    return "Set how often it's due — in months, hours, or both.";
  if (f.last_done_hours != null && (!Number.isFinite(f.last_done_hours) || f.last_done_hours < 0))
    return "Last-done hours can't be negative.";
  if (f.last_done_hours != null && f.last_done_date == null)
    return "Add the date it was last done alongside the hours.";
  if (f.meter != null && !METERS.includes(f.meter)) return "Unknown meter.";
  return null;
}

/** "" ↔ null for the numeric inputs; anything unparsable stays NaN so validation catches it. */
export function numOrNull(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  return Number(t);
}

// --- AD status -----------------------------------------------------------------

export type AdLite = {
  kind: string;
  status: string;
  recurring: boolean;
  complied_date: string | null;
  complied_hours: number | null;
  next_due_date: string | null;
  next_due_hours: number | null;
  reason: string | null;
  status_changed_on: string | null;
};

export type AdStatusLine = {
  /** "Complied", "Open", "Does not apply" — the word that carries the colour. */
  word: string;
  /** "last 4 Mar · next 4 Mar 2027 (in 180 days)" — already worded, no ISO dates. */
  detail: string;
  urgency: Urgency;
  /** True when the record still wants something from the owner. */
  open: boolean;
};

/** One AD, judged the same way the web's compliance page judges it. */
export function adStatusLine(ad: AdLite, currentTach: number | null, today = new Date()): AdStatusLine {
  const label = AD_STATUS_LABEL[ad.status as keyof typeof AD_STATUS_LABEL] ?? ad.status;
  const word = label.replace(/\s*\(.*\)\s*$/, "");
  if (ad.status === "not_applicable" || ad.status === "superseded") {
    const why = [ad.reason, ad.status_changed_on ? `since ${shortDate(ad.status_changed_on, today)}` : null]
      .filter(Boolean).join(" · ");
    return { word, detail: why || "No reason recorded", urgency: "none", open: false };
  }
  if (ad.status === "open") {
    return { word, detail: "No compliance recorded yet", urgency: "none", open: true };
  }
  const last = ad.complied_date
    ? `last ${shortDate(ad.complied_date, today)}${ad.complied_hours != null ? ` at ${ad.complied_hours.toFixed(1)} h` : ""}`
    : "date not recorded";
  if (!ad.recurring) return { word, detail: `${last} · one-time`, urgency: "none", open: false };

  const urgency = urgencyOf({ next_due_date: ad.next_due_date, next_due_hours: ad.next_due_hours }, currentTach, today);
  const parts: string[] = [];
  if (ad.next_due_date) {
    const days = Math.round((Date.parse(`${ad.next_due_date}T00:00:00Z`) - Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00Z`)) / 86_400_000);
    parts.push(days < 0 ? `${-days} days overdue` : days === 0 ? "due today" : `next ${shortDate(ad.next_due_date, today)} (in ${days} days)`);
  }
  if (ad.next_due_hours != null) {
    if (currentTach != null) {
      const h = Math.round((ad.next_due_hours - currentTach) * 10) / 10;
      parts.push(h < 0 ? `${-h} h over` : `${h} h left`);
    } else parts.push(`next at ${ad.next_due_hours.toFixed(1)} h`);
  }
  return {
    word: urgency === "overdue" ? "Overdue" : word,
    detail: [last, parts.length ? parts.join(" · ") : "recurring — interval not set"].join(" · "),
    urgency,
    open: urgency === "overdue",
  };
}

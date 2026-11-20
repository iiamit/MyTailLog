import { statusNeedsInformation, statusCountdown, type StatusItem } from "@/lib/status";
import { semanticOf, type Semantic } from "./tokens";
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
  // Decision: latest by date, later in the array wins a tie; no magnitude
  // heuristic. A 0.1 drop is a mis-key, but the owner decides that, not us.
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

/** An AD or maintenance item, judged and ready to render. */
export type StatusLine = {
  item: StatusItem;
  urgency: Urgency;
  /** "Due in 21 days", "42.3 h remaining", "OVERDUE by 4 days" — already worded. */
  due: string;
  /** Approximate calendar date an hours-based item lands on, when we can say. */
  projection: string | null;
};

// --- The verdict ------------------------------------------------------------
// Tracked records summarized before any list. Everything here is DERIVED from
// the lines above — nothing new is stored.

export type Verdict = {
  semantic: Semantic;
  /** Describes tracked records, never an airworthiness determination. */
  headline: string;
  /** The next item and any remaining gaps in recorded information. */
  detail: string;
  /** The countdown number and its unit, adapting to the interval. */
  value: string;
  unit: string;
  /** 0–1, how much of the interval has elapsed — the ring's arc sweep. */
  progress: number;
  /** The item the countdown refers to, when there is one. */
  item: StatusItem | null;
};

const DAY = 86_400_000;

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / DAY);
}


/**
 * How far through its interval an item is, 0–1. The ring fills as the deadline
 * approaches, so a glance reads "nearly due" without reading the number.
 */
function elapsedFraction(item: StatusItem): number {
  const days = daysUntil(item.nextDueDate);
  const dateProgress = days != null && item.intervalMonths
    ? 1 - days / (item.intervalMonths * 30.44) : 0;
  const hourProgress = !item.hoursUnreliable && item.nextDueForItem != null && item.currentForItem != null && item.intervalHours
    ? 1 - (item.nextDueForItem - item.currentForItem) / item.intervalHours : 0;
  return Math.max(0, Math.min(1, Math.max(dateProgress, hourProgress)));
}

export function buildVerdict(lines: StatusLine[]): Verdict {
  const worst = lines.find((l) => l.urgency === "overdue")
    ?? lines.find((l) => l.urgency === "due_soon")
    ?? lines.find((l) => l.urgency === "none")
    ?? lines[0] ?? null;
  if (!worst) {
    return {
      semantic: "unknown", headline: "No tracked assessment yet",
      detail: "Open all items to add inspections and record compliance.",
      value: "—", unit: "", progress: 0, item: null,
    };
  }

  const sem = semanticOf(worst.urgency);
  const item = worst.item;
  const countdown = statusCountdown(item);
  const { days, hours } = countdown;

  // Unit adapts: days under 90, months beyond, hours for hour-driven items.
  let value = "—";
  let unit = "";
  if (days != null && countdown.unit === "days") {
    if (days < 0) {
      value = String(Math.abs(days));
      unit = Math.abs(days) === 1 ? "day overdue" : "days overdue";
    } else if (days < 90) {
      value = String(days);
      unit = days === 1 ? "day to next" : "days to next";
    } else {
      value = String(Math.round(days / 30.44));
      unit = "months to next";
    }
  } else if (hours != null) {
    value = String(Math.abs(hours));
    unit = hours < 0 ? "hours over" : hours === 0 ? "hours — due now" : "hours to next";
  }

  const overdue = lines.filter((l) => l.urgency === "overdue").length;
  const due = lines.filter((l) => l.urgency === "due_soon").length;
  const unknown = lines.filter((l) => statusNeedsInformation(l.item)).length;
  const headline = overdue > 0 ? `${overdue} tracked item${overdue === 1 ? "" : "s"} overdue`
    : due > 0 ? `${due} item${due === 1 ? "" : "s"} due soon`
    : unknown > 0 ? "Tracked assessment incomplete"
    : "No tracked items overdue";
  const detail = `${item.label.replace(/\s*\(.*\)\s*/, "")}: ${countdown.text}. ${lines.length} tracked; ${unknown} need more information.`;

  return { semantic: sem, headline, detail, value, unit, progress: elapsedFraction(item), item };
}

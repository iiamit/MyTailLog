import type { AdKind, AdStatus } from "@/lib/database.types";
import { daysBetween, fmtDate } from "@/lib/due/engine";
import { addMonths } from "@/lib/compliance";

// W-MAINT-01 / W-MAINT-02 pure helpers: the four plain states, the shared mini-line axis, the interval
// summary under the history, and the logbook references nobody tracks yet.

type StateRow = {
  status: AdStatus;
  recurring: boolean;
  interval_hours: number | null;
  interval_months: number | null;
  reason: string | null;
  status_changed_on: string | null;
};

/** "every 100 hours or 12 months", or null when there is no interval. */
export function everyText(hours: number | null, months: number | null): string | null {
  const parts = [hours != null ? `${hours} hours` : null, months != null ? `${months} ${months === 1 ? "month" : "months"}` : null].filter(Boolean);
  return parts.length ? `every ${parts.join(" or ")}` : null;
}

/** The Applies cell: a state word and its rule, never a colour alone (W-MAINT-01 Applies cell). */
export function adState(r: StateRow): { word: string; detail: string; mark: "neutral" | "no_record" | "advisory" } {
  if (r.status === "not_applicable") return { word: "Not applicable", detail: r.reason ?? "no reason given", mark: "advisory" };
  if (r.status === "superseded")
    return { word: "Superseded", detail: `${r.reason ?? "by a newer AD"}${r.status_changed_on ? ` on ${fmtDate(r.status_changed_on)}` : ""}`, mark: "advisory" };
  if (r.status === "open" && !r.recurring) return { word: "Open", detail: "no compliance recorded", mark: "no_record" };
  if (r.recurring) return { word: "Recurring", detail: everyText(r.interval_hours, r.interval_months) ?? "recurring", mark: "neutral" };
  if (r.status === "previously_complied") return { word: "Complied once", detail: "before these records", mark: "neutral" };
  return { word: "Complied once", detail: "one-time AD", mark: "neutral" };
}

/** Status select labels in the editor (W-MAINT-01 AD editor). */
export const STATUS_OPTIONS: [AdStatus, string][] = [
  ["open", "Open"],
  ["complied", "Complied"],
  ["previously_complied", "Complied before these records"],
  ["not_applicable", "Does not apply"],
  ["superseded", "Superseded"],
];

/** Shared axis for every mini line: from the decade before the first compliance to two years past today. */
export function miniAxis(dates: string[], today: string): { from: string; to: string; ticks: string[] } {
  const first = dates.filter(Boolean).sort()[0] ?? today;
  const startYear = Math.floor(Number(first.slice(0, 4)) / 10) * 10;
  const endYear = Number(today.slice(0, 4)) + 2;
  const ticks: string[] = [];
  for (let y = startYear; y <= endYear; y += 10) ticks.push(String(y));
  return { from: `${startYear}-01-01`, to: `${endYear}-12-31`, ticks };
}

/** 0..1 position of a date on the axis, clamped. */
export function axisX(date: string, axis: { from: string; to: string }): number {
  const span = daysBetween(axis.from, axis.to) || 1;
  return Math.min(1, Math.max(0, daysBetween(axis.from, date) / span));
}

export type Compliance = { date: string; hours: number | null };

/**
 * The line under the history (W-MAINT-01 History table): every interval within the AD's rule, or the ones that
 * ran over named in words. Null with fewer than two compliances or no interval.
 */
export function intervalSummary(rows: Compliance[], intervalHours: number | null, intervalMonths: number | null): { over: boolean; text: string } | null {
  if (rows.length < 2 || (intervalHours == null && intervalMonths == null)) return null;
  const asc = [...rows].sort((a, b) => (a.date < b.date ? -1 : 1));
  const rule = everyText(intervalHours, intervalMonths)!.replace(/^every /, "");
  const over: string[] = [];
  let longest: { h: number; from: string; to: string } | null = null;
  for (let i = 1; i < asc.length; i++) {
    const a = asc[i - 1];
    const b = asc[i];
    const h = a.hours != null && b.hours != null ? Math.round((b.hours - a.hours) * 10) / 10 : null;
    const late = intervalMonths != null && b.date > addMonths(a.date, intervalMonths);
    if ((intervalHours != null && h != null && h > intervalHours) || late)
      over.push(`${a.date.slice(0, 4)} to ${b.date.slice(0, 4)}${h != null ? ` (${h} h)` : ""}`);
    if (h != null && (!longest || h > longest.h)) longest = { h, from: a.date, to: b.date };
  }
  if (over.length)
    return { over: true, text: `${over.length} ${over.length === 1 ? "interval" : "intervals"} ran over ${rule}: ${over.join(", ")}.` };
  return {
    over: false,
    text: `Every interval on the line is under ${rule}.${longest ? ` The longest was ${longest.h} h, from ${longest.from.slice(0, 4)} to ${longest.to.slice(0, 4)}.` : ""}`,
  };
}

const norm = (r: string) => r.replace(/\s+/g, "").toLowerCase();

export type RefMention = { kind: AdKind; reference: string; entryId: string; pageId: string | null; date: string | null };

/** AD and SB numbers named in confirmed entries but not tracked, each with its first mention (W-MAINT-01). */
export function untrackedRefs(
  entries: { id: string; page_id: string | null; entry_date: string | null; ad_refs: string[] | null; sb_refs: string[] | null }[],
  tracked: { kind: AdKind; reference: string }[],
): RefMention[] {
  const have = new Set(tracked.map((t) => `${t.kind}:${norm(t.reference)}`));
  const found = new Map<string, RefMention>();
  const sorted = [...entries].sort((a, b) => ((a.entry_date ?? "") < (b.entry_date ?? "") ? -1 : 1));
  for (const e of sorted)
    for (const [kind, refs] of [["ad", e.ad_refs], ["sb", e.sb_refs]] as const)
      for (const reference of refs ?? []) {
        const key = `${kind}:${norm(reference)}`;
        if (!reference.trim() || have.has(key) || found.has(key)) continue;
        found.set(key, { kind, reference: reference.trim(), entryId: e.id, pageId: e.page_id, date: e.entry_date });
      }
  return [...found.values()];
}

/** The next due a new compliance would set, for the Record compliance preview. */
export function previewNextDue(date: string, hours: number | null, intervalHours: number | null, intervalMonths: number | null): string | null {
  const parts = [
    intervalMonths != null && date ? fmtDate(addMonths(date, intervalMonths)) : null,
    intervalHours != null && hours != null ? `tach ${(Math.round((hours + intervalHours) * 10) / 10).toFixed(1)}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" or ") : null;
}

/** Next-due choices on Find ADs: at the next annual, on a date, or at a tach reading. */
export function nextDueChoice(choice: "annual" | "date" | "tach", value: string, annualDue: string | null): { nextDueDate: string | null; nextDueHours: number | null } {
  if (choice === "annual") return { nextDueDate: annualDue, nextDueHours: null };
  if (choice === "date") return { nextDueDate: value || null, nextDueHours: null };
  const n = Number(value);
  return { nextDueDate: null, nextDueHours: value.trim() !== "" && Number.isFinite(n) ? n : null };
}

export type FoundAd = { kind: "manufacturer" | "model" | "keyword"; term: string; models: string[]; matched: string[] };

/**
 * Why a Find ADs candidate came up, and how strongly it matches (lower sorts first): names the model, names an
 * installed part's maker, a typed keyword, the model search, then the airframe make only (W-MAINT-02).
 */
export function whyItCameUp(
  c: FoundAd,
  aircraft: { make: string | null; model: string | null },
  partsByMake: Map<string, string>,
): { why: string; strength: number; makeOnly: boolean } {
  const model = [aircraft.make, aircraft.model].filter(Boolean).join(" ");
  if (c.matched.length) return { why: `Names ${model || c.matched[0]}`, strength: 0, makeOnly: false };
  const part = partsByMake.get(c.term.toLowerCase());
  if (c.kind === "manufacturer" && part) return { why: `Names your ${part}`, strength: 1, makeOnly: false };
  if (c.kind === "keyword") return { why: `Matches "${c.term}"`, strength: 2, makeOnly: false };
  if (c.kind === "model") return { why: `Names ${c.term}`, strength: 3, makeOnly: false };
  const why = c.models.length && aircraft.model ? `Names ${c.term}, not ${aircraft.model}` : `Names ${c.term} models`;
  return { why, strength: 4, makeOnly: true };
}

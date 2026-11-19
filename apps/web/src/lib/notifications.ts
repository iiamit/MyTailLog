// ===========================================================================
// Notification copy (12 §8, 08 §3.17, 09 §3.11): reminders carry the whole
// answer — the item, the limit that comes first with its date or hours and
// projection, the other limit, who did it last and on which page, and the visit
// that covers it. Several reminders for one aircraft on one day become one
// notification listing up to 3 and "and N more". Pure; the daily cron sends.
// Relative imports only: tests load this file outside Next.
// ===========================================================================

import { fmtAbout, fmtDate, type DueItem } from "./due/engine";
import type { Reminder } from "./reminders";

export type Composed = {
  kind: string;
  title: string;
  body: string;
  deepLink: string;
  actions: { id: string; label: string }[];
  payload: Record<string, unknown>;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Dec 31", with the year when it differs from today's. */
const short = (d: string, today: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return `${MONTHS[m - 1]} ${day}${d.slice(0, 4) === today.slice(0, 4) ? "" : `, ${y}`}`;
};
const h1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const i0 = (r: Reminder) => r.item?.label ?? "An item";
const lapsedWord = (i: DueItem) => (i.source === "document" ? "expired" : "lapsed");

/** One line per reminder, for multi-item notifications and the email digest. */
export function phrase(r: Reminder, today: string): string {
  if (r.kind === "visit") return `Shop visit the week of ${short(r.visit!.weekOf, today)}`;
  if (r.kind === "visit_risk") return `${r.item?.label ?? "An item"} now comes due about ${fmtAbout(r.risk!.firstDate, today)}, before the planned visit`;
  const i = r.item!;
  if (r.kind === "lapse" || r.kind === "weekly")
    return i.calendar ? `${i.label} ${lapsedWord(i)} ${short(i.calendar.dueDate, today)}` : `${i.label} ${lapsedWord(i)} at ${h1(i.hours!.dueAt)} ${i.hours!.meter}`;
  if (i.first === "hours" && i.hours)
    return `${i.label} in ${h1(i.hours.remaining)} h${i.hours.projectedDate ? ` (about ${fmtAbout(i.hours.projectedDate, today)})` : ""}`;
  return `${i.label} by ${short(i.calendar!.dueDate, today)}`;
}

function lastDone(i: DueItem): string {
  const l = i.lastDone;
  if (!l?.date) return "";
  return ` Last done ${fmtDate(l.date)}${l.signer ? ` by ${l.signer}` : ""}${l.pageLabel ? `, ${l.pageLabel}` : ""}.`;
}

function otherLimit(i: DueItem, today: string): string {
  if (i.first === "calendar" && i.hours) return ` Or in ${h1(i.hours.remaining)} h, whichever comes first.`;
  if (i.first === "hours" && i.calendar) return ` Calendar limit ${short(i.calendar.dueDate, today)}.`;
  return "";
}

function single(r: Reminder, today: string, plannedWeek: (visitId: string | null) => string | null): { title: string; body: string } {
  if (r.kind === "visit") {
    const v = r.visit!;
    return { title: `Shop visit the week of ${short(v.weekOf, today)}`, body: `${plural(v.items.length, "item", "items")} planned.` };
  }
  if (r.kind === "visit_risk")
    return {
      title: `${i0(r)} may lapse before the visit`,
      body: `It now comes due about ${fmtAbout(r.risk!.firstDate, today)}, before the week of ${short(r.visit!.weekOf, today)}.`,
    };
  const i = r.item!;
  const week = plannedWeek(i.visitId);
  const visit = week ? ` Planned for the week of ${short(week, today)}.` : "";
  if (r.kind === "lapse" || r.kind === "weekly") {
    const due = i.calendar ? `Due ${fmtDate(i.calendar.dueDate)}.` : `Due at ${h1(i.hours!.dueAt)} ${i.hours!.meter}.`;
    return { title: `${i.label} ${lapsedWord(i)}`, body: `${due} The records show nothing newer.${visit}` };
  }
  if (i.first === "hours" && i.hours) {
    const about = i.hours.projectedDate ? `About ${fmtAbout(i.hours.projectedDate, today)} at your recent use.` : "";
    return { title: `${i.label} in about ${h1(i.hours.remaining)} h`, body: `${about}${otherLimit(i, today)}${lastDone(i)}${visit}`.trim() };
  }
  const left = i.calendar!.daysLeft;
  return {
    title: `${i.label} due ${short(i.calendar!.dueDate, today)}`,
    body: `${left === 0 ? "Due today." : `${plural(left, "day", "days")} left.`}${otherLimit(i, today)}${lastDone(i)}${visit}`,
  };
}

/**
 * One aircraft's reminders for one channel and one day, as one notification. `visits`
 * maps planned visit ids to their week, for "Planned for the week of".
 */
export function composeAircraft(
  a: { id: string; tail: string },
  reminders: Reminder[],
  today: string,
  visits: Map<string, string> = new Map(),
): Composed {
  const plannedWeek = (id: string | null) => (id ? visits.get(id) ?? null : null);
  const items = reminders.map((r) => ({ itemKey: r.itemKey, dueSignature: r.dueSignature }));
  const visitId = reminders.find((r) => r.visit)?.visit?.id ?? reminders.find((r) => r.item?.visitId)?.item?.visitId ?? null;
  const status = `mytaillog://aircraft/${a.id}/status`;
  const actions = [
    { id: "plan_visit", label: "Plan the visit" },
    { id: "remind_friday", label: "Remind me Friday" },
  ];
  const payload = { items, visitId, kinds: [...new Set(reminders.map((r) => r.kind))] };

  if (reminders.length === 1) {
    const r = reminders[0];
    const { title, body } = single(r, today, plannedWeek);
    const deepLink = r.visit ? `${status}/visit/${r.visit.id}` : `${status}/item/${r.itemKey}`;
    return { kind: r.kind, title: `${a.tail}: ${title}`, body, deepLink, actions, payload };
  }

  const lapsed = reminders.filter((r) => r.kind === "lapse" || r.kind === "weekly").length;
  const n = reminders.length;
  const title = lapsed === 0 ? `${a.tail}: ${n} items coming due`
    : lapsed === n ? `${a.tail}: ${n} items lapsed`
    : `${a.tail}: ${lapsed} lapsed, ${n - lapsed} coming due`;
  const shown = reminders.slice(0, 3).map((r) => phrase(r, today)).join(", ");
  const body = `${shown}${n > 3 ? ` and ${n - 3} more` : ""}.`;
  const kind = lapsed ? "lapse" : reminders[0].kind;
  return { kind, title, body, deepLink: visitId ? `${status}/visit/${visitId}` : status, actions, payload };
}

/** The one push of the day: one aircraft's notification as is, several aircraft summed up. */
export function composePush(groups: Composed[]): { title: string; body: string; data: Record<string, string> } | null {
  if (groups.length === 0) return null;
  if (groups.length === 1) return { title: groups[0].title, body: groups[0].body, data: { deepLink: groups[0].deepLink } };
  return {
    title: `Reminders for ${groups.length} aircraft`,
    body: groups.map((g) => g.title).join(" · "),
    data: { deepLink: groups[0].deepLink },
  };
}

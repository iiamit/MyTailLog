// ===========================================================================
// Reminder decisions (09 §3.11, 14-decisions.md D7) — pure functions over the
// due engine's StatusBody, shared by the daily cron and the settings UI.
//
// The engine already applies the unconfirmed gate (09 §3.1), so nothing here
// can be moved by an entry read by AI and not yet confirmed.
//
// Cadence per due cycle (`dueSignature`) and per channel, enforced again by the
// reminder_log unique index (0091):
//   lead   once, when the item enters its category lead window;
//   lapse  once, when it is overdue;
//   weekly nth = 1..8, every 7 days after the first lapse send, while overdue;
//   visit  once per planned visit week; visit_risk once per (visit, item, week).
// The daily caps (one push, one email digest per user per day) and quiet hours
// are applied by the caller with `sentToday` and `inQuietHours`.
// Relative imports only: tests load this file outside Next.
// ===========================================================================

import { daysBetween, type DueItem, type StatusBody, type VisitView } from "./due/engine";
import { todayIn } from "./mapModel";

export type ReminderCategory = "annual" | "oil" | "ad" | "document" | "default";

export type AlertSettings = {
  annual: { enabled: boolean; lead_days: number };
  oil: { enabled: boolean; lead_hours: number };
  ad: { enabled: boolean; lead_days: number; lead_hours: number };
  default: { enabled: boolean; lead_days: number; lead_hours: number };
  // 09 §2.11 additions.
  document: { enabled: boolean; lead_days: number };
  channels: { email: boolean; push: boolean };
  weekly_while_lapsed: boolean;
  visit: { enabled: boolean; lead_days: number };
  /** Local "HH:MM" in profile.time_zone (14-decisions.md K4); pushes only. */
  quiet_hours: { start: string; end: string };
};

export const ALERT_DEFAULTS: AlertSettings = {
  annual: { enabled: true, lead_days: 90 },
  oil: { enabled: true, lead_hours: 10 },
  ad: { enabled: true, lead_days: 30, lead_hours: 25 },
  default: { enabled: true, lead_days: 30, lead_hours: 25 },
  document: { enabled: true, lead_days: 60 },
  channels: { email: true, push: true },
  weekly_while_lapsed: true,
  visit: { enabled: true, lead_days: 7 },
  quiet_hours: { start: "21:00", end: "07:00" },
};

/** Shape stored under profile.preferences.alerts (all fields optional). */
export type StoredAlerts = {
  [K in keyof AlertSettings]?: AlertSettings[K] extends object ? Partial<AlertSettings[K]> & { tz?: string } : AlertSettings[K];
};

const numOr = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;
const boolOr = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);
const hhmmOr = (v: unknown, fallback: string): string =>
  typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : fallback;

/** Merge a user's stored (partial) alert settings over the defaults. */
export function resolveAlerts(prefs: { alerts?: StoredAlerts } | null | undefined): AlertSettings {
  const a = prefs?.alerts ?? {};
  const d = ALERT_DEFAULTS;
  return {
    annual: { enabled: boolOr(a.annual?.enabled, d.annual.enabled), lead_days: numOr(a.annual?.lead_days, d.annual.lead_days) },
    oil: { enabled: boolOr(a.oil?.enabled, d.oil.enabled), lead_hours: numOr(a.oil?.lead_hours, d.oil.lead_hours) },
    ad: {
      enabled: boolOr(a.ad?.enabled, d.ad.enabled),
      lead_days: numOr(a.ad?.lead_days, d.ad.lead_days),
      lead_hours: numOr(a.ad?.lead_hours, d.ad.lead_hours),
    },
    default: {
      enabled: boolOr(a.default?.enabled, d.default.enabled),
      lead_days: numOr(a.default?.lead_days, d.default.lead_days),
      lead_hours: numOr(a.default?.lead_hours, d.default.lead_hours),
    },
    document: { enabled: boolOr(a.document?.enabled, d.document.enabled), lead_days: numOr(a.document?.lead_days, d.document.lead_days) },
    channels: { email: boolOr(a.channels?.email, d.channels.email), push: boolOr(a.channels?.push, d.channels.push) },
    weekly_while_lapsed: boolOr(a.weekly_while_lapsed, d.weekly_while_lapsed),
    visit: { enabled: boolOr(a.visit?.enabled, d.visit.enabled), lead_days: numOr(a.visit?.lead_days, d.visit.lead_days) },
    quiet_hours: { start: hhmmOr(a.quiet_hours?.start, d.quiet_hours.start), end: hhmmOr(a.quiet_hours?.end, d.quiet_hours.end) },
  };
}

/** Which alert category a due item belongs to. */
export function reminderCategory(item: Pick<DueItem, "source" | "kind">): ReminderCategory {
  if (item.source === "ad") return "ad";
  if (item.source === "document") return "document";
  if (item.kind === "annual") return "annual";
  if (item.kind === "oil_change") return "oil";
  return "default";
}

/** Per-item override of the category lead (maintenance_item / document remind_lead_*). */
export type LeadOverride = { days?: number | null; hours?: number | null };

function windowFor(cat: ReminderCategory, a: AlertSettings, o?: LeadOverride) {
  const w =
    cat === "annual" ? { enabled: a.annual.enabled, days: a.annual.lead_days as number | null, hours: null as number | null }
    : cat === "oil" ? { enabled: a.oil.enabled, days: null, hours: a.oil.lead_hours as number | null }
    : cat === "document" ? { enabled: a.document.enabled, days: a.document.lead_days, hours: null }
    : { enabled: a[cat].enabled, days: a[cat].lead_days, hours: a[cat].lead_hours };
  return { enabled: w.enabled, days: o?.days ?? w.days, hours: o?.hours ?? w.hours };
}

/**
 * The due cycle. A completion moves the due date or hours, which starts a new cycle,
 * so lead, lapse and weekly counts start again. Clients send this as `dueSignature`
 * in `reminder.snooze`.
 */
export function dueSignature(item: Pick<DueItem, "calendar" | "hours">): string {
  return `${item.calendar?.dueDate ?? ""}|${item.hours?.dueAt ?? ""}`;
}

export const MAX_WEEKLY = 8;
export type Channel = "email" | "push" | "in_app";
export type SendKind = "lead" | "lapse" | "weekly" | "visit" | "visit_risk";
export type SentRow = { item_key: string; due_signature: string; kind: string; channel: string; nth: number; sent_at: string };
export type SnoozeRow = { item_key: string; due_signature: string; until_at: string | null };
export type Reminder = {
  itemKey: string;
  dueSignature: string;
  kind: SendKind;
  nth: number;
  item?: DueItem;
  visit?: VisitView;
  /** visit_risk: the item that now comes due before the visit's week. */
  risk?: { itemKey: string; firstDate: string };
};

/** Monday of the ISO week holding `d`. */
const mondayOf = (d: string) => {
  const dow = (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;
  return new Date(Date.parse(`${d}T00:00:00Z`) - dow * 86_400_000).toISOString().slice(0, 10);
};

/**
 * Every reminder this aircraft's status allows today for one user, before channels:
 * `sent` and `snoozes` are that user's rows for this aircraft. Pair with `pendingFor`.
 */
export function dueReminders(
  snap: StatusBody,
  alerts: AlertSettings,
  opts: { sent: SentRow[]; snoozes: SnoozeRow[]; now: Date; leadOverride?: Map<string, LeadOverride> },
): Reminder[] {
  const out: Reminder[] = [];
  const today = snap.today;
  const snoozed = (key: string, sig: string) =>
    opts.snoozes.some((s) => s.item_key === key && s.due_signature === sig && (s.until_at == null || Date.parse(s.until_at) > opts.now.getTime()));
  const planned = new Map(snap.visits.planned.filter((v) => v.id).map((v) => [v.id!, v]));

  for (const item of snap.items) {
    if (item.status === "no_record") continue;
    const w = windowFor(reminderCategory(item), alerts, opts.leadOverride?.get(item.key));
    if (!w.enabled) continue;
    const sig = dueSignature(item);
    if (snoozed(item.key, sig)) continue;
    const base = { itemKey: item.key, dueSignature: sig, item };

    if (item.status === "overdue") {
      out.push({ ...base, kind: "lapse", nth: 1 });
      // Weekly counts from the first lapse send on any channel, so a late push does not restart it.
      const firstLapse = opts.sent
        .filter((s) => s.item_key === item.key && s.due_signature === sig && s.kind === "lapse")
        .map((s) => s.sent_at.slice(0, 10)).sort()[0];
      if (alerts.weekly_while_lapsed && firstLapse) {
        const n = Math.floor(daysBetween(firstLapse, today) / 7);
        // A missed week does not double up: only the latest number is offered, never above 8.
        if (n >= 1) out.push({ ...base, kind: "weekly", nth: Math.min(n, MAX_WEEKLY) });
      }
      continue;
    }

    const inLead = (w.days != null && item.calendar != null && item.calendar.daysLeft <= w.days)
      || (w.hours != null && item.hours != null && item.hours.remaining <= w.hours);
    if (!inLead) continue;
    // A planned visit before the item's first date covers it: the visit reminder speaks for it.
    const visit = item.visitId ? planned.get(item.visitId) : undefined;
    if (visit && visit.status === "planned" && (!item.firstDate || visit.weekOf <= item.firstDate)) continue;
    out.push({ ...base, kind: "lead", nth: 1 });
  }

  for (const v of planned.values()) {
    if (v.status !== "planned") continue;
    const days = daysBetween(today, v.weekOf);
    if (alerts.visit.enabled && days >= 0 && days <= alerts.visit.lead_days)
      out.push({ itemKey: `visit:${v.id}`, dueSignature: v.weekOf, kind: "visit", nth: 1, visit: v });
    for (const r of v.atRisk)
      out.push({ itemKey: `visit:${v.id}:${r.itemKey}`, dueSignature: mondayOf(r.firstDate), kind: "visit_risk", nth: 1, visit: v, risk: r, item: snap.items.find((i) => i.key === r.itemKey) });
  }
  return out;
}

/** The reminders not yet sent on this channel (the reminder_log unique key). */
export function pendingFor(reminders: Reminder[], channel: Channel, sent: SentRow[]): Reminder[] {
  const done = new Set(sent.filter((s) => s.channel === channel).map((s) => `${s.item_key}|${s.due_signature}|${s.kind}|${s.nth}`));
  return reminders.filter((r) => !done.has(`${r.itemKey}|${r.dueSignature}|${r.kind}|${r.nth}`));
}

/** D7 daily cap: something already went out on this channel today, in the user's time zone. */
export function sentToday(sent: SentRow[], channel: Channel, tz: string | null | undefined, now: Date): boolean {
  const today = todayIn(tz, now);
  return sent.some((s) => s.channel === channel && todayIn(tz, new Date(s.sent_at)) === today);
}

function localHHMM(tz: string | null | undefined, at: Date): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: tz || "UTC", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  } catch {
    return at.toISOString().slice(11, 16);
  }
}

/** Quiet hours (default 21:00–07:00 local) hold pushes back; a window may wrap midnight. */
export function inQuietHours(q: { start: string; end: string }, tz: string | null | undefined, now: Date): boolean {
  const t = localHHMM(tz, now);
  if (q.start === q.end) return false;
  return q.start < q.end ? t >= q.start && t < q.end : t >= q.start || t < q.end;
}

/**
 * The channels a user can receive on right now. The inbox always; email and push need
 * the v1 master switch (`notify_due`) and their channel switch, and each goes out at
 * most once per local day (D7). Pushes also wait out quiet hours.
 */
export function openChannels(
  alerts: AlertSettings,
  sent: SentRow[],
  o: { tz: string | null | undefined; now: Date; notifyDue: boolean; hasEmail: boolean },
): Channel[] {
  const out: Channel[] = ["in_app"];
  if (!o.notifyDue) return out;
  if (o.hasEmail && alerts.channels.email && !sentToday(sent, "email", o.tz, o.now)) out.push("email");
  if (alerts.channels.push && !inQuietHours(alerts.quiet_hours, o.tz, o.now) && !sentToday(sent, "push", o.tz, o.now)) out.push("push");
  return out;
}

/** Offset of `tz` from UTC at instant `t`, in ms. */
function tzOffset(t: number, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(t)).map((x) => [x.type, x.value]),
  );
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
}

/** "Remind me Friday" (D7): the coming Friday, 09:00 local — next week's when today is Friday. */
export function comingFriday0900(tz: string | null | undefined, now: Date): Date {
  const zone = tz || "UTC";
  let today: string;
  try {
    today = todayIn(zone, now);
    tzOffset(now.getTime(), zone);
  } catch {
    return comingFriday0900("UTC", now);
  }
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const ahead = (5 - dow + 7) % 7 || 7;
  const [y, m, d] = today.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d + ahead, 9, 0, 0);
  // Two passes settle a DST change between now and Friday.
  let t = wall - tzOffset(wall, zone);
  t = wall - tzOffset(t, zone);
  return new Date(t);
}

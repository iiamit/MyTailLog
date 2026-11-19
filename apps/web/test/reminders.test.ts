import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveAlerts,
  reminderCategory,
  dueSignature,
  dueReminders,
  pendingFor,
  openChannels,
  inQuietHours,
  sentToday,
  comingFriday0900,
  ALERT_DEFAULTS,
  MAX_WEEKLY,
  type AlertSettings,
  type Channel,
  type SentRow,
  type SnoozeRow,
} from "../src/lib/reminders";
import { composeAircraft, composePush } from "../src/lib/notifications";
import { addDays, computeStatus, daysBetween, type DueInput, type DueItem, type StatusBody, type VisitView } from "../src/lib/due/engine";

// --- resolveAlerts ---------------------------------------------------------
test("resolveAlerts: null/empty prefs → the full defaults", () => {
  assert.deepEqual(resolveAlerts(null), ALERT_DEFAULTS);
  assert.deepEqual(resolveAlerts(undefined), ALERT_DEFAULTS);
  assert.deepEqual(resolveAlerts({}), ALERT_DEFAULTS);
});

test("resolveAlerts: partial user settings merge over defaults", () => {
  const r = resolveAlerts({ alerts: { annual: { lead_days: 45 }, oil: { enabled: false } } });
  assert.equal(r.annual.lead_days, 45);
  assert.equal(r.annual.enabled, ALERT_DEFAULTS.annual.enabled);
  assert.equal(r.oil.enabled, false);
  assert.equal(r.oil.lead_hours, ALERT_DEFAULTS.oil.lead_hours);
  assert.deepEqual(r.ad, ALERT_DEFAULTS.ad);
});

test("resolveAlerts: invalid values fall back to defaults; zero is valid", () => {
  const r = resolveAlerts({
    alerts: {
      annual: { lead_days: -5, enabled: "yes" as unknown as boolean },
      ad: { lead_days: NaN, lead_hours: "10" as unknown as number },
      default: { lead_days: 0 },
      quiet_hours: { start: "25:00", end: "6:00" },
    },
  });
  assert.equal(r.annual.lead_days, ALERT_DEFAULTS.annual.lead_days);
  assert.equal(r.annual.enabled, ALERT_DEFAULTS.annual.enabled);
  assert.equal(r.ad.lead_days, ALERT_DEFAULTS.ad.lead_days);
  assert.equal(r.ad.lead_hours, ALERT_DEFAULTS.ad.lead_hours);
  assert.equal(r.default.lead_days, 0);
  assert.deepEqual(r.quiet_hours, ALERT_DEFAULTS.quiet_hours);
});

test("resolveAlerts: 09 §2.11 keys", () => {
  const r = resolveAlerts({ alerts: { channels: { push: false }, weekly_while_lapsed: false, document: { lead_days: 14 } } });
  assert.deepEqual(r.channels, { email: true, push: false });
  assert.equal(r.weekly_while_lapsed, false);
  assert.equal(r.document.lead_days, 14);
  assert.equal(r.visit.lead_days, 7);
});

test("reminderCategory", () => {
  assert.equal(reminderCategory({ source: "ad", kind: "annual" }), "ad");
  assert.equal(reminderCategory({ source: "document", kind: "registration" }), "document");
  assert.equal(reminderCategory({ source: "maintenance", kind: "annual" }), "annual");
  assert.equal(reminderCategory({ source: "maintenance", kind: "oil_change" }), "oil");
  assert.equal(reminderCategory({ source: "maintenance", kind: "transponder" }), "default");
});

test("dueSignature changes with the cycle", () => {
  assert.equal(dueSignature({ calendar: { dueDate: "2026-12-31", daysLeft: 1, calendarMonthRule: true }, hours: null }), "2026-12-31|");
  assert.notEqual(
    dueSignature({ calendar: { dueDate: "2026-12-31", daysLeft: 1, calendarMonthRule: true }, hours: null }),
    dueSignature({ calendar: { dueDate: "2028-12-31", daysLeft: 1, calendarMonthRule: true }, hours: null }),
  );
});

// --- D7 cadence (13 §7.2 rule test) ----------------------------------------

const due = (o: Partial<DueItem> = {}): DueItem => ({
  key: "mx:xpdr", source: "maintenance", kind: "transponder", label: "Transponder check", rule: "", line: null,
  regulatory: true, advisory: false, ifrOnly: false, status: "current",
  calendar: { dueDate: "2027-01-31", daysLeft: 0, calendarMonthRule: true }, hours: null, first: "calendar", firstDate: "2027-01-31",
  lastDone: null, waitingEntryId: null, providerId: null, visitId: null, reminder: { nextAt: null, kind: null, snoozedUntil: null }, ...o,
});
const snapOf = (today: string, items: DueItem[], planned: VisitView[] = []) =>
  ({ today, items, visits: { suggested: [], planned } }) as unknown as StatusBody;

/** The item as the engine reports it on `today`: due Jan 31, 2027 with a 30-day lead. */
function itemOn(today: string, dueDate = "2027-01-31"): DueItem {
  const daysLeft = daysBetween(today, dueDate);
  return due({ status: daysLeft < 0 ? "overdue" : daysLeft <= 30 ? "due_soon" : "current", calendar: { dueDate, daysLeft, calendarMonthRule: true }, firstDate: dueDate });
}

/**
 * The cron's decisions run once a day at 13:00 UTC for `days` days: what it would send on each
 * channel, logged the way the cron logs (push only when a device took it, which here is always).
 */
function simulate(opts: {
  from: string; days: number; alerts?: AlertSettings; items: (today: string) => DueItem[];
  snoozes?: SnoozeRow[]; tz?: string; runsPerDay?: number; hour?: number; planned?: (today: string) => VisitView[];
}) {
  const alerts = opts.alerts ?? resolveAlerts(null);
  const sent: SentRow[] = [];
  const sends: { day: string; channel: Channel; keys: string[] }[] = [];
  for (let d = 0; d < opts.days; d++) {
    const today = addDays(opts.from, d);
    for (let run = 0; run < (opts.runsPerDay ?? 1); run++) {
      const now = new Date(`${today}T${String((opts.hour ?? 13) + run).padStart(2, "0")}:00:00Z`);
      const reminders = dueReminders(snapOf(today, opts.items(today), opts.planned?.(today) ?? []), alerts, { sent, snoozes: opts.snoozes ?? [], now });
      for (const channel of openChannels(alerts, sent, { tz: opts.tz, now, notifyDue: true, hasEmail: true })) {
        const p = pendingFor(reminders, channel, sent);
        if (!p.length) continue;
        sends.push({ day: today, channel, keys: p.map((r) => `${r.itemKey}:${r.kind}:${r.nth}`) });
        for (const r of p) sent.push({ item_key: r.itemKey, due_signature: r.dueSignature, kind: r.kind, channel, nth: r.nth, sent_at: now.toISOString() });
      }
    }
  }
  const count = (channel: Channel, kind: string) => sent.filter((s) => s.channel === channel && s.kind === kind).length;
  return { sent, sends, count };
}

test("D7: lead once, lapse once, weekly at most 8 per cycle, on every channel", () => {
  const { count, sent } = simulate({ from: "2026-12-01", days: 200, items: (t) => [itemOn(t)] });
  for (const ch of ["email", "push", "in_app"] as Channel[]) {
    assert.equal(count(ch, "lead"), 1, `${ch} lead`);
    assert.equal(count(ch, "lapse"), 1, `${ch} lapse`);
    assert.equal(count(ch, "weekly"), MAX_WEEKLY, `${ch} weekly`);
  }
  const email = sent.filter((s) => s.channel === "email");
  assert.equal(email.find((s) => s.kind === "lead")!.sent_at.slice(0, 10), "2027-01-01"); // enters the 30-day lead
  assert.equal(email.find((s) => s.kind === "lapse")!.sent_at.slice(0, 10), "2027-02-01"); // the day it is overdue
  const weekly = email.filter((s) => s.kind === "weekly");
  assert.deepEqual(weekly.map((s) => s.nth), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(weekly.map((s) => daysBetween("2027-02-01", s.sent_at.slice(0, 10))), [7, 14, 21, 28, 35, 42, 49, 56]);
});

test("D7: weekly off sends only the lapse", () => {
  const alerts = resolveAlerts({ alerts: { weekly_while_lapsed: false } });
  const { count } = simulate({ from: "2027-01-20", days: 120, alerts, items: (t) => [itemOn(t)] });
  assert.equal(count("email", "lapse"), 1);
  assert.equal(count("email", "weekly"), 0);
});

test("D7: an item already overdue at first sight gets a lapse, never a lead", () => {
  const { count } = simulate({ from: "2027-03-01", days: 3, items: (t) => [itemOn(t)] });
  assert.equal(count("email", "lead"), 0);
  assert.equal(count("email", "lapse"), 1);
});

test("D7: a new due cycle (completion) starts lead, lapse and weekly again", () => {
  // Done on Apr 15, 2027: the next due date moves a year on.
  const items = (t: string) => [itemOn(t, t < "2027-04-15" ? "2027-01-31" : "2028-01-31")];
  const { sent } = simulate({ from: "2026-12-01", days: 500, items });
  const leads = sent.filter((s) => s.channel === "email" && s.kind === "lead");
  assert.deepEqual(leads.map((s) => s.due_signature), ["2027-01-31|", "2028-01-31|"]);
  const lapses = sent.filter((s) => s.channel === "email" && s.kind === "lapse");
  assert.equal(lapses.length, 2);
});

test("D7: at most one push and one email digest per user per day, even with several runs", () => {
  // Three items entering their lead on three days, two of them the same day; the cron runs 4 times a day.
  const items = (t: string) => [
    { ...itemOn(t, "2027-01-31"), key: "mx:a" },
    { ...itemOn(t, "2027-01-31"), key: "mx:b" },
    { ...itemOn(t, "2027-02-01"), key: "mx:c" },
  ];
  const { sends } = simulate({ from: "2026-12-25", days: 90, items, runsPerDay: 4 });
  for (const ch of ["email", "push"] as Channel[]) {
    const days = sends.filter((s) => s.channel === ch).map((s) => s.day);
    assert.equal(new Set(days).size, days.length, `${ch}: one per day`);
  }
  const first = sends.find((s) => s.channel === "email")!;
  assert.deepEqual(first.keys.sort(), ["mx:a:lead:1", "mx:b:lead:1"]); // one digest carries both
});

test("D7: a second run the same day sends no second digest, and the next day picks up what was held", () => {
  const alerts = resolveAlerts(null);
  const now = new Date("2027-01-02T13:00:00Z");
  const sent: SentRow[] = [{ item_key: "mx:a", due_signature: "x", kind: "lead", channel: "email", nth: 1, sent_at: "2027-01-02T13:00:00Z" }];
  assert.ok(sentToday(sent, "email", "UTC", now));
  assert.deepEqual(openChannels(alerts, sent, { tz: "UTC", now, notifyDue: true, hasEmail: true }), ["in_app", "push"]);
  assert.deepEqual(openChannels(alerts, sent, { tz: "UTC", now: new Date("2027-01-03T13:00:00Z"), notifyDue: true, hasEmail: true }), ["in_app", "email", "push"]);
  // The day is the user's: 23:30 UTC on Jan 2 is already Jan 3 in Tokyo.
  assert.ok(!sentToday(sent, "email", "Asia/Tokyo", new Date("2027-01-02T23:30:00Z")));
});

test("D7: notify_due off, channel switches and no email address close channels; the inbox stays", () => {
  const now = new Date("2027-01-02T13:00:00Z");
  assert.deepEqual(openChannels(resolveAlerts(null), [], { tz: null, now, notifyDue: false, hasEmail: true }), ["in_app"]);
  const noPush = resolveAlerts({ alerts: { channels: { push: false } } });
  assert.deepEqual(openChannels(noPush, [], { tz: null, now, notifyDue: true, hasEmail: false }), ["in_app"]);
});

test("D7: quiet hours hold pushes and the next run outside them sends them", () => {
  const q = ALERT_DEFAULTS.quiet_hours;
  assert.ok(inQuietHours(q, "America/New_York", new Date("2027-01-02T03:00:00Z"))); // 22:00 local
  assert.ok(inQuietHours(q, "America/New_York", new Date("2027-01-02T11:30:00Z"))); // 06:30 local
  assert.ok(!inQuietHours(q, "America/New_York", new Date("2027-01-02T13:00:00Z"))); // 08:00 local
  assert.ok(!inQuietHours({ start: "12:00", end: "14:00" }, "UTC", new Date("2027-01-02T14:00:00Z")));
  assert.ok(inQuietHours({ start: "12:00", end: "14:00" }, "UTC", new Date("2027-01-02T12:00:00Z")));
  // Sydney: 13:00 UTC is midnight, inside quiet hours. Runs at 13:00 and 21:00 UTC (08:00 local).
  const { sent } = simulate({ from: "2027-01-01", days: 1, items: (t) => [itemOn(t)], tz: "Australia/Sydney", hour: 13, runsPerDay: 9 });
  assert.equal(sent.find((s) => s.channel === "email")!.sent_at, "2027-01-01T13:00:00.000Z"); // email has no quiet hours
  assert.equal(sent.find((s) => s.channel === "push")!.sent_at, "2027-01-01T20:00:00.000Z"); // 07:00 in Sydney
});

test("D7: snoozes hold an item until they end, or for the whole cycle", () => {
  const until = { item_key: "mx:xpdr", due_signature: "2027-01-31|", until_at: "2027-01-08T09:00:00Z" };
  const a = simulate({ from: "2026-12-25", days: 20, items: (t) => [itemOn(t)], snoozes: [until] });
  assert.equal(a.sent.find((s) => s.channel === "email" && s.kind === "lead")!.sent_at.slice(0, 10), "2027-01-08");
  const cycle = { ...until, until_at: null };
  const b = simulate({ from: "2026-12-25", days: 200, items: (t) => [itemOn(t)], snoozes: [cycle] });
  assert.equal(b.sent.length, 0);
  // A snooze for the old cycle does not hold the next one.
  const c = simulate({ from: "2026-12-25", days: 20, items: (t) => [itemOn(t)], snoozes: [{ ...cycle, due_signature: "2026-01-31|" }] });
  assert.equal(c.count("email", "lead"), 1);
});

test("D7: a planned visit before the first date covers the lead; visit and at-risk reminders go once", () => {
  const visit = (atRisk: VisitView["atRisk"]): VisitView => ({
    id: "v1", suggestionKey: null, status: "planned", weekOf: "2027-01-18", visitDate: null, place: "KXYZ", providerIds: [],
    items: [{ key: "mx:xpdr", earlyBy: null, status: "due_soon", done: false }], clearsBeforeLapse: 1, atRisk,
  });
  const items = (t: string) => [{ ...itemOn(t), visitId: "v1" }];
  const { sent, count } = simulate({ from: "2026-12-25", days: 30, items, planned: () => [visit([])] });
  assert.equal(count("email", "lead"), 0);
  assert.equal(count("email", "visit"), 1);
  assert.equal(sent.find((s) => s.channel === "email" && s.kind === "visit")!.sent_at.slice(0, 10), "2027-01-11"); // 7 days before
  const risk = simulate({ from: "2027-01-01", days: 10, items, planned: () => [visit([{ itemKey: "mx:xpdr", firstDate: "2027-01-13" }])] });
  assert.equal(risk.count("email", "visit_risk"), 1);
});

test("D7: a disabled category sends nothing; a per-item lead override wins", () => {
  const off = resolveAlerts({ alerts: { default: { enabled: false } } });
  assert.equal(simulate({ from: "2026-12-01", days: 100, alerts: off, items: (t) => [itemOn(t)] }).sent.length, 0);
  const today = "2026-12-20";
  const r = dueReminders(snapOf(today, [itemOn(today)]), resolveAlerts(null), {
    sent: [], snoozes: [], now: new Date(), leadOverride: new Map([["mx:xpdr", { days: 60 }]]),
  });
  assert.deepEqual(r.map((x) => x.kind), ["lead"]);
});

// 13 §7.2: unconfirmed entries do not change notifications.
test("unconfirmed entries do not change notifications", () => {
  const TODAY = "2026-11-18";
  const base: DueInput = {
    aircraft: { id: "ac", tail_number: "N734DM" },
    logbook: [{ id: "lb", type: "airframe" }],
    maintenance_item: [
      { id: "mx-annual", kind: "annual", label: "annual", regulatory: true, interval_months: 12, interval_hours: null, last_done_date: "2025-12-03", last_done_hours: 2100 },
      { id: "mx-vor", kind: "vor", label: "vor", regulatory: true, interval_months: 1, interval_hours: null, last_done_date: "2026-10-12", last_done_hours: null, ifr_only: true },
    ],
    item_completion: [
      { id: "c-annual", maintenance_item_id: "mx-annual", ad_compliance_id: null, log_entry_id: "e-annual", done_date: "2025-12-03", done_hours: 2100 },
      { id: "c-vor", maintenance_item_id: "mx-vor", ad_compliance_id: null, log_entry_id: null, done_date: "2026-10-12", done_hours: null },
    ],
    log_entry: [{ id: "e-annual", logbook_id: "lb", entry_date: "2025-12-03", trust: "signed" }],
  };
  const withUnconfirmed: DueInput = {
    ...base,
    log_entry: [...base.log_entry!,
      { id: "ai-1", logbook_id: "lb", page_id: "p1", entry_date: "2026-11-15", trust: "ai_read" },
      { id: "ai-2", logbook_id: "lb", page_id: "p1", entry_date: "2026-11-16", tach: 2210, trust: "ai_read" }],
    item_completion: [...base.item_completion!,
      { id: "c-ai-vor", maintenance_item_id: "mx-vor", ad_compliance_id: null, log_entry_id: "ai-1", done_date: "2026-11-15", done_hours: null },
      { id: "c-ai-ann", maintenance_item_id: "mx-annual", ad_compliance_id: null, log_entry_id: "ai-2", done_date: "2026-11-16", done_hours: 2210 }],
  };
  const run = (input: DueInput) => {
    const snap = computeStatus(input, TODAY);
    const r = dueReminders(snap, resolveAlerts(null), { sent: [], snoozes: [], now: new Date(`${TODAY}T13:00:00Z`) });
    return { r: r.map((x) => [x.itemKey, x.kind, x.dueSignature]), c: composeAircraft({ id: "ac", tail: "N734DM" }, r, TODAY) };
  };
  const a = run(base), b = run(withUnconfirmed);
  assert.ok(a.r.length >= 2, "the fixture has reminders to compare");
  assert.deepEqual(b.r, a.r);
  assert.deepEqual(b.c, a.c);
  assert.ok(!JSON.stringify(b.c).includes("ai-"));
});

// --- Copy (12 §8) -----------------------------------------------------------

test("copy: a lapse, a calendar lead and a multi-item notification", () => {
  const today = "2026-11-18";
  const lapse = composeAircraft({ id: "ac", tail: "N734DM" }, [{
    itemKey: "mx:x", dueSignature: "s", kind: "lapse", nth: 1,
    item: due({ status: "overdue", calendar: { dueDate: "2026-10-31", daysLeft: -18, calendarMonthRule: true } }),
  }], today);
  assert.equal(lapse.title, "N734DM: Transponder check lapsed");
  assert.equal(lapse.body, "Due Oct 31, 2026. The records show nothing newer.");
  assert.equal(lapse.deepLink, "mytaillog://aircraft/ac/status/item/mx:x");
  assert.deepEqual(lapse.actions.map((a) => a.id), ["plan_visit", "remind_friday"]);
  assert.deepEqual(lapse.payload.items, [{ itemKey: "mx:x", dueSignature: "s" }]);

  const lead = composeAircraft({ id: "ac", tail: "N734DM" }, [{
    itemKey: "mx:a", dueSignature: "s", kind: "lead", nth: 1,
    item: due({ label: "Annual", status: "due_soon", calendar: { dueDate: "2026-12-31", daysLeft: 43, calendarMonthRule: true },
      lastDone: { date: "2025-12-18", hours: null, entryId: "e", pageId: "p", pageLabel: "Airframe vol. 2, p. 52", trust: "signed", signer: null } }),
  }], today);
  assert.equal(lead.title, "N734DM: Annual due Dec 31");
  assert.equal(lead.body, "43 days left. Last done Dec 18, 2025, Airframe vol. 2, p. 52.");

  const five = Array.from({ length: 5 }, (_, i) => ({
    itemKey: `mx:${i}`, dueSignature: "s", kind: "lead" as const, nth: 1,
    item: due({ label: `Item ${i}`, status: "due_soon", calendar: { dueDate: "2026-12-31", daysLeft: 43, calendarMonthRule: true } }),
  }));
  const many = composeAircraft({ id: "ac", tail: "N734DM" }, five, today);
  assert.equal(many.title, "N734DM: 5 items coming due");
  assert.equal(many.body, "Item 0 by Dec 31, Item 1 by Dec 31, Item 2 by Dec 31 and 2 more.");
  assert.equal(many.deepLink, "mytaillog://aircraft/ac/status");
  assert.equal(composePush([lead, many])!.title, "Reminders for 2 aircraft");
  assert.equal(composePush([])!, null);
});

test("Remind me Friday: the coming Friday 09:00 local", () => {
  // Wed Nov 18, 2026 in New York → Fri Nov 20 09:00 EST = 14:00 UTC.
  assert.equal(comingFriday0900("America/New_York", new Date("2026-11-18T15:00:00Z")).toISOString(), "2026-11-20T14:00:00.000Z");
  // On a Friday it is next week's.
  assert.equal(comingFriday0900("UTC", new Date("2026-11-20T08:00:00Z")).toISOString(), "2026-11-27T09:00:00.000Z");
  // Across the DST change (Nov 1, 2026 in the US): Thu Oct 29 → Fri Oct 30 09:00 EDT = 13:00 UTC.
  assert.equal(comingFriday0900("America/New_York", new Date("2026-10-29T15:00:00Z")).toISOString(), "2026-10-30T13:00:00.000Z");
  // Unknown zone: UTC.
  assert.equal(comingFriday0900("Not/AZone", new Date("2026-11-18T15:00:00Z")).toISOString(), "2026-11-20T09:00:00.000Z");
});

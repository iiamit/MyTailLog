import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveAlerts,
  reminderCategory,
  dueSignature,
  itemKey,
  isDueForReminder,
  ALERT_DEFAULTS,
} from "../src/lib/reminders";

// --- resolveAlerts ---------------------------------------------------------
test("resolveAlerts: null/empty prefs → the full defaults", () => {
  assert.deepEqual(resolveAlerts(null), ALERT_DEFAULTS);
  assert.deepEqual(resolveAlerts(undefined), ALERT_DEFAULTS);
  assert.deepEqual(resolveAlerts({}), ALERT_DEFAULTS);
});

test("resolveAlerts: partial user settings merge over defaults", () => {
  const r = resolveAlerts({ alerts: { annual: { lead_days: 45 }, oil: { enabled: false } } });
  assert.equal(r.annual.lead_days, 45);
  assert.equal(r.annual.enabled, ALERT_DEFAULTS.annual.enabled); // untouched
  assert.equal(r.oil.enabled, false);
  assert.equal(r.oil.lead_hours, ALERT_DEFAULTS.oil.lead_hours); // untouched
  assert.deepEqual(r.ad, ALERT_DEFAULTS.ad);
});

test("resolveAlerts: invalid numbers (NaN, negative, wrong type) fall back to defaults", () => {
  const r = resolveAlerts({
    alerts: {
      annual: { lead_days: -5 },
      ad: { lead_days: NaN, lead_hours: "10" as unknown as number },
    },
  });
  assert.equal(r.annual.lead_days, ALERT_DEFAULTS.annual.lead_days);
  assert.equal(r.ad.lead_days, ALERT_DEFAULTS.ad.lead_days);
  assert.equal(r.ad.lead_hours, ALERT_DEFAULTS.ad.lead_hours);
});

test("resolveAlerts: zero is a valid lead value (>= 0)", () => {
  const r = resolveAlerts({ alerts: { annual: { lead_days: 0 } } });
  assert.equal(r.annual.lead_days, 0);
});

test("resolveAlerts: non-boolean enabled falls back to default", () => {
  const r = resolveAlerts({ alerts: { annual: { enabled: "yes" as unknown as boolean } } });
  assert.equal(r.annual.enabled, ALERT_DEFAULTS.annual.enabled);
});

// --- reminderCategory ------------------------------------------------------
test("reminderCategory: source 'ad' wins regardless of kind", () => {
  assert.equal(reminderCategory({ source: "ad", kind: "annual" }), "ad");
});

test("reminderCategory: kind maps to annual / oil / default", () => {
  assert.equal(reminderCategory({ source: "maintenance", kind: "annual" }), "annual");
  assert.equal(reminderCategory({ source: "maintenance", kind: "oil_change" }), "oil");
  assert.equal(reminderCategory({ source: "maintenance", kind: "transponder" }), "default");
});

// --- dueSignature ----------------------------------------------------------
test("dueSignature: combines date and hours; nulls become empty strings", () => {
  assert.equal(dueSignature({ nextDueDate: "2026-01-01", nextDueHours: 1100 }), "2026-01-01|1100");
  assert.equal(dueSignature({ nextDueDate: null, nextDueHours: null }), "|");
  assert.equal(dueSignature({ nextDueDate: "2026-01-01", nextDueHours: null }), "2026-01-01|");
});

test("dueSignature: a new due cycle yields a different signature", () => {
  const a = dueSignature({ nextDueDate: "2026-01-01", nextDueHours: 1100 });
  const b = dueSignature({ nextDueDate: "2027-01-01", nextDueHours: 1200 });
  assert.notEqual(a, b);
});

// --- itemKey ---------------------------------------------------------------
test("itemKey: ad → 'ad:<id>', anything else → 'maint:<id>'", () => {
  assert.equal(itemKey({ source: "ad", id: "x1" }), "ad:x1");
  assert.equal(itemKey({ source: "maintenance", id: "x2" }), "maint:x2");
});

// --- isDueForReminder ------------------------------------------------------
const TODAY = new Date("2026-01-01T12:00:00Z");
const alerts = resolveAlerts(null); // annual lead 90d, oil 10h, ad 30d/25h

test("isDueForReminder: date within the lead window → true", () => {
  assert.equal(
    isDueForReminder({ source: "maintenance", kind: "annual", nextDueDate: "2026-02-01", nextDueHours: null }, null, alerts, TODAY),
    true,
  );
});

test("isDueForReminder: date beyond the lead window → false", () => {
  assert.equal(
    isDueForReminder({ source: "maintenance", kind: "annual", nextDueDate: "2026-12-01", nextDueHours: null }, null, alerts, TODAY),
    false,
  );
});

test("isDueForReminder: an overdue date (negative daysUntil) → true", () => {
  assert.equal(
    isDueForReminder({ source: "maintenance", kind: "annual", nextDueDate: "2025-06-01", nextDueHours: null }, null, alerts, TODAY),
    true,
  );
});

test("isDueForReminder: hours within lead window (oil, 10h) → true; beyond → false", () => {
  assert.equal(
    isDueForReminder({ source: "maintenance", kind: "oil_change", nextDueDate: null, nextDueHours: 105 }, 100, alerts, TODAY),
    true,
  );
  assert.equal(
    isDueForReminder({ source: "maintenance", kind: "oil_change", nextDueDate: null, nextDueHours: 120 }, 100, alerts, TODAY),
    false,
  );
});

test("isDueForReminder: hours axis needs a known current-hours value", () => {
  assert.equal(
    isDueForReminder({ source: "maintenance", kind: "oil_change", nextDueDate: null, nextDueHours: 105 }, null, alerts, TODAY),
    false,
  );
});

test("isDueForReminder: disabled category → always false", () => {
  const off = resolveAlerts({ alerts: { annual: { enabled: false } } });
  assert.equal(
    isDueForReminder({ source: "maintenance", kind: "annual", nextDueDate: "2026-01-01", nextDueHours: null }, null, off, TODAY),
    false,
  );
});

test("isDueForReminder: date and hours evaluated independently — either axis qualifies", () => {
  // ad category: date far out (>30d) but hours within 25h → true.
  assert.equal(
    isDueForReminder({ source: "ad", kind: "whatever", nextDueDate: "2026-12-01", nextDueHours: 1010 }, 1000, alerts, TODAY),
    true,
  );
});

test("isDueForReminder: neither axis in window → false", () => {
  assert.equal(
    isDueForReminder({ source: "ad", kind: "whatever", nextDueDate: "2026-12-01", nextDueHours: 1100 }, 1000, alerts, TODAY),
    false,
  );
});

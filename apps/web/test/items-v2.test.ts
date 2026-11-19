import { test } from "node:test";
import assert from "node:assert/strict";
import { countedOn, everyText, pickItemForm, remindText } from "../src/lib/v2/items";

const rule = (kind: string, m: number | null, h: number | null, expires_on: string | null = null) =>
  ({ kind, interval_months: m, interval_hours: h, expires_on });

test("Every column reads the rule in words (W-MAINT-06)", () => {
  assert.equal(everyText(rule("annual", 12, null)), "12 calendar months");
  assert.equal(everyText(rule("oil_change", 4, 50)), "50 hours or 4 months");
  assert.equal(everyText(rule("vor", 1, null)), "30 days");
  assert.equal(everyText(rule("prop_overhaul", 72, null)), "72 months");
  assert.equal(everyText(rule("elt_battery", null, null, "2027-03-03")), "expires Mar 3, 2027");
  assert.equal(everyText(rule("other", null, null)), "not set");
});

test("Counted on and Remind", () => {
  assert.equal(countedOn({ kind: "annual", interval_hours: null, meter: null }), "Calendar");
  assert.equal(countedOn({ kind: "oil_change", interval_hours: 50, meter: null }), "Hobbs");
  assert.equal(countedOn({ kind: "hundred_hour", interval_hours: 100, meter: null }), "Tach");
  assert.equal(countedOn({ kind: "hundred_hour", interval_hours: 100, meter: "airframe" }), "Airframe");
  assert.equal(remindText(30, null), "30 days");
  assert.equal(remindText(30, 10), "30 days or 10 hours");
  assert.equal(remindText(null, null), "your default");
});

test("item form boundary", () => {
  const form = (o: Record<string, string>) => (k: string) => o[k];
  assert.deepEqual(pickItemForm(form({ label: " " })), { error: "Give the item a name." });
  assert.deepEqual(pickItemForm(form({ label: "Oil", interval_hours: "-1" })), { error: "Intervals and hours are zero or more." });
  assert.deepEqual(pickItemForm(form({ label: "Oil", line: "wing" })), { error: "Pick a logbook." });
  assert.deepEqual(pickItemForm(form({ label: "Oil", provider_id: "x' or 1=1" })), { error: "Pick a shop or mechanic." });
  assert.deepEqual(pickItemForm(form({ label: "Oil", expires_on: "soon" })), { error: "Pick a date." });
  const ok = pickItemForm(form({
    label: "Oil and filter", kind: "oil_change", interval_hours: "50", interval_months: "", line: "engine", shop_kind: "self",
    ifr_only: "on", visit_window_days: "60", remind_lead_hours: "10", regulatory: "on", meter: "hobbs",
  }));
  assert.ok(!("error" in ok));
  assert.equal(ok.item.interval_hours, 50);
  assert.equal(ok.item.interval_months, null);
  assert.equal(ok.item.regulatory, true);
  assert.equal(ok.item.meter, "hobbs");
  assert.deepEqual(ok.extras, {
    line: "engine", shop_kind: "self", provider_id: null, ifr_only: true, expires_on: null,
    visit_window_days: 60, visit_window_hours: null, remind_lead_days: null, remind_lead_hours: 10,
  });
});

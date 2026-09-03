import { test } from "node:test";
import assert from "node:assert/strict";
import { pickReading, pickReset, validNumber, isIsoDate } from "../src/lib/writes/meters";
import { pickMaintenanceFields, markDonePlan } from "../src/lib/writes/maintenance";
import { pickAdFields, trackPlan } from "../src/lib/writes/compliance";
import { pickComponentFields, proposalKey } from "../src/lib/writes/equipment";

// --- meters ------------------------------------------------------------------

test("validNumber / isIsoDate guard the trust boundary", () => {
  assert.equal(validNumber(null), true);
  assert.equal(validNumber(undefined), true);
  assert.equal(validNumber(0), true);
  assert.equal(validNumber(1234.5), true);
  assert.equal(validNumber(-1), false);
  assert.equal(validNumber("1234"), false);
  assert.equal(validNumber(Infinity), false);
  assert.equal(isIsoDate("2026-08-12"), true);
  assert.equal(isIsoDate("8/12/2026"), false);
  assert.equal(isIsoDate(""), false);
});

test("pickReading: at least one meter, nothing negative, date defaults to today", () => {
  assert.deepEqual(pickReading({ date: "2026-08-12", tach: 1500.4 }), {
    reading_date: "2026-08-12",
    tach: 1500.4,
    hobbs: null,
    airframe: null,
  });
  const defaulted = pickReading({ hobbs: 10 });
  assert.ok("reading_date" in defaulted && isIsoDate(defaulted.reading_date));
  assert.deepEqual(pickReading({ date: "2026-08-12" }), { error: "Enter at least one reading." });
  assert.deepEqual(pickReading({ date: "2026-08-12", tach: -1 }), { error: "Readings must be zero or a positive number." });
  assert.deepEqual(pickReading({ date: "", tach: 1 }), { error: "Pick a date." });
  assert.ok("error" in pickReading(null));
});

test("pickReset: known meter, a date, non-negative readings, trimmed notes", () => {
  assert.deepEqual(pickReset({ meter: "tach", date: "2026-01-02", prior: 4321.1, next: 0, notes: "  new unit " }), {
    meter: "tach",
    reset_date: "2026-01-02",
    prior_value: 4321.1,
    new_value: 0,
    notes: "new unit",
  });
  assert.deepEqual(pickReset({ meter: "odometer", date: "2026-01-02", prior: null, next: 0 }), { error: "Pick a meter." });
  assert.ok("error" in pickReset({ meter: "hobbs", date: "", prior: null, next: 0 }));
  assert.ok("error" in pickReset({ meter: "hobbs", date: "2026-01-02", prior: -5, next: 0 }));
});

// --- maintenance -------------------------------------------------------------

test("pickMaintenanceFields: label required, meter known, numbers sane, unknown keys dropped", () => {
  const r = pickMaintenanceFields({
    kind: "annual",
    label: " Annual ",
    regulatory: true,
    interval_months: 12,
    interval_hours: null,
    last_done_date: "2025-06-01",
    last_done_hours: 1200,
    notes: null,
    meter: null,
    aircraft_id: "not-yours",
    next_due_date: "1999-01-01",
  });
  assert.ok("fields" in r);
  assert.deepEqual(r.fields, {
    kind: "annual",
    label: "Annual",
    regulatory: true,
    interval_months: 12,
    interval_hours: null,
    last_done_date: "2025-06-01",
    last_done_hours: 1200,
    notes: null,
    meter: null,
  });
  assert.deepEqual(pickMaintenanceFields({ label: "  " }), { error: "Label is required." });
  assert.deepEqual(pickMaintenanceFields({ label: "Oil", meter: "odometer" }), { error: "Unknown meter." });
  assert.ok("error" in pickMaintenanceFields({ label: "Oil", interval_hours: -50 }));
  assert.ok("error" in pickMaintenanceFields({ label: "Oil", last_done_date: "June" }));
  // kind defaults to "other", as the web form always did
  const k = pickMaintenanceFields({ label: "Wash" });
  assert.ok("fields" in k && k.fields.kind === "other");
});

const vor = { kind: "vor", interval_months: 1, interval_hours: null, updated_at: "2026-08-01T10:00:00.000Z" };

test("markDonePlan without a base applies as today (web, legacy phones)", () => {
  const r = markDonePlan(vor, { date: "2026-08-12", hours: 1500.4 });
  assert.deepEqual(r, {
    patch: {
      last_done_date: "2026-08-12",
      last_done_hours: 1500.4,
      next_due_date: "2026-09-11", // 91.171: exactly "preceding 30 days"
      next_due_hours: null,
    },
  });
});

test("markDonePlan: §2 conflict rule — a base older than the row's updated_at writes nothing", () => {
  assert.deepEqual(markDonePlan(vor, { date: "2026-08-12" }, "2026-07-31T00:00:00.000Z"), { conflict: true });
  // equal or newer base: the phone saw the current row — apply
  assert.ok("patch" in markDonePlan(vor, { date: "2026-08-12" }, "2026-08-01T10:00:00.000Z"));
  assert.ok("patch" in markDonePlan(vor, { date: "2026-08-12" }, "2026-08-02T00:00:00.000Z"));
});

test("markDonePlan: date absent = today, null clears, bad input is an error", () => {
  const today = markDonePlan(vor, {});
  assert.ok("patch" in today && today.patch.last_done_date === new Date().toISOString().slice(0, 10));
  const cleared = markDonePlan(vor, { date: null, hours: null });
  assert.deepEqual(cleared, {
    patch: { last_done_date: null, last_done_hours: null, next_due_date: null, next_due_hours: null },
  });
  assert.deepEqual(markDonePlan(vor, { date: "yesterday" }), { error: "Pick a date." });
  assert.ok("error" in markDonePlan(vor, { date: "2026-08-12", hours: -1 }));
});

// --- compliance --------------------------------------------------------------

test("pickAdFields: reference/kind/status required, next-due inputs typed", () => {
  const r = pickAdFields({
    kind: "ad",
    reference: " 2020-01-02 ",
    status: "complied",
    recurring: true,
    interval_hours: 100,
    complied_date: "2026-01-01",
    complied_hours: 1000,
    aircraft_id: "not-yours",
    verified_at: "never",
  });
  assert.ok("fields" in r);
  assert.equal(r.fields.reference, "2020-01-02");
  assert.equal(r.fields.recurring, true);
  assert.equal(r.fields.title, null);
  assert.equal("aircraft_id" in r.fields, false);
  assert.deepEqual(pickAdFields({ kind: "ad", reference: "", status: "open" }), { error: "AD/SB number is required." });
  assert.deepEqual(pickAdFields({ kind: "tcds", reference: "x", status: "open" }), { error: "Pick AD or SB." });
  assert.deepEqual(pickAdFields({ kind: "sb", reference: "x", status: "done" }), { error: "Pick a status." });
  assert.ok("error" in pickAdFields({ kind: "sb", reference: "x", status: "open", complied_date: "Jan 1" }));
});

test("trackPlan: one-time by default; a recurring AD needs an interval; bounds enforced", () => {
  const one = trackPlan({ reference: " 2020-01-02 " });
  assert.ok("row" in one);
  assert.deepEqual(one.row, {
    kind: "ad",
    reference: "2020-01-02",
    title: null,
    applicability: null,
    recurring: false,
    interval_hours: null,
    interval_months: null,
    next_due_date: null,
    next_due_hours: null,
    status: "open",
  });
  const rec = trackPlan({ id: "m1", reference: "x", recurring: true, intervalHours: 100, nextDueDate: "2026-12-01" });
  assert.ok("row" in rec && rec.row.id === "m1" && rec.row.interval_hours === 100 && rec.row.next_due_date === "2026-12-01");
  // intervals are ignored unless recurring
  const ignored = trackPlan({ reference: "x", recurring: false, intervalHours: 100 });
  assert.ok("row" in ignored && ignored.row.interval_hours === null);
  assert.deepEqual(trackPlan({ reference: "x", recurring: true }), {
    error: "A recurring AD needs an interval — hours, months, or both.",
  });
  assert.ok("error" in trackPlan({ reference: "x", recurring: true, intervalMonths: 1.5 }));
  assert.ok("error" in trackPlan({ reference: "x", nextDueHours: -1 }));
  assert.ok("error" in trackPlan({ reference: "x", nextDueDate: "soon" }));
  assert.deepEqual(trackPlan({ reference: "  " }), { error: "AD number required." });
});

// --- equipment ---------------------------------------------------------------

test("pickComponentFields: name required, life limit typed, unknown keys dropped", () => {
  const r = pickComponentFields({
    name: " Engine ",
    make: "Lycoming",
    life_limit_value: 2000,
    life_limit_unit: "hours",
    is_installed: false, // must not pass through — that's markRemoved's job
  });
  assert.ok("fields" in r);
  assert.equal(r.fields.name, "Engine");
  assert.equal("is_installed" in r.fields, false);
  assert.deepEqual(pickComponentFields({ name: "" }), { error: "Name is required." });
  assert.ok("error" in pickComponentFields({ name: "x", life_limit_unit: "years" }));
  assert.ok("error" in pickComponentFields({ name: "x", life_limit_value: -1 }));
  assert.ok("error" in pickComponentFields({ name: "x", install_date: "2020" }));
});

test("proposalKey matches on P/N+S/N when known, else on name", () => {
  assert.equal(proposalKey({ name: "Alt", part_number: "ALX-9524", serial_number: " 123 " }), "ps:alx-9524|123");
  assert.equal(proposalKey({ name: "Alt", part_number: null, serial_number: "123" }), "ps:|123");
  assert.equal(proposalKey({ name: " Alternator ", part_number: null, serial_number: null }), "n:alternator");
});

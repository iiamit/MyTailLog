import { test } from "node:test";
import assert from "node:assert/strict";
import { dailyCallCap, callsInLastDay } from "../src/lib/extraction/aiContext";

// The daily AI allowance, as SHOWN to a user. Reported from the field: "I just
// received a 'Daily AI limit reached (100 calls)' when trying to extract. Will
// that reset for tomorrow, I'm assuming?" — nothing on the profile showed the
// allowance, and the window is not the calendar day people assume.

const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

test("the window is a rolling 24 hours, not a calendar day", () => {
  // reserve_ai_call_v2 counts created_at > now() - interval '24 hours'. A call
  // made 25 hours ago has already freed up, whatever the date says.
  assert.equal(callsInLastDay([{ created_at: ago(25) }]), 0);
  assert.equal(callsInLastDay([{ created_at: ago(23) }]), 1);
});

test("calls age out one at a time", () => {
  const rows = [ago(30), ago(26), ago(20), ago(1)].map((created_at) => ({ created_at }));
  assert.equal(callsInLastDay(rows), 2, "only the two inside the window count");
});

test("rows with no timestamp are not counted", () => {
  assert.equal(callsInLastDay([{ created_at: null }, {}]), 0);
});

test("the cap shown is the cap enforced", () => {
  // Exported from aiContext so the number on the profile cannot drift from the
  // one that stops the request.
  assert.equal(dailyCallCap(false), Number(process.env.AI_SHARED_USER_DAILY_CALLS ?? 100));
  assert.equal(dailyCallCap(true), Number(process.env.AI_OWN_USER_DAILY_CALLS ?? 1000));
});

test("bringing your own key raises the ceiling", () => {
  assert.ok(dailyCallCap(true) > dailyCallCap(false));
});

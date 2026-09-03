import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pageNeedsLook, cleanUnconfirmed, fieldChip, entryBadge, toForm, validateEntry, validateReading,
  recentReadings, readAllowance, extractLabel, spotlightStyle, drawerSnap, swipeReveals, entriesOn,
  type ReviewEntry,
} from "../../mobile/src/review-rules";

// The phone's review rules, tested here because apps/mobile has no runner.
// Each of these is a branch an owner would hit standing at the aircraft: a
// wrong "needs a look", a payload the server rejects, a ring drawn in the
// corner for a field the model couldn't place.

const E = (o: Partial<ReviewEntry>): ReviewEntry => ({
  id: "e1", aircraft_id: "a", logbook_id: "l", page_id: "p1", entry_date: "2026-07-05",
  hobbs: null, tach: 4141.6, airframe: null, description: "Oil change", work_performed: null, parts: null,
  signature_name: null, mechanic_cert_number: null, ad_refs: [], sb_refs: [],
  confidence: 0.9, field_confidence: null, field_boxes: null, owner_confirmed: false,
  is_continuation: false, entry_index: 0, updated_at: "2026-07-05T00:00:00Z", ...o,
});

test("a page needs a look only when extracted AND holding an unconfirmed entry", () => {
  const page = { id: "p1", extraction_status: "extracted" };
  assert.equal(pageNeedsLook(page, [E({})]), true);
  assert.equal(pageNeedsLook(page, [E({ owner_confirmed: true })]), false);
  // A cover or a blank extracts to nothing — nothing to review, never nags.
  assert.equal(pageNeedsLook(page, []), false);
  assert.equal(pageNeedsLook({ id: "p1", extraction_status: "pending" }, [E({})]), false);
  // Entries on another page don't count against this one.
  assert.equal(pageNeedsLook(page, [E({ page_id: "p2" })]), false);
});

test("confirm-clean picks exactly what the server's confirmClean would", () => {
  const rows = [
    E({ id: "clean" }),
    E({ id: "done", owner_confirmed: true }),
    E({ id: "weak", field_confidence: { tach: 0.4 } }),
    E({ id: "unsure", confidence: 0.5 }),
    E({ id: "tail", is_continuation: true }),
    E({ id: "unscored", confidence: null }),
  ];
  assert.deepEqual(cleanUnconfirmed(rows), ["clean"]);
});

test("field chips: only a doubtful field gets one, and it is a word", () => {
  assert.equal(fieldChip({ tach: 0.5, hobbs: 0.9 }, "tach"), "check");
  assert.equal(fieldChip({ tach: 0.5, hobbs: 0.9 }, "hobbs"), null);
  assert.equal(fieldChip(null, "tach"), null);
  assert.equal(fieldChip({ tach: 0.75 }, "tach"), null, "the threshold itself is trusted, same as the web");
});

test("entry badge reads in the owner's words", () => {
  assert.equal(entryBadge(E({ owner_confirmed: true })), "Confirmed");
  assert.equal(entryBadge(E({ is_continuation: true })), "Continues from the previous page");
  assert.equal(entryBadge(E({})), "Looks right");
  assert.equal(entryBadge(E({ confidence: 0.3 })), "Needs a look");
});

test("entriesOn keeps the order the entries appear on the page", () => {
  const rows = [E({ id: "b", entry_index: 1 }), E({ id: "c", entry_index: null }), E({ id: "a", entry_index: 0 }), E({ id: "x", page_id: "p2" })];
  assert.deepEqual(entriesOn(rows, "p1").map((e) => e.id), ["a", "b", "c"]);
});

test("validateEntry: a good form becomes the typed payload", () => {
  const v = validateEntry({ ...toForm(E({})), hobbs: "1234.56", ad_refs: "2021-05-12, 2019-01-01", sb_refs: "" });
  assert.ok("fields" in v);
  assert.equal(v.fields.hobbs, 1234.6, "meters are tenths");
  assert.equal(v.fields.tach, 4141.6);
  assert.equal(v.fields.airframe, null);
  assert.deepEqual(v.fields.ad_refs, ["2021-05-12", "2019-01-01"]);
  assert.deepEqual(v.fields.sb_refs, []);
  assert.equal(v.fields.work_performed, null, "blank text is null, not an empty string");
});

test("validateEntry: the one thing to fix, in plain words", () => {
  const base = toForm(E({}));
  assert.deepEqual(validateEntry({ ...base, entry_date: "7/5/26" }), { error: "Pick a date from the calendar." });
  assert.deepEqual(validateEntry({ ...base, entry_date: "2026-02-31" }), { error: "That date doesn't exist." });
  assert.deepEqual(validateEntry({ ...base, tach: "abc" }), { error: "Tach must be a number of hours." });
  assert.deepEqual(validateEntry({ ...base, hobbs: "-1" }), { error: "Hobbs must be a number of hours." });
  assert.deepEqual(validateEntry({ ...base, description: "", work_performed: "" }), { error: "Write what was done, even a few words." });
  assert.ok("fields" in validateEntry({ ...base, entry_date: "" }), "an undated entry is allowed — the scan may not show one");
});

test("toForm round-trips nulls to empty strings", () => {
  const f = toForm(null);
  assert.equal(f.entry_date, "");
  assert.equal(f.tach, "");
  assert.equal(f.ad_refs, "");
  assert.equal(toForm(E({ ad_refs: ["a", "b"] })).ad_refs, "a, b");
});

test("validateReading needs a real date and at least one meter", () => {
  assert.deepEqual(validateReading({ date: "", tach: 1, hobbs: null }), { error: "Pick a date from the calendar." });
  assert.deepEqual(validateReading({ date: "2026-07-05", tach: null, hobbs: null }), { error: "Record at least one meter." });
  assert.deepEqual(validateReading({ date: "2026-07-05", tach: -1, hobbs: null }), { error: "Hours can't be negative." });
  assert.deepEqual(validateReading({ date: "2026-07-05", tach: 4141.6, hobbs: null }), { payload: { date: "2026-07-05", tach: 4141.6, hobbs: null } });
});

test("recent readings: newest first, capped at 30", () => {
  const R = (id: string, date: string, created = "2026-01-01T00:00:00Z") =>
    ({ id, aircraft_id: "a", reading_date: date, tach: 1, hobbs: null, airframe: null, source: "manual", created_at: created, updated_at: created });
  const rows = Array.from({ length: 35 }, (_, n) => R(`r${n}`, `2026-01-${String((n % 28) + 1).padStart(2, "0")}`));
  const out = recentReadings(rows);
  assert.equal(out.length, 30);
  assert.equal(out[0].reading_date, "2026-01-28");
  // Same day: the later save wins the top spot.
  const same = recentReadings([R("old", "2026-05-01", "2026-05-01T08:00:00Z"), R("new", "2026-05-01", "2026-05-01T18:00:00Z")]);
  assert.deepEqual(same.map((r) => r.id), ["new", "old"]);
});

test("allowance: read from the access response, degrade to the plain label", () => {
  assert.deepEqual(readAllowance({ access: [] }), null, "older servers send no allowance");
  assert.deepEqual(readAllowance({ allowance: { callsToday: 3, dailyCap: 100 } }), { callsToday: 3, dailyCap: 100 });
  assert.equal(readAllowance({ allowance: { callsToday: "3", dailyCap: 100 } }), null);
  assert.equal(readAllowance({ allowance: { callsToday: 0, dailyCap: 0 } }), null, "a zero cap is not a cap");
  assert.deepEqual(extractLabel(null), { label: "Read this page", exhausted: false });
  assert.deepEqual(extractLabel({ callsToday: 3, dailyCap: 100 }), { label: "Read this page · 97 of 100 left today", exhausted: false });
  assert.deepEqual(extractLabel({ callsToday: 100, dailyCap: 100 }), { label: "Daily limit reached (100 pages)", exhausted: true });
  assert.equal(extractLabel({ callsToday: 140, dailyCap: 100 }).exhausted, true, "over the cap never goes negative");
});

test("spotlight: percentages of the image, padded, clamped, and nothing for an unlocated field", () => {
  assert.equal(spotlightStyle(null), null);
  assert.equal(spotlightStyle({ x: 0, y: 0, w: 0, h: 0 }), null, "all-zero = the model couldn't place it");
  assert.equal(spotlightStyle({ x: 0, y: 0, w: 1, h: 1 }), null, "the whole page is not a location");
  const s = spotlightStyle({ x: 0.5, y: 0.5, w: 0.1, h: 0.05 }, 0.5);
  assert.deepEqual(s, { left: "45.00%", top: "47.50%", width: "20.00%", height: "10.00%" });
  // A box at the edge never pads past the image.
  const edge = spotlightStyle({ x: 0.95, y: 0.0, w: 0.05, h: 0.05 }, 0.5);
  assert.equal(edge?.left, "92.50%");
  assert.equal(edge?.width, "7.50%");
  assert.equal(edge?.top, "0.00%");
});

test("drawer snaps only past the threshold; a wobble stays put", () => {
  assert.equal(drawerSnap(false, -60), true, "swipe up opens");
  assert.equal(drawerSnap(true, 60), false, "swipe down closes");
  assert.equal(drawerSnap(false, -10), false);
  assert.equal(drawerSnap(true, 10), true);
  assert.equal(drawerSnap(true, -200), true, "already open, dragging up keeps it open");
});

test("swipe-to-delete needs a clear leftward drag", () => {
  assert.equal(swipeReveals(-80, 5), true);
  assert.equal(swipeReveals(-30, 5), false, "too short");
  assert.equal(swipeReveals(-80, 60), false, "that was a scroll");
  assert.equal(swipeReveals(80, 0), false, "wrong way");
});

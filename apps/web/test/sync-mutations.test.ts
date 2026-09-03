import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MUTATIONS,
  MUTATION_TYPES,
  validateEnvelope,
  validateMutation,
  needsBase,
  translateLegacy,
  toLegacyResult,
  mineFields,
  changedFields,
  alreadyApplied,
} from "../src/lib/sync/mutations";

// The pure half of POST /api/sync/push (CONTRACT §2–3): the envelope, the base
// rule, legacy-action translation and the "did my retry already land?" check.

const upd = (over: Record<string, unknown> = {}) => ({
  id: "m1",
  type: "entry.update",
  aircraftId: "a1",
  payload: { entryId: "e1", fields: { description: "x" } },
  base: "2026-09-01T10:00:00.000Z",
  ...over,
});

test("envelope: needs { mutations: [] } and no more than 100", () => {
  assert.ok("error" in validateEnvelope(null));
  assert.ok("error" in validateEnvelope({ actions: [] }));
  assert.ok("error" in validateEnvelope({ mutations: Array(101).fill({}) }));
  assert.deepEqual(validateEnvelope({ mutations: [] }), { mutations: [] });
});

test("a mutation needs an id, a known type and an aircraft", () => {
  assert.match((validateMutation({ type: "entry.update" }) as { error: string }).error, /id/);
  assert.match((validateMutation(upd({ type: "entry.frobnicate" })) as { error: string }).error, /Unknown change type/);
  assert.match((validateMutation(upd({ aircraftId: "" })) as { error: string }).error, /aircraft/);
  // The id is echoed even when the rest is wrong, so the phone can match the result.
  assert.equal((validateMutation(upd({ type: "nope" })) as { id: string }).id, "m1");
});

test("conflict rule: an update or delete without base is an error, an insert needs none", () => {
  const r = validateMutation(upd({ base: undefined }));
  assert.ok("error" in r && /based on/.test(r.error));
  assert.ok("error" in validateMutation(upd({ type: "entry.delete", payload: { entryId: "e1" }, base: "" })));
  assert.ok("ok" in validateMutation(upd({ type: "entry.create", payload: { id: "e2", logbookId: "l1", fields: {} }, base: undefined })));
  assert.ok("error" in validateMutation(upd({ base: "yesterday" })), "an unparseable base is refused");
});

test("upserts need base only when they carry an id", () => {
  assert.equal(needsBase("mx.upsert", { item: {} }), false);
  assert.equal(needsBase("mx.upsert", { id: "i1", item: {} }), true);
  assert.equal(needsBase("component.upsert", { id: "" }), false);
  const r = validateMutation(upd({ type: "wb.upsert", payload: { id: "w1", fields: {} }, base: undefined }));
  assert.ok("error" in r);
});

test("online-only types are refused before dispatch, with owner-readable copy", () => {
  const r = validateMutation(upd({ type: "page.extract", payload: { pageId: "p1" }, base: undefined }));
  assert.ok("error" in r && /connection/.test(r.error));
  assert.doesNotMatch((r as { error: string }).error, /queue|mutation/i);
});

test("the catalogue covers every §3 type exactly once", () => {
  assert.equal(new Set(MUTATION_TYPES).size, MUTATION_TYPES.length);
  for (const t of ["entry.merge", "page.delete", "reading.update", "mx.complete", "proposals.dismiss", "squawk.reopen", "oil.delete", "document.setEntry", "wb.delete"]) {
    assert.ok(t in MUTATIONS, t);
  }
});

// --- legacy /actions ---------------------------------------------------------

test("legacy reading/oil/squawk translate to their create types, keyed by the action id", () => {
  const r = translateLegacy("a1", { id: "r1", type: "reading", date: "2026-08-12", tach: 1500.4, hobbs: 900.2 });
  assert.ok("ok" in r);
  assert.equal(r.ok.type, "reading.create");
  assert.deepEqual(r.ok.payload, { id: "r1", date: "2026-08-12", tach: 1500.4, hobbs: 900.2 });
  assert.equal(r.ok.base, undefined);

  const o = translateLegacy("a1", { id: "o1", type: "oil", date: "2026-08-12", quarts: 1.5, tach: 1500.4 });
  assert.ok("ok" in o && o.ok.type === "oil.create" && o.ok.payload.quarts === 1.5);

  const s = translateLegacy("a1", { id: "s1", type: "squawk", description: "Nav light out", severity: "low", reported_at: "2026-08-12T10:00:00Z" });
  assert.ok("ok" in s && s.ok.type === "squawk.create");
  assert.equal(s.ok.payload.reportedAt, "2026-08-12T10:00:00Z");
});

test("legacy mx_complete keeps LWW without base and gains the check with it", () => {
  const legacy = { id: "c1", type: "mx_complete", item_id: "i1", date: "2026-08-12", hours: 1500, logbook_id: "l1", description: "VOR check", signature_name: "Me" };
  const old = translateLegacy("a1", legacy);
  assert.ok("ok" in old && old.ok.type === "mx.complete");
  assert.equal(old.ok.base, undefined, "an old build sends no base and must not be refused");
  assert.equal(old.ok.payload.itemId, "i1");
  assert.equal(old.ok.payload.logbookId, "l1");
  assert.equal(old.ok.payload.entryId, "c1", "the log entry keeps the action id as its key (replay-safe)");
  const fresh = translateLegacy("a1", { ...legacy, base: "2026-09-01T00:00:00Z" });
  assert.ok("ok" in fresh && fresh.ok.base === "2026-09-01T00:00:00Z");
});

test("legacy: unknown types and missing ids are per-action errors, not batch failures", () => {
  assert.deepEqual(translateLegacy("a1", { id: "bad-1", type: "nonsense" }), { error: "Unknown action type: nonsense", id: "bad-1" });
  assert.ok("error" in translateLegacy("a1", { type: "reading" }));
});

test("legacy result shape is unchanged: { id, ok, error? }", () => {
  assert.deepEqual(toLegacyResult({ id: "x", status: "ok", row: { id: "x" } }), { id: "x", ok: true });
  assert.deepEqual(toLegacyResult({ id: "x", status: "error", error: "nope" }), { id: "x", ok: false, error: "nope" });
  const c = toLegacyResult({ id: "x", status: "conflict", row: {} });
  assert.equal(c.ok, false);
  assert.match(c.error!, /changed this/);
});

// --- mine vs theirs --------------------------------------------------------

test("mineFields: nested field bags flatten, identifiers drop, camelCase becomes columns", () => {
  assert.deepEqual(mineFields({ entryId: "e1", fields: { description: "x", hobbs: 1 } }), { description: "x", hobbs: 1 });
  assert.deepEqual(mineFields({ squawkId: "s1", resolvedAt: "t", resolvedEntryId: "e" }), { resolved_at: "t" });
  assert.deepEqual(mineFields({ id: "r1", date: "d", tach: 1 }), { date: "d", tach: 1 });
});

test("changedFields: only columns the row has, and only where the values differ", () => {
  const row = { id: "e1", description: "x", hobbs: 2, updated_at: "t" };
  assert.deepEqual(changedFields({ entryId: "e1", fields: { description: "x", hobbs: 1, nonesuch: 5 } }, row), ["hobbs"]);
  assert.deepEqual(changedFields({ entryId: "e1", fields: { description: "x" } }, row), []);
});

test("alreadyApplied: a retry whose values are already on the row is not a conflict", () => {
  const row = { id: "e1", description: "x", hobbs: 1, updated_at: "t" };
  assert.equal(alreadyApplied({ entryId: "e1", fields: { description: "x", hobbs: 1 } }, row, "entry.update"), true);
  assert.equal(alreadyApplied({ entryId: "e1", fields: { description: "y" } }, row, "entry.update"), false);
  assert.equal(alreadyApplied({ entryId: "e1" }, row, "entry.update"), false);
});

// The bug this locks down: `reading.update` sends {date}, the column is
// `reading_date`. Unaliased the date is invisible, so a row someone else
// touched (dismissing the hours flag bumps updated_at without moving tach or
// hobbs) compared equal, the conflict was answered ok, and the owner's date
// correction was dropped while the phone said it had uploaded.
test("a payload's short key is compared against the column it actually writes", () => {
  const reading = { id: "r1", reading_date: "2026-01-01", tach: 10, hobbs: 12, updated_at: "t" };
  assert.deepEqual(mineFields({ readingId: "r1", date: "2026-02-02", tach: 10 }, "reading.update"),
    { reading_date: "2026-02-02", tach: 10 });
  assert.deepEqual(changedFields({ readingId: "r1", date: "2026-02-02", tach: 10 }, reading, "reading.update"),
    ["reading_date"]);
  assert.equal(alreadyApplied({ readingId: "r1", date: "2026-02-02", tach: 10 }, reading, "reading.update"), false);
  assert.equal(alreadyApplied({ readingId: "r1", date: "2026-01-01", tach: 10 }, reading, "reading.update"), true);
});

test("the other short-key types map too, so the yours/theirs table is never blank", () => {
  assert.deepEqual(mineFields({ entryId: "e1", confirmed: true }, "entry.confirm"), { owner_confirmed: true });
  assert.deepEqual(mineFields({ componentId: "c1", date: "2026-03-03" }, "component.remove"), { removal_date: "2026-03-03" });
  // mx.complete's description/tach/hobbs/signature land on the log entry it
  // writes, not on maintenance_item — not comparable against the item row.
  assert.deepEqual(
    mineFields({ itemId: "m1", date: "2026-03-03", hours: 100, description: "annual", tach: 1, hobbs: 2, signature: "A&P" }, "mx.complete"),
    { last_done_date: "2026-03-03", last_done_hours: 100 },
  );
});

test("a payload field the row cannot show is never read as 'already applied'", () => {
  const row = { id: "e1", description: "x", hobbs: 1, owner_confirmed: false, updated_at: "t" };
  // Unmapped `confirmed`: nothing lines up, so stay a conflict rather than
  // silently agreeing with the server.
  assert.equal(alreadyApplied({ entryId: "e1", confirmed: true }, row), false);
  assert.equal(alreadyApplied({ entryId: "e1", confirmed: false }, row, "entry.confirm"), true);
  assert.equal(alreadyApplied({ entryId: "e1", fields: { description: "x", nonesuch: 5 } }, row, "entry.update"), false);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { isRescannedEntry, signedEntriesOnScan, type ExistingEntry } from "../src/lib/extraction/rescan";

const signed: ExistingEntry = {
  id: "12345678-1234-4234-8234-123456789abc", page_id: null, logbook_id: "engine",
  entry_date: "2026-09-30", tach: 1234.5, hobbs: 1250,
  text: "Changed engine oil and filter, ground run and leak check satisfactory",
  owner_confirmed: true, created_at: "2026-09-30T00:00:00Z",
  authored_signed_at: "2026-09-30T00:00:00Z", authored_digest: "a".repeat(64),
};
const candidate = { ...signed, id: "new", page_id: "new-page", owner_confirmed: false, authored_digest: null, authored_signed_at: null };

test("new and legacy sticker markers link only with matching ID and digest", () => {
  assert.deepEqual(signedEntriesOnScan(`MTL ENTRY ID: ${signed.id}\nMTL DIGEST: ${signed.authored_digest}`, [signed]), [signed]);
  assert.deepEqual(signedEntriesOnScan(`Entry ${signed.id.slice(0, 8)} · Digest ${signed.authored_digest!.slice(0, 12)}`, [signed]), [signed]);
  assert.deepEqual(signedEntriesOnScan(`MTL ENTRY ID: ${signed.id}\nMTL DIGEST: ${"b".repeat(64)}`, [signed]), []);
  assert.deepEqual(signedEntriesOnScan(`MTL ENTRY ID: ${signed.id}`, [signed]), []);
});

test("rescan preserves original records and distinct work on the same day", () => {
  assert.equal(isRescannedEntry(candidate, [signed], [signed]), true);
  assert.equal(isRescannedEntry({ ...candidate, id: "new-tire", text: "Replaced left main tire and tube" }, [signed], [signed]), false);
  assert.equal(isRescannedEntry({ ...candidate, entry_date: "2026-10-30", tach: 1300 }, [signed], []), false);
  assert.equal(isRescannedEntry({ ...candidate, entry_date: null, tach: null, hobbs: null, text: `MTL ENTRY ID: ${signed.id}` }, [], [signed]), true);
});

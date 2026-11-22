import { test } from "node:test";
import assert from "node:assert/strict";
import { save } from "../src/lib/writes/documents";
import type { Db } from "../src/lib/writes";

const base = "2026-11-21T12:00:00.000001Z";
const ctx = { aircraftId: "aircraft", userId: "owner" };
const input = { documentId: "document", fields: { type: "other", title: "  Revised manual  " },
  expiry: { trackExpiry: true, expiresOn: "2027-11-21", remindLeadDays: 30 }, entryId: null };
function fixture(version = base) {
  const writes: Record<string, unknown>[] = [];
  const row = { id: "document", aircraft_id: "aircraft", type: "other", updated_at: version };
  const query = { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: row, error: null }; } };
  const db = { from() { return query; }, async rpc(name: string, args: Record<string, unknown>) {
    if (name === "can_edit_aircraft") return { data: true, error: null };
    assert.equal(name, "write_record"); writes.push(args);
    return { data: { status: "ok", row: { ...row, ...(args.p_patch as object) } }, error: null };
  } } as unknown as Db;
  return { db, writes, row };
}

test("saving document details, expiry and link uses one versioned write", async () => {
  const { db, writes } = fixture();
  assert.equal((await save(db, ctx, input, base)).status, "ok");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].p_base, base);
  assert.deepEqual(writes[0].p_patch, { type: "other", title: "Revised manual", track_expiry: true,
    expires_on: "2027-11-21", renews_every_months: null, remind_lead_days: 30, log_entry_id: null });
});

test("a stale rendered document cannot overwrite a newer upload or edit", async () => {
  const { db, writes, row } = fixture("2026-11-21T12:00:00.000002Z");
  assert.deepEqual(await save(db, ctx, input, base), { status: "conflict", row });
  assert.equal(writes.length, 0);
});

test("invalid expiry never partially saves the document title", async () => {
  const { db, writes } = fixture();
  const result = await save(db, ctx, { ...input, expiry: { trackExpiry: true, expiresOn: "next year" } }, base);
  assert.equal(result.status, "error");
  assert.equal(writes.length, 0);
});

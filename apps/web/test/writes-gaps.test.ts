import { test } from "node:test";
import assert from "node:assert/strict";
import * as gaps from "../src/lib/writes/gaps";
import { validateMutation } from "../src/lib/sync/mutations";
import type { Db } from "../src/lib/writes";

// A minimal Supabase stand-in: can_edit_aircraft answers `editor`; logbook_gap holds one row.
function fake(editor: boolean, row: Record<string, unknown> | null) {
  const writes: unknown[] = [];
  const chain = (table: string) => {
    let patch: unknown = null;
    const q = {
      select: () => q, eq: () => q, order: () => q, range: () => q,
      update: (p: unknown) => { patch = p; return q; },
      insert: (p: unknown) => { writes.push({ table, insert: p }); return q; },
      maybeSingle: async () => {
        if (patch) writes.push({ table, update: patch });
        return { data: table === "logbook_gap" && row ? { ...row, ...(patch as object) } : null, error: null };
      },
    };
    return q;
  };
  const db = { rpc: async () => ({ data: editor }), from: chain } as unknown as Db;
  return { db, writes };
}
const ctx = { aircraftId: "ac", userId: "u" };
const gap = { id: "g", aircraft_id: "ac", status: "open", note: null, updated_at: "2026-11-18T10:00:00.000Z" };

test("gap.setStatus: viewers are refused and nothing is written", async () => {
  const { db, writes } = fake(false, gap);
  const r = await gaps.setStatus(db, ctx, { gapId: "g", status: "no_pages_exist" }, gap.updated_at);
  assert.deepEqual(r, { status: "error", message: "You don't have edit access to this aircraft.", httpStatus: 403 });
  assert.equal(writes.length, 0);
});

test("gap.setStatus: owner statuses only, base checked, note kept unless sent", async () => {
  const bad = await gaps.setStatus(fake(true, gap).db, ctx, { gapId: "g", status: "filled" as "open" }, gap.updated_at);
  assert.equal(bad.status, "error");
  const stale = await gaps.setStatus(fake(true, gap).db, ctx, { gapId: "g", status: "dismissed" }, "2026-11-18T09:00:00.000Z");
  assert.equal(stale.status, "conflict");
  const { db, writes } = fake(true, gap);
  const ok = await gaps.setStatus(db, ctx, { gapId: "g", status: "asked_previous_owner" }, gap.updated_at);
  assert.equal(ok.status, "ok");
  const upd = (writes[0] as { update: Record<string, unknown> }).update;
  assert.equal(upd.status, "asked_previous_owner");
  assert.equal(upd.status_set_by, "u");
  assert.ok(!("note" in upd));
});

test("gap mutations are in the push catalogue with the base rule", () => {
  assert.ok("error" in validateMutation({ id: "m", type: "gap.setStatus", aircraftId: "ac", payload: { gapId: "g", status: "open" } }));
  assert.ok("ok" in validateMutation({ id: "m", type: "gap.setStatus", aircraftId: "ac", payload: { gapId: "g", status: "open" }, base: gap.updated_at }));
  assert.ok("ok" in validateMutation({ id: "m", type: "gap.create", aircraftId: "ac", payload: { id: "g2", logbookId: "lb", fromDate: "1983-01-01", toDate: "1991-01-01" } }));
});

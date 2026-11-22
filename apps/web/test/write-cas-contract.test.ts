import { test } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "../src/lib/writes";
import { updateReading, deleteReset } from "../src/lib/writes/meters";
import * as maintenance from "../src/lib/writes/maintenance";
import * as compliance from "../src/lib/writes/compliance";
import * as wb from "../src/lib/writes/weightBalance";
import { deleteTopOff } from "../src/lib/writes/oil";
const ctx = { aircraftId: "aircraft", userId: "owner" };
const loaded = { id: "row", aircraft_id: "aircraft", updated_at: "2026-11-22T10:00:00Z", source: "manual", reading_date: "2026-11-22", tach: 12, hobbs: null, airframe: null, kind: "annual", interval_months: 12 };
const changed = { ...loaded, updated_at: "2026-11-22T10:00:01Z" };

const cases: [string, (db: Db) => Promise<unknown>][] = [
  ["hours_reading", (db) => updateReading(db, ctx, { readingId: "row", tach: 13 })],
  ["meter_reset", (db) => deleteReset(db, ctx, { resetId: "row" })],
  ["maintenance_item", (db) => maintenance.upsert(db, ctx, { id: "row", item: { kind: "annual", label: "Annual" } })],
  ["maintenance_item", (db) => maintenance.remove(db, ctx, { itemId: "row" })],
  ["ad_compliance", (db) => compliance.upsert(db, ctx, { id: "row", record: { kind: "ad", reference: "2015-19-07", status: "open" } })],
  ["ad_compliance", (db) => compliance.remove(db, ctx, { recordId: "row" })],
  ["oil_addition", (db) => deleteTopOff(db, ctx, { additionId: "row" })],
  ["weight_balance", (db) => wb.upsert(db, ctx, { id: "row", fields: { revision_date: "2026-11-22", empty_weight: 1700 } })],
  ["weight_balance", (db) => wb.remove(db, ctx, { wbId: "row" })],
];
for (const [table, perform] of cases) test(`a concurrent ${table} edit is returned as a conflict, including callers without base`, async () => {
  let commits = 0;
  const db = {
    from: () => {
      const q = { select: () => q, eq: () => q, in: () => q, maybeSingle: async () => ({ data: loaded, error: null }), update: () => assert.fail("unguarded update"), delete: () => assert.fail("unguarded delete") };
      return q;
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "can_edit_aircraft") return { data: true, error: null };
      assert.equal(name, "write_record");
      assert.equal(args.p_table, table);
      assert.equal(args.p_base, loaded.updated_at);
      assert.equal(args.p_aircraft, ctx.aircraftId);
      assert.equal(args.p_id, loaded.id);
      assert.ok(!args.p_patch || !("aircraft_id" in (args.p_patch as object)));
      commits++;
      return { data: { status: "conflict", row: changed }, error: null };
    },
  } as unknown as Db;
  assert.deepEqual(await perform(db), { status: "conflict", row: changed });
  assert.equal(commits, 1);
});

test("maintenance completion sends the reading and VOR record with the same versioned transaction", async () => {
  const calls: Record<string, unknown>[] = [];
  const db = {
    from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: loaded, error: null }) }; return q; },
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "can_edit_aircraft") return { data: true, error: null };
      assert.equal(name, "mark_maintenance_done"); calls.push(args);
      return { data: { status: "ok", row: loaded }, error: null };
    },
  } as unknown as Db;
  const input = { itemId: "row", date: "2026-11-22", hours: 14.2, meter: "tach" as const, entryId: "mutation", logbookId: "avionics", description: "VOR check", tach: 14.2 };
  assert.equal((await maintenance.markDone(db, ctx, input)).status, "ok");
  assert.equal(calls[0].p_base, loaded.updated_at);
  assert.equal((calls[0].p_reading as Record<string, unknown>).tach, 14.2);
  assert.equal((calls[0].p_entry as Record<string, unknown>).id, "mutation");
  assert.equal((await maintenance.markDone(db, ctx, { ...input, tach: -1 })).status, "error");
  assert.equal(calls.length, 1, "invalid VOR details never touch the maintenance item");
});

test("maintenance Direction D fields are validated and omitted settings remain absent", () => {
  const legacy = maintenance.pickMaintenanceFields({ label: "Annual" });
  assert.ok("fields" in legacy && !("provider_id" in legacy.fields));
  const extra = maintenance.pickMaintenanceFields({ label: "Annual", line: "airframe", ifr_only: false, remind_lead_days: 30, shop_kind: "mechanic" });
  assert.ok("fields" in extra && extra.fields.remind_lead_days === 30);
  assert.ok("error" in maintenance.pickMaintenanceFields({ label: "Annual", line: "invalid" }));
  assert.ok("error" in maintenance.pickMaintenanceFields({ label: "Annual", remind_lead_hours: -1 }));
});

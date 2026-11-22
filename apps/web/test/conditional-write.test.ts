import { test } from "node:test";
import assert from "node:assert/strict";
import { writeRecord } from "../src/lib/writes/conditional";
import type { Db } from "../src/lib/writes";

test("conditional writes pass loaded version and preserve a competing row conflict", async () => {
  const current = { id: "row", description: "Other device", updated_at: "2026-11-21T12:00:01Z" };
  const db = { rpc: async (name: string, args: Record<string, unknown>) => {
    assert.equal(name, "write_record");
    assert.equal(args.p_base, "2026-11-21T12:00:00Z");
    assert.deepEqual(args.p_patch, { description: "My edit" });
    assert.equal(args.p_delete, false);
    return { data: { status: "conflict", row: current }, error: null };
  } } as unknown as Db;
  assert.deepEqual(await writeRecord(db, { aircraftId: "ac", userId: "u" }, "log_entry", "row", "2026-11-21T12:00:00Z", { description: "My edit" }), { status: "conflict", row: current });
});

test("failed transaction never masquerades as a successful write", async () => {
  const db = { rpc: async () => ({ data: null, error: { message: "transaction rolled back" } }) } as unknown as Db;
  assert.deepEqual(await writeRecord(db, { aircraftId: "ac", userId: "u" }, "log_entry", "row", "2026-11-21T12:00:00Z", null), { status: "error", message: "transaction rolled back" });
});

test("v2 conditional writes send the effect and replay identity through one transactional RPC", async () => {
  let requests = 0;
  const mutation = { id: "change", type: "entry.update", payload: { entryId: "row" }, base: "v1" };
  const db = { rpc: async (name: string, args: Record<string, unknown>) => {
    requests++;
    assert.equal(name, "apply_sync_write");
    assert.deepEqual(args.p_mutation, { ...mutation, aircraftId: "ac" });
    assert.equal(args.p_operation, "write_record");
    assert.equal((args.p_arguments as Record<string, unknown>).p_id, "row");
    return { data: { status: "ok", row: { id: "row", updated_at: "v2" } }, error: null };
  } } as unknown as Db;
  const result = await writeRecord(db, { aircraftId: "ac", userId: "u", mutation }, "log_entry", "row", "v1", { description: "My edit" });
  assert.equal(requests, 1);
  assert.equal(result.status, "ok");
});

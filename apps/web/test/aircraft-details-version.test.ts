import { test } from "node:test";
import assert from "node:assert/strict";
import { updateAircraftDetails } from "../src/lib/writes/aircraft";
import type { Db } from "../src/lib/writes";

const base = "2026-11-21T12:00:00.000001Z";
const fields = { make: "Mooney", model: "M20F", year: "1967", serial_number: "123",
  engine_serials: "engine", prop_serials: "prop", home_base: "KIAH" };
function fixture(version: string) {
  let writes = 0;
  const row = { id: "ac", owner_id: "owner", updated_at: version };
  const query = { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: row }; } };
  const db = { from() { return query; }, async rpc(name: string, args: Record<string, unknown>) {
    assert.equal(name, "write_record");
    assert.equal(args.p_base, base);
    writes++;
    return { data: { status: "ok", row: { ...row, updated_at: "2026-11-21T12:00:01Z" } }, error: null };
  } } as unknown as Db;
  return { db, row, writes: () => writes };
}

test("aircraft detail edits retain the rendered version through the final write", async () => {
  const f = fixture(base);
  const result = await updateAircraftDetails(f.db, { aircraftId: "ac", userId: "owner" }, fields, base);
  assert.equal(result.status, "ok");
  assert.equal(f.writes(), 1);
});

test("stale full detail or registry-copy forms cannot overwrite another device's change", async () => {
  const f = fixture("2026-11-21T12:00:00.000002Z");
  assert.deepEqual(await updateAircraftDetails(f.db, { aircraftId: "ac", userId: "owner" }, fields, base),
    { status: "conflict", row: f.row });
  assert.equal(f.writes(), 0);
});

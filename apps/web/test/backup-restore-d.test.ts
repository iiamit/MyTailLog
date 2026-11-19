import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { importBackup, restoreItemKey } from "../src/lib/backup/import";
import { BACKUP_FORMAT } from "../src/lib/backup/format";

// 09 §6: the backup carries the Direction D tables and a restore recreates them with every id remapped.

function fake() {
  const inserted: Record<string, Record<string, unknown>[]> = {};
  const db = {
    from(table: string) {
      return {
        insert: (rows: Record<string, unknown>[]) => ((inserted[table] ??= []).push(...rows), Promise.resolve({ error: null })),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }),
      };
    },
  } as unknown as SupabaseClient<Database>;
  return { db, inserted };
}

const archive = (data: Record<string, unknown>) =>
  new Blob([zipSync({
    "manifest.json": strToU8(JSON.stringify({ format: BACKUP_FORMAT, format_version: 1 })),
    "data.json": strToU8(JSON.stringify(data)),
  }) as BlobPart]);

const core = {
  aircraft: { id: "ac", tail_number: "N734QA", owner_id: "someone" },
  logbooks: [{ id: "lb", aircraft_id: "ac", type: "airframe" }],
  pages: [],
  log_entries: [{ id: "le", aircraft_id: "ac", logbook_id: "lb", page_id: null, description: "Annual" }],
  components: [],
  ad_compliance: [{ id: "ad", aircraft_id: "ac", reference: "2011-10-09", provider_id: "sp" }],
  maintenance_items: [{ id: "mx", aircraft_id: "ac", kind: "transponder", provider_id: "sp" }],
  documents: [],
};

test("item keys follow their rows to new ids; unknown ones are dropped", () => {
  const maps = { mx: new Map([["a", "A"]]), ad: new Map([["b", "B"]]), squawk: new Map([["c", "C"]]) };
  assert.equal(restoreItemKey("mx:a", maps), "mx:A");
  assert.equal(restoreItemKey("ad:b", maps), "ad:B");
  assert.equal(restoreItemKey("squawk:c", maps), "squawk:C");
  assert.equal(restoreItemKey("mx:zzz", maps), null);
  assert.equal(restoreItemKey("doc:a", maps), null);
});

test("restore recreates providers, visits, completions, gaps, readings and squawks with ids remapped", async () => {
  const { db, inserted } = fake();
  const { aircraftId } = await importBackup(db, "me", archive({
    ...core,
    service_providers: [{ id: "sp", aircraft_id: "ac", name: "AeroCheck", kind: "avionics_shop", created_by: "u-old" }],
    squawks: [{ id: "sq", aircraft_id: "ac", description: "Brake soft", reported_by: "u-old", resolved_log_entry_id: "le" }],
    planned_visits: [{ id: "v", aircraft_id: "ac", week_of: "2027-01-04", provider_id: "sp", created_by: "u-old" }],
    item_completions: [{ id: "c", aircraft_id: "ac", maintenance_item_id: "mx", ad_compliance_id: null, log_entry_id: "le", visit_id: "v", done_date: "2026-01-01", source: "extraction" }],
    planned_visit_items: [
      { id: "vi1", aircraft_id: "ac", visit_id: "v", item_key: "mx:mx", done_completion_id: "c" },
      { id: "vi2", aircraft_id: "ac", visit_id: "v", item_key: "squawk:sq", done_completion_id: null },
      { id: "vi3", aircraft_id: "ac", visit_id: "v", item_key: "mx:gone", done_completion_id: null },
    ],
    logbook_gaps: [{ id: "g", aircraft_id: "ac", logbook_id: "lb", from_date: "1983-01-01", to_date: "1991-01-01", status: "open", status_set_by: "u-old" }],
    hours_readings: [{ id: "hr", aircraft_id: "ac", reading_date: "2026-11-10", tach: 2165.3, photo_path: "ac/meters/hr.jpg", synced_by: "u-old" }],
  }));
  const one = (t: string) => inserted[t][0];
  const sp = one("service_provider"), mx = one("maintenance_item"), ad = one("ad_compliance"), le = one("log_entry");
  const v = one("planned_visit"), c = one("item_completion"), sq = one("squawk");
  assert.notEqual(sp.id, "sp");
  assert.equal(sp.aircraft_id, aircraftId);
  assert.equal(sp.created_by, null, "user ids from another account are not carried");
  assert.equal(mx.provider_id, sp.id);
  assert.equal(ad.provider_id, sp.id);
  assert.equal(v.provider_id, sp.id);
  assert.equal(c.maintenance_item_id, mx.id);
  assert.equal(c.log_entry_id, le.id);
  assert.equal(c.visit_id, v.id);
  assert.equal(sq.resolved_log_entry_id, le.id);
  assert.equal(sq.reported_by, null);
  const items = inserted.planned_visit_item;
  assert.deepEqual(items.map((i) => i.item_key), [`mx:${mx.id}`, `squawk:${sq.id}`]);
  assert.equal(items[0].done_completion_id, c.id);
  assert.equal(items[0].visit_id, v.id);
  assert.equal(one("logbook_gap").logbook_id, one("logbook").id);
  assert.equal(one("hours_reading").photo_path, null, "meter photos are not in the archive");
  assert.equal(one("hours_reading").tach, 2165.3);
});

test("an archive written before these tables still restores", async () => {
  const { db, inserted } = fake();
  await importBackup(db, "me", archive(core));
  assert.equal(inserted.maintenance_item[0].provider_id, null);
  assert.equal(inserted.service_provider, undefined);
  assert.equal(inserted.item_completion, undefined);
});

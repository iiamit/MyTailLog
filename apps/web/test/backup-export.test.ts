import { test } from "node:test";
import assert from "node:assert/strict";
import { unzip } from "fflate";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { exportBackup } from "../src/lib/backup/export";

// Each table returns rows tagged with `_t` so we can prove the export mapped the
// right query to the right backup key. Storage paths are null → no scan fetch.
const rowsByTable: Record<string, Record<string, unknown>[]> = {
  aircraft: [{ id: "ac", tail_number: "N123AB", _t: "aircraft" }],
  logbook: [{ id: "lb", _t: "logbook" }],
  log_entry: [{ id: "le", ad_refs: [], _t: "log_entry" }],
  page: [{ id: "pg", storage_path: null, _t: "page" }],
  component: [{ id: "co", _t: "component" }],
  ad_compliance: [{ id: "ad", _t: "ad_compliance" }],
  maintenance_item: [{ id: "mx", _t: "maintenance_item" }],
  document: [{ id: "doc", storage_path: null, _t: "document" }],
};

function fakeSupabase() {
  return {
    from(table: string) {
      const rows = rowsByTable[table] ?? [];
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        single: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
        then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
          Promise.resolve({ data: rows, error: null }).then(onF, onR),
      };
      return builder;
    },
  } as unknown as SupabaseClient<Database>;
}

async function readFiles(blob: Blob): Promise<Record<string, Uint8Array>> {
  const u8 = new Uint8Array(await blob.arrayBuffer());
  return new Promise<Record<string, Uint8Array>>((resolve, reject) =>
    unzip(u8, (err, out) => (err ? reject(err) : resolve(out))),
  );
}

async function readData(blob: Blob): Promise<Record<string, { _t: string }[]>> {
  const files = await readFiles(blob);
  return JSON.parse(new TextDecoder().decode(files["data.json"]));
}

test("exportBackup maps each table to the right backup key (pages ≠ log_entries)", async () => {
  const { blob, tail } = await exportBackup(fakeSupabase(), "ac");
  assert.equal(tail, "N123AB");
  const data = await readData(blob);

  // The regression: log entries were landing under `pages` and vice-versa, so a
  // restore inserted log-entry rows (with ad_refs) into the `page` table.
  assert.equal(data.pages[0]._t, "page");
  assert.equal(data.log_entries[0]._t, "log_entry");
  assert.equal(data.components[0]._t, "component");
  assert.equal(data.documents[0]._t, "document");
  assert.equal(data.maintenance_items[0]._t, "maintenance_item");
  assert.equal(data.ad_compliance[0]._t, "ad_compliance");
  assert.equal(data.logbooks[0]._t, "logbook");
});

test("the archive carries a README.txt documenting every file and column", async () => {
  const { blob } = await exportBackup(fakeSupabase(), "ac");
  const files = await readFiles(blob);
  const readme = new TextDecoder().decode(files["README.txt"]);

  // Every file the archive can contain is named in it.
  for (const f of ["README.txt", "manifest.json", "data.json", "scans/", "docs/"]) {
    assert.ok(readme.includes(f), `README.txt should document ${f}`);
  }

  // Every record set in data.json is documented...
  const data = await readData(blob);
  for (const key of Object.keys(data)) {
    assert.ok(readme.includes(key), `README.txt should document the ${key} record set`);
  }

  // ...with its columns read from the rows themselves, so a migration that adds
  // a column can't leave the manifest silently stale.
  assert.ok(readme.includes("tail_number"), "aircraft columns should be listed");
  assert.ok(readme.includes("ad_refs"), "log_entry columns should be listed");
  assert.ok(readme.includes("storage_path"), "page columns should be listed");

  // The portability claim, which is the point of shipping it at all.
  assert.ok(/MIT/.test(readme) && /self-host/i.test(readme));
  assert.ok(/Restore from backup/.test(readme));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { unzip } from "fflate";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { collectBackupData } from "../src/lib/backup/collect";
import {
  buildServerArchive,
  archiveFilename,
  type BlobReader,
} from "../src/lib/backup/serverArchive";
import { exportBackup } from "../src/lib/backup/export";

// Rows are tagged with `_t` so we can prove each query landed under the right
// backup key — the PR #98 regression where log entries were written into
// `pages` and a restore then inserted ad_refs rows into the `page` table.
const rowsByTable: Record<string, Record<string, unknown>[]> = {
  aircraft: [{ id: "ac", tail_number: "N734DM", _t: "aircraft" }],
  logbook: [{ id: "lb", _t: "logbook" }],
  log_entry: [{ id: "le", ad_refs: [], _t: "log_entry" }],
  page: [
    { id: "pg1", storage_path: "ac/one.jpg", _t: "page" },
    { id: "pg2", storage_path: "ac/two.png", _t: "page" },
    { id: "pg3", storage_path: null, _t: "page" },
  ],
  component: [{ id: "co", _t: "component" }],
  ad_compliance: [{ id: "ad", _t: "ad_compliance" }],
  maintenance_item: [{ id: "mx", _t: "maintenance_item" }],
  document: [{ id: "doc1", storage_path: "ac/manual.pdf", _t: "document" }],
  meter_reset: [{ id: "mr", _t: "meter_reset" }],
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

/** Every stored blob is present and 64 KB, unless `missing` names it. */
const reader =
  (missing: string[] = []): BlobReader =>
  async (path) =>
    missing.includes(path) ? null : { data: Buffer.alloc(64 * 1024, path.charCodeAt(3) & 0x7f) };

async function drain(a: ReturnType<typeof buildServerArchive>) {
  const chunks: Buffer[] = [];
  for await (const c of a.stream) chunks.push(c as Buffer);
  const stats = await a.result;
  const buf = Buffer.concat(chunks);
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
    unzip(new Uint8Array(buf), (err, out) => (err ? reject(err) : resolve(out))),
  );
  return { files, stats, buf };
}

test("streams a valid zip carrying the records and every readable blob", async () => {
  const collected = await collectBackupData(fakeSupabase(), "ac");
  const { files, stats, buf } = await drain(buildServerArchive(collected, reader()));

  // Entry names are derived from the storage path's extension, and a page with
  // no storage_path contributes no entry at all.
  assert.deepEqual(Object.keys(files).sort(), [
    "README.txt",
    "data.json",
    "docs/doc1.pdf",
    "manifest.json",
    "scans/pg1.jpg",
    "scans/pg2.png",
  ]);

  assert.equal(stats.scans, 3);
  assert.equal(stats.missing, 0);
  // `bytes` must be the real archive length — the scheduled job reports it and
  // the size guard will be set from it.
  assert.equal(stats.bytes, buf.length);

  const data = JSON.parse(new TextDecoder().decode(files["data.json"]));
  assert.equal(data.pages[0]._t, "page");
  assert.equal(data.log_entries[0]._t, "log_entry");
  assert.equal(data.meter_resets[0]._t, "meter_reset");

  // Stored, not deflated: an already-compressed blob must come back byte-exact.
  assert.equal(files["scans/pg1.jpg"].length, 64 * 1024);
});

test("an unreadable blob is skipped and counted, never fatal", async () => {
  const collected = await collectBackupData(fakeSupabase(), "ac");
  const { files, stats } = await drain(
    buildServerArchive(collected, reader(["ac/one.jpg"])),
  );

  // Losing one scan must not cost the user the other pages or any record.
  assert.equal(stats.missing, 1);
  assert.equal(stats.scans, 2);
  assert.ok(!("scans/pg1.jpg" in files));
  assert.ok("scans/pg2.png" in files);
  assert.ok("data.json" in files);
});

test("a failing blob reader rejects `result` rather than hanging the stream", async () => {
  const collected = await collectBackupData(fakeSupabase(), "ac");
  const boom: BlobReader = async () => {
    throw new Error("storage exploded");
  };
  const archive = buildServerArchive(collected, boom);
  archive.stream.on("error", () => {});
  archive.stream.resume();
  await assert.rejects(archive.result, /storage exploded/);
});

test("the manifest counts every record set, and scans counts only stored blobs", async () => {
  const collected = await collectBackupData(fakeSupabase(), "ac");
  const { files } = await drain(buildServerArchive(collected, reader()));
  const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));

  assert.equal(manifest.format, "mytaillog-backup");
  assert.equal(manifest.format_version, 1);
  assert.equal(manifest.tail_number, "N734DM");
  assert.equal(manifest.counts.pages, 3);
  assert.equal(manifest.counts.meter_resets, 1);
  // pg3 has no storage_path, so it is a page but not a scan.
  assert.equal(manifest.counts.scans, 3);
});

test("the server archive and the browser export produce the same format", async () => {
  // The whole reason collect.ts exists. If these drift, the .zip in someone's
  // Dropbox stops being restorable by the importer that handles the one they
  // downloaded — and nothing else would catch it.
  const collected = await collectBackupData(fakeSupabase(), "ac");
  const { files: server } = await drain(buildServerArchive(collected, reader()));

  // The browser path fetches blobs over HTTP; stub it so only the format differs.
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: true,
    arrayBuffer: async () => Buffer.alloc(64 * 1024).buffer,
  })) as unknown as typeof fetch;
  let browserFiles: Record<string, Uint8Array>;
  try {
    const { blob } = await exportBackup(fakeSupabase(), "ac");
    const u8 = new Uint8Array(await blob.arrayBuffer());
    browserFiles = await new Promise((resolve, reject) =>
      unzip(u8, (err, out) => (err ? reject(err) : resolve(out))),
    );
  } finally {
    globalThis.fetch = realFetch;
  }

  assert.deepEqual(Object.keys(server).sort(), Object.keys(browserFiles).sort());

  // data.json must be identical, not merely similar.
  assert.equal(
    new TextDecoder().decode(server["data.json"]),
    new TextDecoder().decode(browserFiles["data.json"]),
  );

  // Manifests differ only by their timestamp.
  const strip = (u: Uint8Array) => {
    const m = JSON.parse(new TextDecoder().decode(u));
    delete m.exported_at;
    return m;
  };
  assert.deepEqual(strip(server["manifest.json"]), strip(browserFiles["manifest.json"]));
});

test("archiveFilename sorts by date and strips anything unsafe for a path", () => {
  assert.equal(archiveFilename("N734DM", new Date("2026-08-02T13:00:00Z")), "2026-08-02-N734DM.zip");
  assert.equal(archiveFilename("N/73 4DM", new Date("2026-01-05T00:00:00Z")), "2026-01-05-N734DM.zip");
  assert.equal(archiveFilename("", new Date("2026-01-05T00:00:00Z")), "2026-01-05-aircraft.zip");
});

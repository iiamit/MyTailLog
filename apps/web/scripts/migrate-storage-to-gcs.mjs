// ===========================================================================
// One-off: copy every blob referenced by the DB from Supabase Storage → GCS.
//
// We walk the DATABASE (page.storage_path, page.thumbnail_path,
// document.storage_path), not the storage tree — the DB is the authoritative
// list of blobs the app actually serves, and orphans don't matter. Same key on
// both sides, so no DB change is needed; the cutover is just STORAGE_BACKEND=gcs.
//
// Idempotent: skips a key already present in GCS unless --force. Safe to re-run.
//
//   Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, GCS_BUCKET
//   Auth to GCS via Application Default Credentials:
//     gcloud auth application-default login   (or run where ADC is present)
//
//   node scripts/migrate-storage-to-gcs.mjs           # copy missing
//   node scripts/migrate-storage-to-gcs.mjs --force   # re-copy everything
//   node scripts/migrate-storage-to-gcs.mjs --dry-run # list, copy nothing
// ===========================================================================

import { createClient } from "@supabase/supabase-js";
import { Storage } from "@google-cloud/storage";

const BUCKET = process.env.LOGBOOK_STORAGE_BUCKET || "logbook-pages";
const GCS_BUCKET = process.env.GCS_BUCKET;
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SECRET_KEY;

const FORCE = process.argv.includes("--force");
const DRY = process.argv.includes("--dry-run");

if (!URL || !KEY || !GCS_BUCKET) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, and GCS_BUCKET.");
  process.exit(1);
}

const supabase = createClient(URL, KEY, { auth: { persistSession: false } });
const gcs = new Storage().bucket(GCS_BUCKET);

// Page through a table pulling one column, collecting non-null values.
async function collectPaths(table, columns) {
  const paths = new Set();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns.join(", "))
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    for (const row of data) for (const c of columns) if (row[c]) paths.add(row[c]);
    if (data.length < PAGE) break;
  }
  return paths;
}

async function main() {
  console.log(`Source bucket: supabase://${BUCKET}  →  gs://${GCS_BUCKET}`);
  console.log(FORCE ? "Mode: FORCE (re-copy all)" : DRY ? "Mode: DRY-RUN" : "Mode: copy missing");

  const paths = new Set([
    ...(await collectPaths("page", ["storage_path", "thumbnail_path"])),
    ...(await collectPaths("document", ["storage_path"])),
  ]);
  const all = [...paths];
  console.log(`Referenced blobs: ${all.length}`);

  let copied = 0, skipped = 0, missing = 0, failed = 0;
  for (let i = 0; i < all.length; i++) {
    const key = all[i];
    const tag = `[${i + 1}/${all.length}] ${key}`;
    try {
      const file = gcs.file(key);
      if (!FORCE) {
        const [exists] = await file.exists();
        if (exists) { skipped++; continue; }
      }
      const { data: blob, error } = await supabase.storage.from(BUCKET).download(key);
      if (error || !blob) { console.warn(`MISSING in source: ${tag}`); missing++; continue; }
      if (DRY) { console.log(`would copy: ${tag}`); copied++; continue; }
      const buf = Buffer.from(await blob.arrayBuffer());
      await file.save(buf, { contentType: blob.type || "application/octet-stream", resumable: false });
      copied++;
      if (copied % 25 === 0) console.log(`…${copied} copied (${tag})`);
    } catch (e) {
      console.error(`FAILED ${tag}: ${e.message}`);
      failed++;
    }
  }

  console.log("\n──────── done ────────");
  console.log(`copied:  ${copied}${DRY ? " (dry-run)" : ""}`);
  console.log(`skipped: ${skipped} (already in GCS)`);
  console.log(`missing: ${missing} (referenced but absent in source)`);
  console.log(`failed:  ${failed}`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

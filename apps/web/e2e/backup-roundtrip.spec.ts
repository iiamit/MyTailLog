import { test, expect } from "./fixtures";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { unzipSync, strFromU8 } from "fflate";
import { randomUUID } from "node:crypto";
import fs from "node:fs";

// Backup export → re-import round trip. This is the executable guard for the
// bug that shipped in #98: `exportBackup` destructured its parallel queries in
// the wrong order, so log entries were written into the archive's `pages` and
// vice-versa. That swap TYPECHECKS CLEANLY (both are row arrays), so only a
// value-level assertion catches a re-swap — hence the column-shape checks below
// and the actual import, which is what really broke for users (a restore died
// with "Could not find the 'ad_refs' column of 'page'").
//
// Both halves run entirely in the browser (the .zip is built client-side and
// downloaded via an object URL; import inserts through the browser Supabase
// client), so this drives the real code paths users hit.
const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`missing ${k}`);
  return v;
};

// Deliberately ASYMMETRIC counts: with 1 page and 3 entries a swap can't hide
// behind matching array lengths.
const PAGE_COUNT = 1;
const ENTRY_COUNT = 3;

test("backup: export archive keeps pages and entries distinct, and re-imports cleanly", async ({
  page,
  scratch,
}) => {
  const admin: SupabaseClient = createClient(env("TEST_SUPABASE_URL"), env("TEST_SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false },
  });

  // --- Seed: one page + three entries on the scratch aircraft ---------------
  const { data: logbooks } = await admin
    .from("logbook")
    .select("id, type")
    .eq("aircraft_id", scratch.id);
  const airframe = logbooks!.find((l) => l.type === "airframe")!.id;

  const pageId = randomUUID();
  const { error: pErr } = await admin.from("page").insert({
    id: pageId,
    aircraft_id: scratch.id,
    logbook_id: airframe,
    // No real blob: export fetches scans best-effort and skips failures, so the
    // archive simply carries no scans/ entry. The records are what we assert.
    storage_path: `${scratch.id}/e2e-missing.jpg`,
    page_sequence: 1,
    review_status: "unreviewed",
    extraction_status: "pending",
  });
  expect(pErr, `seed page: ${pErr?.message}`).toBeFalsy();

  const { error: eErr } = await admin.from("log_entry").insert(
    Array.from({ length: ENTRY_COUNT }, (_, i) => ({
      aircraft_id: scratch.id,
      logbook_id: airframe,
      page_id: pageId,
      entry_date: `2026-0${i + 1}-15`,
      description: `E2E entry ${i + 1}`,
      ad_refs: [`AD-E2E-${i + 1}`],
    })),
  );
  expect(eErr, `seed entries: ${eErr?.message}`).toBeFalsy();

  // --- Export: click the real button, capture the real download -------------
  await page.goto(`${scratch.path}/export`);
  const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByRole("button", { name: "Download backup (.zip)" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toContain(scratch.tail);
  expect(download.suggestedFilename()).toMatch(/\.zip$/);

  const zipPath = await download.path();
  const entries = unzipSync(new Uint8Array(fs.readFileSync(zipPath!)));

  // --- Assert the archive's records didn't get crossed ----------------------
  const manifest = JSON.parse(strFromU8(entries["manifest.json"]));
  expect(manifest.format).toBe("mytaillog-backup");
  expect(manifest.tail_number).toBe(scratch.tail);
  expect(manifest.counts.pages, "manifest page count").toBe(PAGE_COUNT);
  expect(manifest.counts.log_entries, "manifest entry count").toBe(ENTRY_COUNT);

  const data = JSON.parse(strFromU8(entries["data.json"]));
  expect(data.pages).toHaveLength(PAGE_COUNT);
  expect(data.log_entries).toHaveLength(ENTRY_COUNT);

  // The actual swap guard: each array must carry ITS OWN table's columns.
  // `storage_path` exists only on page; `ad_refs`/`entry_date` only on log_entry.
  expect(data.pages[0], "pages[] must hold page rows, not entries").toHaveProperty("storage_path");
  expect(data.pages[0]).not.toHaveProperty("ad_refs");
  expect(data.log_entries[0], "log_entries[] must hold entry rows, not pages").toHaveProperty("ad_refs");
  expect(data.log_entries[0]).toHaveProperty("entry_date");
  expect(data.log_entries[0]).not.toHaveProperty("storage_path");

  // --- Re-import: the archive must actually restore -------------------------
  let importedId: string | null = null;
  try {
    await page.goto("/dashboard");
    await page.locator('input[type="file"][accept*="zip"]').setInputFiles(zipPath!);

    // Success = redirected to the NEW aircraft. A swapped export dies here with
    // a PostgREST column error surfaced in the import card.
    await page.waitForURL(/\/aircraft\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    importedId = page.url().split("/aircraft/")[1];

    expect(importedId, "import should land on a new aircraft").not.toBe(scratch.id);
    await expect(page.getByText(/ad_refs|Import failed|isn't a MyTailLog backup/i)).toHaveCount(0);

    // The restored copy carries the same record counts, still un-crossed.
    const [restoredPages, restoredEntries] = await Promise.all([
      admin.from("page").select("id").eq("aircraft_id", importedId),
      admin.from("log_entry").select("id, ad_refs").eq("aircraft_id", importedId),
    ]);
    expect(restoredPages.data).toHaveLength(PAGE_COUNT);
    expect(restoredEntries.data).toHaveLength(ENTRY_COUNT);
    expect(restoredEntries.data![0].ad_refs, "entry payload survived the round trip").toBeTruthy();
  } finally {
    // The imported aircraft gets a fresh id, so the scratch fixture's teardown
    // doesn't cover it.
    if (importedId) await admin.from("aircraft").delete().eq("id", importedId);
  }
});

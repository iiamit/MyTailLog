import { test, expect } from "./fixtures";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

// The flat review queue ("Add records" → review everything at once).
//
// Reported from the field: verifying a transcription meant clicking the 48px
// group thumbnail, reading the full-screen lightbox, closing it, and repeating
// for the next entry. The scan now sits beside its entries, the way the
// single-page reviewer has always shown it.
//
// What's asserted is the property that made the loop necessary — the scan is
// rendered inline at a size you can actually read — rather than the class names
// that happen to achieve it.

const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`missing ${k}`);
  return v;
};

test("review all: a page's scan is readable beside its entries, not a thumbnail", async ({
  page,
  scratch,
}) => {
  const admin = createClient(env("TEST_SUPABASE_URL"), env("TEST_SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false },
  });

  const { data: logbooks } = await admin
    .from("logbook")
    .select("id, type")
    .eq("aircraft_id", scratch.id);
  const airframe = logbooks!.find((l) => l.type === "airframe")!.id;

  const pageId = randomUUID();
  // No real blob — the layout is what's under test, and a broken <img> still
  // lays out at its CSS size.
  const { error: pErr } = await admin.from("page").insert({
    id: pageId,
    aircraft_id: scratch.id,
    logbook_id: airframe,
    storage_path: `${scratch.id}/e2e-review-all.jpg`,
    page_sequence: 1,
    review_status: "unreviewed",
    extraction_status: "extracted",
  });
  expect(pErr, `seed page: ${pErr?.message}`).toBeFalsy();

  const description = `Engine entry ${randomUUID().slice(0, 8)}`;
  const { error: eErr } = await admin.from("log_entry").insert({
    aircraft_id: scratch.id,
    logbook_id: airframe,
    page_id: pageId,
    entry_date: "2026-03-14",
    description,
  });
  expect(eErr, `seed entry: ${eErr?.message}`).toBeFalsy();

  await page.goto(`${scratch.path}/review`);
  // Textarea values, the way csv-import.spec reads them — getByDisplayValue
  // isn't in this Playwright version.
  const values = async () =>
    page.locator("textarea").evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value));
  await expect(async () => expect(await values()).toContain(description)).toPass({ timeout: 15_000 });

  // The scan for this page, wherever it sits in the layout.
  const scan = page.locator(`img[src*="/api/page/${pageId}/image"]`).first();
  await expect(scan).toBeVisible();

  // The regression this guards: a 48px avatar-sized thumbnail. Anything you can
  // read a logbook against is far wider than that.
  const box = await scan.boundingBox();
  expect(box, "the scan must be laid out").toBeTruthy();
  expect(box!.width, "the scan must be readable inline, not a thumbnail").toBeGreaterThan(240);

  // And it must be reachable WITHOUT opening the lightbox — that round trip is
  // the whole complaint. The entry's own field is on screen at the same time.
  expect(await values()).toContain(description);
});

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { test, expect } from "./fixtures";

test("new design: a completed item opens its linked logbook scan", async ({ page, scratch }) => {
  test.setTimeout(60_000);
  const admin = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SECRET_KEY!);
  const { data: book, error: bookError } = await admin.from("logbook").select("id").eq("aircraft_id", scratch.id).eq("type", "airframe").single();
  expect(bookError).toBeNull();
  const pageId = randomUUID();
  const storagePath = `${scratch.id}/source-check.png`;
  // A real stored image catches a broken image route as well as a missing pane.
  const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==", "base64");
  const { error: uploadError } = await admin.storage.from("logbook-pages").upload(storagePath, pixel, { contentType: "image/png" });
  expect(uploadError).toBeNull();
  try {
    const { error: pageError } = await admin.from("page").insert({
      id: pageId, aircraft_id: scratch.id, logbook_id: book!.id,
      storage_path: storagePath, page_sequence: 1,
      review_status: "confirmed", extraction_status: "extracted",
    });
    expect(pageError).toBeNull();
    const { data: entry, error: entryError } = await admin.from("log_entry").insert({
      aircraft_id: scratch.id, logbook_id: book!.id, page_id: pageId,
      entry_date: "2026-09-29", description: "Oil and filter changed", owner_confirmed: true,
    }).select("id").single();
    expect(entryError).toBeNull();
    const { data: item, error: itemError } = await admin.from("maintenance_item").insert({
      aircraft_id: scratch.id, kind: "oil_change", label: "Oil change", regulatory: false,
      interval_hours: 50, last_done_date: "2026-09-29", last_done_hours: 984.9, meter: "hobbs",
    }).select("id").single();
    expect(itemError).toBeNull();
    const { error: completionError } = await admin.from("item_completion").insert({
      aircraft_id: scratch.id, maintenance_item_id: item!.id, log_entry_id: entry!.id,
      done_date: "2026-09-29", done_hours: 984.9, meter: "hobbs", source: "owner_link",
    });
    expect(completionError).toBeNull();

    await page.goto(`/api/ui?design=v2&next=${encodeURIComponent(`${scratch.path}/status`)}`);
    const oil = page.getByRole("link", { name: "Oil change", exact: true }).first();
    if (!(await oil.isVisible())) await page.getByRole("button", { name: /Later ·/ }).click();
    await oil.click();
    await expect(page).toHaveURL(new RegExp(`/status/item/mx:${item!.id}`));
    const source = page.getByRole("region", { name: "Source page" });
    const scan = source.locator(`img[src="/api/page/${pageId}/image"]`);
    await expect(scan).toBeVisible();
    await expect.poll(() => scan.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(source.getByText("No page behind this yet.")).toHaveCount(0);
  } finally {
    await admin.storage.from("logbook-pages").remove([storagePath]);
  }
});

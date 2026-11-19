import { test, expect } from "./fixtures";
import { request as playwrightRequest } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

test("record room: owner creates a link, a visitor opens it, revocation closes it", async ({ page, scratch, baseURL }) => {
  const admin = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SECRET_KEY!);
  const { data: book, error: bookError } = await admin.from("logbook").select("id").eq("aircraft_id", scratch.id).eq("type", "airframe").single();
  expect(bookError).toBeNull();
  const pageId = randomUUID();
  const { error: pageError } = await admin.from("page").insert({ id: pageId, aircraft_id: scratch.id, logbook_id: book!.id, storage_path: `${scratch.id}/record-room-test.jpg` });
  expect(pageError).toBeNull();
  const { error: entryError } = await admin.from("log_entry").insert([
    { aircraft_id: scratch.id, logbook_id: book!.id, page_id: pageId, description: "Confirmed inspection", owner_confirmed: true },
    { aircraft_id: scratch.id, logbook_id: book!.id, page_id: pageId, description: "Unconfirmed note", owner_confirmed: false },
  ]);
  expect(entryError).toBeNull();

  await page.goto(`${scratch.path}/share`);
  await expect(page.getByRole("checkbox", { name: /Page scans from selected logbooks/ })).not.toBeChecked();
  await page.getByPlaceholder("Buyer · J. Smith").fill("Test buyer");
  await page.getByRole("button", { name: "Create link" }).click();

  const preview = page.getByRole("link", { name: "Preview" });
  await expect(preview).toBeVisible();
  const url = await preview.getAttribute("href");
  expect(url).toMatch(/\/r\/[A-Za-z0-9_-]{43}$/);

  const visitor = await playwrightRequest.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    const opened = await visitor.get(url!);
    expect(opened.status()).toBe(200);
    expect(await opened.text()).toContain(scratch.tail);
    const entries = await visitor.get(`${url}?tab=logbooks&book=${book!.id}`);
    const html = await entries.text();
    expect(html).toContain("Confirmed inspection");
    expect(html).not.toContain("Unconfirmed note");
    expect((await visitor.get(`${url}/page/${pageId}`)).status()).toBe(404);

    await page.getByRole("button", { name: "Revoke" }).click();
    await expect(page.getByText(/^revoked ·/)).toBeVisible();

    const closed = await visitor.get(url!);
    expect(closed.status()).toBe(200);
    expect(await closed.text()).toContain("This link is no longer active");
  } finally {
    await visitor.dispose();
  }
});

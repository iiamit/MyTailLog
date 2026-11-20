import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { test, expect } from "./fixtures";

test("new design: a viewer can report a squawk but cannot open owner write panes", async ({ browser, scratch }) => {
  test.setTimeout(90_000);
  const admin = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SECRET_KEY!);
  const email = `viewer-${randomUUID().slice(0, 8)}@e2e.invalid`;
  const password = randomUUID() + "A1!";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(error).toBeNull();
  const viewerId = data.user!.id;
  const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", storageState: { cookies: [], origins: [] } });
  try {
    const { error: shareError } = await admin.from("aircraft_share").insert({ aircraft_id: scratch.id, invited_email: email, role: "viewer", invited_by: (await admin.from("aircraft").select("owner_id").eq("id", scratch.id).single()).data!.owner_id });
    expect(shareError).toBeNull();
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByRole("button", { name: "Password" }).click();
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/dashboard");
    await page.goto(`/api/ui?design=v2&next=${encodeURIComponent(`${scratch.path}/maintenance/squawks?panel=new`)}`);
    await expect(page.getByRole("heading", { name: "Report a squawk" })).toBeVisible();
    await expect(page.locator("aside.rail").getByRole("button", { name: /Add/ })).toHaveCount(0);
    const description = `Viewer report ${viewerId}`;
    await page.getByLabel("What's wrong?").fill(description);
    await page.getByRole("radiogroup", { name: "Severity" }).getByRole("radio", { name: "Low" }).check();
    await page.getByRole("button", { name: "Report squawk" }).click();
    await expect.poll(async () => (await admin.from("squawk").select("id").eq("aircraft_id", scratch.id).eq("description", description).maybeSingle()).data).not.toBeNull();
    await page.goto(`${scratch.path}/hours?panel=reading`);
    await expect(page.getByRole("heading", { name: "Add a reading" })).toHaveCount(0);
    await page.goto(`${scratch.path}/documents?panel=new`);
    await expect(page.getByRole("heading", { name: "Add a document" })).toHaveCount(0);
  } finally {
    await context.close();
    await admin.from("aircraft_share").delete().eq("aircraft_id", scratch.id).eq("invited_email", email);
    await admin.auth.admin.deleteUser(viewerId);
  }
});

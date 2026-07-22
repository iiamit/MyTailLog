import { test, expect } from "./fixtures";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

// Sharing write journey: the owner invites an email (addShare) and removes it
// (removeShare), verified at the DB level.
const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`missing ${k}`);
  return v;
};

test("sharing: invite by email creates a share, then remove deletes it", async ({ page, scratch }) => {
  const admin = createClient(env("TEST_SUPABASE_URL"), env("TEST_SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false },
  });
  const invite = `share-${randomUUID().slice(0, 8)}@e2e.invalid`;

  await page.goto(`${scratch.path}/share`);
  await page.getByPlaceholder("person@example.com").fill(invite);
  await page.getByRole("button", { name: /Invite/ }).click();

  await expect
    .poll(async () => {
      const { data } = await admin
        .from("aircraft_share")
        .select("role")
        .eq("aircraft_id", scratch.id)
        .eq("invited_email", invite);
      return data?.[0]?.role ?? null;
    }, { timeout: 15000 })
    .toBe("viewer");

  // The invited row now shows a Remove button (the owner row has none).
  await page.getByRole("button", { name: "Remove" }).first().click();

  await expect
    .poll(async () => {
      const { data } = await admin
        .from("aircraft_share")
        .select("id")
        .eq("aircraft_id", scratch.id)
        .eq("invited_email", invite);
      return data?.length ?? 0;
    }, { timeout: 15000 })
    .toBe(0);
});

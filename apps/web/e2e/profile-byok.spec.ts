import { test, expect } from "./fixtures";
import { createClient } from "@supabase/supabase-js";

// BYOK write journey — also the end-to-end proof of the 0039 fix: saving a key
// through the UI stores the ciphertext in the private schema (reachable only via
// the service-role RPC), never as plaintext, and the UI shows only the last 4.
const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`missing ${k}`);
  return v;
};

test("BYOK: saving an Anthropic key stores it encrypted (0039) and shows only the last4", async ({ page }) => {
  const admin = createClient(env("TEST_SUPABASE_URL"), env("TEST_SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false },
  });
  const { data: prof } = await admin
    .from("profile")
    .select("id")
    .eq("email", env("TEST_USER_EMAIL"))
    .single();
  const userId = prof!.id;

  try {
    await page.goto("/profile");
    await page.getByLabel("Anthropic API key").fill("sk-ant-e2e-test-key-000000001234");
    await page.getByRole("button", { name: "Save key" }).click();

    // UI reflects the stored key by its last 4 only.
    await expect(page.getByText(/Using your key.*1234/)).toBeVisible();

    // The ciphertext is reachable only via the service-role accessor, and it's
    // encrypted (not the plaintext key).
    const { data: cipher } = await admin.rpc("ai_key_cipher", { p_user_id: userId });
    expect(cipher, "ciphertext should be stored").toBeTruthy();
    expect(String(cipher)).not.toContain("sk-ant");
    expect(String(cipher).startsWith("v1:"), "stored value should be AES-GCM ciphertext").toBeTruthy();
  } finally {
    await admin.rpc("delete_ai_key", { p_user_id: userId });
  }
});

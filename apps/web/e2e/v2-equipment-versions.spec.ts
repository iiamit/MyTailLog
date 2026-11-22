import { createClient } from "@supabase/supabase-js";
import { test, expect } from "./fixtures";

for (const mode of ["edit", "remove"] as const) {
  test(`equipment ${mode} refuses a component changed after the form rendered`, async ({ page, scratch }) => {
    test.setTimeout(60_000);
    const admin = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SECRET_KEY!);
    const { data: component, error } = await admin.from("component").insert({
      aircraft_id: scratch.id, name: "E2E vacuum pump", is_installed: true,
    }).select("id").single();
    expect(error).toBeNull();
    const path = `${scratch.path}/equipment?part=${component!.id}&panel=${mode}`;
    await page.goto(`/api/ui?design=v2&next=${encodeURIComponent(path)}`);
    const submit = page.getByRole("button", { name: mode === "edit" ? "Save" : "Mark removed", exact: true });
    await expect(submit).toBeVisible();
    if (mode === "edit") await page.getByLabel("Name", { exact: true }).fill("My stale edit");
    const { error: updateError } = await admin.from("component").update({ name: "Changed on another device" }).eq("id", component!.id);
    expect(updateError).toBeNull();
    await submit.click();
    await expect(page.getByRole("alert").filter({ hasText: /Someone else changed/ })).toContainText(/changed|reload|refresh/i);
    const { data: saved } = await admin.from("component").select("name, is_installed").eq("id", component!.id).single();
    expect(saved).toMatchObject({ name: "Changed on another device", is_installed: true });
  });
}

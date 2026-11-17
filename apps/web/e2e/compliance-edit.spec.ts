import { test, expect } from "./fixtures";
import { createClient } from "@supabase/supabase-js";

for (const width of [390, 1440]) {
  test(`AD Edit brings the populated editor into view and saves the selected record at ${width}px`, async ({ page, scratch }) => {
    const admin = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SECRET_KEY!, {
      auth: { persistSession: false },
    });
    const { data: records, error } = await admin.from("ad_compliance").insert(
      Array.from({ length: 18 }, (_, i) => ({
        aircraft_id: scratch.id, kind: "ad", reference: `2020-${String(i + 1).padStart(2, "0")}-01`,
        title: `Inspection ${i + 1}`, status: "open", recurring: false,
      })),
    ).select("id,reference,title").order("reference");
    expect(error).toBeNull();
    const record = records!.at(-1)!;
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`${scratch.path}/compliance`);
    const card = page.locator(`[id="item-${record.id}"]`);
    const editor = page.getByRole("region", { name: `Edit AD ${record.reference}`, exact: true });

    // Include re-opening the same record while its existing editor is offscreen.
    for (let attempt = 0; attempt < 2; attempt++) {
      await card.getByRole("button", { name: "Edit", exact: true }).click();
      await expect(editor).toBeFocused();
      await expect(editor).toBeInViewport();
      await expect.poll(async () => {
        const heading = await editor.getByRole("heading").boundingBox();
        const navigation = await page.getByRole("navigation", { name: "Section navigation" }).boundingBox();
        return heading!.y - (navigation!.y + navigation!.height);
      }).toBeGreaterThanOrEqual(0);
      await expect(editor.getByRole("textbox", { name: "Number", exact: true })).toHaveValue(record.reference);
      await expect(editor.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(record.title!);
    }
    await editor.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(editor).toHaveCount(0);
    await card.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(editor).toBeFocused();
    await editor.getByRole("textbox", { name: "Title", exact: true }).fill("Updated inspection");
    await editor.getByRole("button", { name: "Save", exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect.poll(async () => {
      const { data } = await admin.from("ad_compliance").select("title").eq("id", record.id).single();
      return data?.title;
    }).toBe("Updated inspection");
  });
}

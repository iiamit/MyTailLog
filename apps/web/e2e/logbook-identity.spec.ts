import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { test, expect } from "./fixtures";

const suggestion = (subject = "aircraft") => ({ id: "a".repeat(24), subject, name: subject === "aircraft" ? "Aircraft identification" : "Original engine", fields: { serial_number: "000123" }, quote: "Serial number: 000123", confidence: 0.9, status: "pending" });
async function seed(id: string, subject = "aircraft") {
  const admin = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SECRET_KEY!);
  const { data: book } = await admin.from("logbook").select("id").eq("aircraft_id", id).eq("type", "airframe").single();
  const pageId = randomUUID();
  const { error } = await admin.from("page").insert({ id: pageId, aircraft_id: id, logbook_id: book!.id, storage_path: `${id}/identity-fixture.jpg`, page_sequence: 1, extraction_status: "extracted", content_kinds: ["identity"], identity_suggestions: [suggestion(subject)] });
  expect(error).toBeNull();
  return { admin, pageId, book: book!.id };
}

test("reference-page identity review fills setup without creating maintenance", async ({ page, scratch }, testInfo) => {
  const { admin, pageId } = await seed(scratch.id);
  await page.goto(`/api/ui?design=v2&next=${encodeURIComponent(`${scratch.path}/setup`)}`);
  await expect(page.getByText("Start with your logbooks", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: /Review extracted information.*1 details/ })).toBeVisible();
  await page.route(`**/api/page/${pageId}/image`, (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1100"><rect width="800" height="1100" fill="white"/><text x="65" y="130" font-size="32">AIRCRAFT LOGBOOK</text><text x="65" y="230" font-size="26">Aircraft identification</text><text x="65" y="340" font-size="26">Serial number: 000123</text><text x="65" y="440" font-size="22">Synthetic test page</text></svg>' }));
  await page.goto(`${scratch.path}/logbooks/review`);
  await page.getByRole("link", { name: "Open in the desk" }).first().click();
  await expect(page.getByText("No maintenance entries on this page.", { exact: false })).toBeVisible();
  for (const [name, width, height] of [["desktop", 1440, 1000], ["phone", 390, 844], ["phone-landscape", 844, 390]] as const) {
    await page.setViewportSize({ width, height });
    const accept = page.getByRole("button", { name: "Accept details", exact: true });
    await accept.scrollIntoViewIfNeeded();
    await expect(accept).toBeVisible();
    const bounds = await accept.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
    await testInfo.attach(`identity-review-${name}`, { body: await page.screenshot(), contentType: "image/png" });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Accept details", exact: true }).click();
  await expect.poll(async () => (await admin.from("aircraft").select("serial_number").eq("id", scratch.id).single()).data?.serial_number).toBe("000123");
  await expect(page.getByText("Aircraft identification · Details accepted")).toBeVisible();
  await page.getByRole("button", { name: /Mark page reviewed and next/ }).click();
  await expect.poll(async () => (await admin.from("page").select("review_status").eq("id", pageId).single()).data?.review_status).toBe("confirmed");
  expect((await admin.from("log_entry").select("id").eq("page_id", pageId)).data).toHaveLength(0);
});

test("original equipment remains historical until current installation is explicitly checked", async ({ page, scratch }) => {
  const { admin, pageId } = await seed(scratch.id, "engine");
  await page.goto(`/api/ui?design=v2&next=${encodeURIComponent(`${scratch.path}/logbooks/review/${pageId}`)}`);
  await expect(page.getByRole("checkbox", { name: /I have checked that this equipment is installed today/ })).not.toBeChecked();
  await page.getByRole("button", { name: "Accept details", exact: true }).click();
  await expect.poll(async () => (await admin.from("component").select("serial_number").eq("aircraft_id", scratch.id)).data?.length).toBe(1);
  const { data } = await admin.from("component").select("serial_number,is_installed,identity_historical,install_date,component_kind").eq("aircraft_id", scratch.id).single();
  expect(data).toMatchObject({ serial_number: "000123", is_installed: false, identity_historical: true, install_date: null, component_kind: "engine" });
});

test("identity review never overwrites a destination changed after rendering", async ({ page, scratch }) => {
  const { admin, pageId } = await seed(scratch.id);
  await page.goto(`/api/ui?design=v2&next=${encodeURIComponent(`${scratch.path}/logbooks/review/${pageId}`)}`);
  await expect(page.getByRole("button", { name: "Accept details", exact: true })).toBeVisible();
  await admin.from("aircraft").update({ serial_number: "CHANGED-ELSEWHERE" }).eq("id", scratch.id);
  await page.getByRole("button", { name: "Accept details", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /changed|reload/i })).toBeVisible();
  expect((await admin.from("aircraft").select("serial_number").eq("id", scratch.id).single()).data?.serial_number).toBe("CHANGED-ELSEWHERE");
  expect((await admin.from("page").select("identity_suggestions").eq("id", pageId).single()).data?.identity_suggestions[0].status).toBe("pending");
});

test("engine history excludes accessories and exposes historical compression without an assigned engine", async ({ page, scratch }) => {
  const { admin, pageId, book } = await seed(scratch.id);
  expect((await admin.from("component").insert({ aircraft_id: scratch.id, name: "Vacuum pump", category: "engine", install_date: "2000-01-01" })).error).toBeNull();
  expect((await admin.from("log_entry").insert({ aircraft_id: scratch.id, logbook_id: book, page_id: pageId, entry_date: "2026-03-01", owner_confirmed: true, description: "Compressions: #1:79/80 #2:75/80 #3:79/80 #4:76/80" })).error).toBeNull();
  const response = await page.request.get(`/api/aircraft/${scratch.id}/engine-history`);
  expect(response.ok()).toBeTruthy();
  const history = await response.json();
  expect(history.components).toHaveLength(0);
  expect(history.groups).toHaveLength(0);
  expect(history.unassigned.compression[0].readings).toHaveLength(4);
});

import { test, expect } from "./fixtures";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

// CSV import end-to-end with the column mapping stubbed (E2E_STUB_AI). The
// fixture exercises the parser through a real upload: a quoted field containing
// commas, a quoted field containing a newline, an unambiguous date column
// (03/14 settles it as month/day, so nothing is asked), and one row with an
// absurd tach that must be SKIPPED rather than imported as zero.
const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`missing ${k}`);
  return v;
};

const CSV = "e2e/fixtures/maintenance.csv";

test("csv import: map → preview → import → the entries appear for review", async ({ page, scratch }) => {
  await page.goto(`${scratch.path}/import`);

  await page.locator('input[type="file"]').setInputFiles(CSV);
  await page.getByRole("button", { name: "Read the columns" }).click();

  // The proposed mapping is shown for confirmation — including the column it
  // decided NOT to import.
  await expect(page.getByRole("combobox", { name: 'Import "Date" as' })).toHaveValue("entry_date", {
    timeout: 20_000,
  });
  await expect(page.getByRole("combobox", { name: 'Import "Squawk" as' })).toHaveValue("description");
  await expect(page.getByRole("combobox", { name: 'Import "Tach" as' })).toHaveValue("tach");
  await expect(page.getByRole("combobox", { name: 'Import "Invoice #" as' })).toHaveValue("ignore");
  // A day past the 12th somewhere in the column settles the reading, so the
  // user is never asked.
  await expect(page.getByText("Which way round are these dates?")).toHaveCount(0);

  // A count of what will be created, before anything is written.
  await page.getByRole("button", { name: "Check what will be created" }).click();
  await expect(page.getByText("2 entries will be created")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("1 row can't be read and will be skipped")).toBeVisible();

  await page.getByRole("button", { name: /^Import 2 entries$/ }).click();
  await expect(page.getByText("Imported 2 entries")).toBeVisible({ timeout: 20_000 });

  // …and they're in the one review queue, grouped as scan-less, unconfirmed.
  await page.goto(`${scratch.path}/review`);
  await expect(page.getByText(/imported \(no scan\)/)).toBeVisible();
  const values = await page
    .locator("textarea")
    .evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value));
  // The quoted field's commas survived, and so did the embedded newline.
  expect(values).toContain("Annual inspection: compression, plugs, filter");
  expect(values).toContain("Oil change\nand filter replacement");
  // The row with the absurd tach was skipped, not imported as zero.
  expect(values.some((v) => v.includes("Mis-keyed tach reading"))).toBe(false);
});

// The ADS-B lesson: a stub that accepts what production refuses ships a
// permanently-broken request. Every gate here lives in the ROUTE, outside the
// stub, so the stub cannot widen any of them — these assert that.
test("csv import: the route refuses what the stub could never rescue", async ({ page, scratch }) => {
  const url = `/api/aircraft/${scratch.id}/import/csv`;

  // A PDF is not a CSV, however well the mapping call would have gone.
  const pdf = { name: "blank.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n") };
  const wrongType = await page.request.post(url, { multipart: { file: pdf, step: "analyze" } });
  expect(wrongType.status()).toBe(415);

  // A file with no data rows under the header.
  const headerOnly = { name: "empty.csv", mimeType: "text/csv", buffer: Buffer.from("Date,Squawk\n") };
  const noRows = await page.request.post(url, { multipart: { file: headerOnly, step: "analyze" } });
  expect(noRows.status()).toBe(422);

  // Over the row cap, reported as a message rather than a timeout.
  const big = ["Date,Squawk", ...Array(5001).fill("2026-01-02,Annual")].join("\n");
  const tooManyRows = await page.request.post(url, {
    multipart: { file: { name: "big.csv", mimeType: "text/csv", buffer: Buffer.from(big) }, step: "analyze" },
  });
  expect(tooManyRows.status()).toBe(413);
  expect(await tooManyRows.text()).toContain("the limit is 5000");

  // And a mapping with no date column is refused no matter who proposed it —
  // which is exactly what happens when the stub can't name a file's columns.
  const file = { name: "x.csv", mimeType: "text/csv", buffer: Buffer.from("Foo,Bar\n1,2\n") };
  const noDate = await page.request.post(url, {
    multipart: { file, step: "preview", mapping: JSON.stringify(["ignore", "ignore"]) },
  });
  expect(noDate.status()).toBe(422);
  expect(await noDate.text()).toContain("Map one column to Date");
});

// Import is a WRITE. RLS scopes rows, not columns — a viewer can read the
// aircraft, so can_edit_aircraft on the route is the only thing stopping them
// adding history to someone else's records.
test("csv import: a read-only viewer cannot import", async ({ page }) => {
  const admin = createClient(env("TEST_SUPABASE_URL"), env("TEST_SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false },
  });
  const email = env("TEST_USER_EMAIL");

  const victim = await admin.auth.admin.createUser({
    email: `csv-victim-${randomUUID().slice(0, 8)}@e2e.invalid`,
    password: randomUUID(),
    email_confirm: true,
  });
  const victimId = victim.data.user!.id;
  const victimAc = randomUUID();

  try {
    await admin.from("aircraft").insert({
      id: victimAc,
      owner_id: victimId,
      tail_number: "NC" + victimAc.slice(0, 4).toUpperCase(),
      engine_serials: [],
      prop_serials: [],
    });
    await admin.from("logbook").insert({ aircraft_id: victimAc, type: "airframe" });
    await admin.from("aircraft_share").insert({
      aircraft_id: victimAc,
      invited_email: email,
      role: "viewer",
      invited_by: victimId,
    });

    const res = await page.request.post(`/api/aircraft/${victimAc}/import/csv`, {
      multipart: { file: { name: "m.csv", mimeType: "text/csv", buffer: Buffer.from("Date,Squawk\n2026-01-02,Annual\n") }, step: "analyze" },
    });
    expect(res.status(), "a viewer must not be able to import").toBe(403);

    // Nothing was written, and no AI call was spent getting there.
    const { count } = await admin
      .from("log_entry")
      .select("id", { count: "exact", head: true })
      .eq("aircraft_id", victimAc);
    expect(count ?? 0).toBe(0);
  } finally {
    await admin.from("aircraft").delete().eq("id", victimAc);
    await admin.auth.admin.deleteUser(victimId);
  }
});

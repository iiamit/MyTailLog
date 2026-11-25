import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test, expect } from "./fixtures";

test("owner inbox preserves originals and atomically approves one private invoice on retries", async ({
  page,
  scratch,
}) => {
  const endpoint = `/api/aircraft/${scratch.id}`,
    itemId = randomUUID();
  const bytes = await readFile("e2e/fixtures/blank.pdf");
  const upload = () =>
    page.request.post(`${endpoint}/inbox`, {
      headers: { "idempotency-key": itemId },
      multipart: {
        file: {
          name: "annual-invoice.pdf",
          mimeType: "application/pdf",
          buffer: bytes,
        },
      },
    });
  const first = await upload();
  expect(
    first.ok(),
    `Upload failed HTTP ${first.status()}: ${await first.text()}`,
  ).toBeTruthy();
  const initial = (await first.json()).item;
  expect(initial.state).toBe("uploaded");
  const retry = await upload();
  expect(retry.ok()).toBeTruthy();
  expect((await retry.json()).item.id).toBe(initial.id);
  const original = await page.request.get(
    `${endpoint}/inbox/${initial.id}/file`,
  );
  expect(original.headers()["cache-control"]).toContain("no-store");
  expect(await original.body()).toEqual(bytes);
  const proposal = {
    date: "2026-03-01",
    currency: "USD",
    amount_minor: 12345,
    category: "maintenance",
    cost_type: "variable",
    notes: "Synthetic test invoice",
  };
  const approve = () =>
    page.request.post(`${endpoint}/inbox/${initial.id}/approve`, {
      data: { base: initial.updated_at, kind: "invoice", proposal },
    });
  const accepted = await approve();
  expect(accepted.ok()).toBeTruthy();
  const saved = (await accepted.json()).item;
  expect(saved.document_id).toBeNull();
  expect(saved.state).toBe("approved");
  expect((await approve()).ok()).toBeTruthy();
  const expenses = await page.request.get(`${endpoint}/expenses`);
  expect(expenses.ok()).toBeTruthy();
  const rows = (await expenses.json()).expenses;
  expect(
    rows.filter((e: { inbox_id: string }) => e.inbox_id === initial.id),
  ).toHaveLength(1);
  await page.goto(
    `/api/ui?design=v2&next=${encodeURIComponent(`${scratch.path}/inbox`)}`,
  );
  await expect(
    page.getByRole("heading", { name: "Document inbox", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /annual-invoice.pdf/ }),
  ).toBeVisible({ timeout: 15_000 });
});

test("ownership ledger validates money, keeps draft on errors and detects concurrent edits", async ({
  page,
  scratch,
}) => {
  const endpoint = `/api/aircraft/${scratch.id}/expenses`,
    id = randomUUID();
  const body = {
    id,
    date: "2026-01-01",
    currency: "USD",
    amount_minor: 12550,
    category: "fuel",
    cost_type: "variable",
    basis: "actual",
    vendor: "Synthetic fuel",
  };
  expect(
    (
      await page.request.post(endpoint, {
        data: { ...body, amount_minor: 1.5 },
      })
    ).status(),
  ).toBe(400);
  const created = await page.request.post(endpoint, { data: body });
  expect(created.ok()).toBeTruthy();
  const row = (await created.json()).expense;
  const concurrent = await Promise.all([
    page.request.post(endpoint, { data: body }),
    page.request.post(endpoint, { data: body }),
  ]);
  expect(concurrent.every((r) => r.ok())).toBeTruthy();
  const change = await page.request.patch(`${endpoint}/${id}`, {
    data: { ...body, base: row.updated_at, amount_minor: 13550 },
  });
  expect(change.ok()).toBeTruthy();
  const stale = await page.request.patch(`${endpoint}/${id}`, {
    data: { ...body, base: row.updated_at, amount_minor: 14550 },
  });
  expect(stale.status()).toBe(409);
  const invalid = await page.request.post(`${endpoint}/import`, {
    data: {
      csv: "date,currency,amount_minor,category,cost_type,basis\n2026-01-02,USD,500,fuel,variable,actual\n2026-01-03,USD,0,fuel,variable,actual",
    },
  });
  expect(invalid.status()).toBe(400);
  const listed = await page.request.get(endpoint);
  expect((await listed.json()).expenses).toHaveLength(1);
  await page.goto(
    `/api/ui?design=v2&next=${encodeURIComponent(`${scratch.path}/costs`)}`,
  );
  await expect(
    page.getByRole("heading", { name: "Ownership costs", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Amount (negative for a refund)").fill("12.345");
  await page.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("valid amount");
  await expect(page.getByLabel("Amount (negative for a refund)")).toHaveValue(
    "12.345",
  );
  await page.setViewportSize({ width: 844, height: 390 });
  const sections = page.getByRole("navigation", {
    name: "Aircraft sections",
    exact: true,
  });
  const tools = page.getByRole("navigation", { name: "Tools", exact: true });
  const sectionBounds = await sections.boundingBox();
  const toolBounds = await tools.boundingBox();
  expect(sectionBounds!.y + sectionBounds!.height).toBeLessThanOrEqual(
    toolBounds!.y + 1,
  );
  const lastSection = sections.getByRole("link").last();
  await lastSection.scrollIntoViewIfNeeded();
  const lastBounds = await lastSection.boundingBox();
  expect(lastBounds!.y).toBeGreaterThanOrEqual(sectionBounds!.y - 1);
  expect(lastBounds!.y + lastBounds!.height).toBeLessThanOrEqual(
    sectionBounds!.y + sectionBounds!.height + 1,
  );

  await expect(
    page.getByText("Synthetic fuel", { exact: false }),
  ).toBeVisible();
  await page.route("**/expenses?*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Synthetic reporting period unavailable" }),
    }),
  );
  await page.getByLabel("From", { exact: true }).fill("2026-01-01");
  await page.getByLabel("Through", { exact: true }).fill("2026-02-01");
  await page.getByRole("button", { name: "Apply period", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Synthetic reporting period unavailable",
  );
  await expect(page.getByText("Synthetic fuel", { exact: false })).toHaveCount(
    0,
  );
  await expect(page.getByLabel("Amount (negative for a refund)")).toHaveValue(
    "12.345",
  );
});

test("engine lifecycle sources and annual packet exports use scoped evidence", async ({
  page,
  scratch,
}) => {
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(
    process.env.TEST_SUPABASE_URL!,
    process.env.TEST_SUPABASE_SECRET_KEY!,
  );
  const component = randomUUID(),
    observation = randomUUID(),
    foreign = randomUUID();
  const { error } = await admin.from("component").insert({
    id: component,
    aircraft_id: scratch.id,
    name: "Synthetic engine",
    category: "engine",
    serial_number: "TEST-ENGINE",
    position: "Left",
    install_date: "2025-01-01",
  });
  if (error) throw error;
  const endpoint = `/api/aircraft/${scratch.id}`;
  const history = await page.request.get(`${endpoint}/engine-history`);
  expect(history.ok()).toBeTruthy();
  const payload = await history.json();
  expect(payload.sources).toHaveProperty("entries");
  expect(
    payload.components.some((c: { id: string }) => c.id === component),
  ).toBeTruthy();
  const body = {
    id: observation,
    component_id: component,
    event_date: "2026-02-01",
    kind: "compression",
    readings: [
      { cylinder: 1, psi: 75, reference: 80 },
      { cylinder: 2, psi: 68, reference: 70 },
    ],
    meter_basis: "tach",
    meter_reading: 1234.5,
  };
  const creates = await Promise.all([
    page.request.post(`${endpoint}/engine-history`, { data: body }),
    page.request.post(`${endpoint}/engine-history`, { data: body }),
  ]);
  expect(creates.every((r) => r.ok())).toBeTruthy();
  const invalid = await page.request.post(`${endpoint}/engine-history`, {
    data: { ...body, id: randomUUID(), source_entry_id: foreign },
  });
  expect(invalid.status()).toBe(400);
  const updated = await page.request.get(`${endpoint}/engine-history`);
  const h = await updated.json();
  const readings = h.groups.flatMap(
    (g: { compression: unknown[] }) => g.compression,
  );
  expect(readings).toHaveLength(1);
  expect(readings[0].readings[1].reference).toBe(70);
  expect(readings[0].observationId).toBe(observation);
  expect(readings[0].sourceEntryId).toBeNull();
  const packet = await page.request.get(
    `${endpoint}/annual-packet?format=json`,
  );
  expect(packet.ok()).toBeTruthy();
  expect((await packet.json()).tail).toBe(scratch.tail);
  const pdf = await page.request.get(`${endpoint}/annual-packet?format=pdf`);
  expect(pdf.ok()).toBeTruthy();
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  const zip = await page.request.post(`${endpoint}/annual-packet`, {
    data: { format: "zip", pageIds: [], documentIds: [] },
  });
  expect(zip.ok()).toBeTruthy();
  expect(zip.headers()["content-type"]).toContain("application/zip");
  const foreignEvidence = await page.request.post(`${endpoint}/annual-packet`, {
    data: { format: "zip", pageIds: [foreign], documentIds: [] },
  });
  expect(foreignEvidence.status()).toBe(400);
});

test("cost estimate matches expenses to actual confirmed reading dates inside the requested year", async ({ page, scratch }) => {
  test.setTimeout(60_000);
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(process.env.TEST_SUPABASE_URL!, process.env.TEST_SUPABASE_SECRET_KEY!);
  const { data: book, error: bookError } = await admin.from("logbook").select("id").eq("aircraft_id", scratch.id).eq("type", "airframe").single();
  expect(bookError).toBeNull();
  expect((await admin.from("log_entry").insert([
    { aircraft_id: scratch.id, logbook_id: book!.id, entry_date: "2026-01-13", tach: 4100, owner_confirmed: true, description: "Synthetic opening reading" },
    { aircraft_id: scratch.id, logbook_id: book!.id, entry_date: "2026-12-08", tach: 4200, owner_confirmed: true, description: "Synthetic closing reading" },
  ])).error).toBeNull();
  const endpoint = `/api/aircraft/${scratch.id}/expenses`;
  for (const [date, amount, basis] of [["2026-01-05",10000,"actual"],["2026-01-20",20000,"actual"],["2026-12-12",30000,"actual"],["2026-06-01",7500,"reserve"]] as const) {
    expect((await page.request.post(endpoint, { data: { id: randomUUID(), date, currency: "USD", amount_minor: amount, category: "maintenance", cost_type: "variable", basis } })).ok()).toBeTruthy();
  }
  const response = await page.request.get(`${endpoint}?from=2026-01-01&to=2026-12-31`);
  expect(response.ok()).toBeTruthy();
  const result = await response.json();
  expect(result.denominator).toMatchObject({ from: "2026-01-13", to: "2026-12-08", meter: "tach", hours: 100 });
  expect(result.totals[0]).toMatchObject({ actual_minor: 60000, reserve_minor: 7500, rate_actual_minor: 20000, actual_per_hour_minor: 200 });
  const csv = await page.request.get(`${endpoint}?from=2026-01-01&to=2026-12-31&format=csv`);
  expect(await csv.text()).toContain("2026-01-05");
  await page.goto(`/api/ui?design=v2&next=${encodeURIComponent(scratch.path + "/costs")}`);
  await page.getByLabel("From", { exact: true }).fill("2026-01-01");
  await page.getByLabel("Through", { exact: true }).fill("2026-12-31");
  await page.getByRole("button", { name: "Apply period", exact: true }).click();
  await expect(page.getByText("Estimated cost per measured hour:", { exact: false })).toContainText("$2.00");
  await expect(page.getByText("Cost per hour uses recorded spending", { exact: false })).toContainText("2026-01-13 through 2026-12-08");
});

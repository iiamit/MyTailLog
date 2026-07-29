import { test, expect } from "./fixtures";
import { request as playwrightRequest } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Records Vault (0041) upload → list → serve. Beyond the feature itself, the
// serving half is the real prize: /api/document/[id] reads through the storage
// abstraction, so this is the end-to-end proof that blobs written by the app
// come back out of whichever backend STORAGE_BACKEND points at (the Supabase →
// GCS migration silently changes this path). It also pins the access rules,
// which are app-level here — the route 404s rather than 401/403s.
const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`missing ${k}`);
  return v;
};

test("documents: upload a PDF to the vault, then serve it back through the blob route", async ({
  page,
  scratch,
  baseURL,
}) => {
  const admin = createClient(env("TEST_SUPABASE_URL"), env("TEST_SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false },
  });
  const title = `E2E airworthiness ${scratch.tail}`;

  await page.goto(`${scratch.path}/documents`);
  await expect(page.getByRole("heading", { level: 1, name: "Records Vault" })).toBeVisible();
  await expect(page.getByText("No documents yet.")).toBeVisible();

  // The upload form is collapsed until "+ Upload" is clicked.
  await page.getByRole("button", { name: "+ Upload" }).click();
  await page.getByLabel("Category").selectOption("airworthiness_cert");
  await page.getByLabel("File").setInputFiles("e2e/fixtures/blank.pdf");
  await page.getByLabel("Title").fill(title);
  await page.getByRole("button", { name: "Upload", exact: true }).click();

  // --- The row landed with its metadata ------------------------------------
  const fetchRow = async () => {
    const { data } = await admin
      .from("document")
      .select("id, type, title, mime_type, size_bytes, storage_path")
      .eq("aircraft_id", scratch.id)
      .eq("title", title)
      .maybeSingle();
    return data;
  };
  await expect.poll(fetchRow, { timeout: 20_000 }).not.toBeNull();
  const row = (await fetchRow())!;

  expect(row.type).toBe("airworthiness_cert");
  expect(row.mime_type).toBe("application/pdf");
  expect(row.size_bytes, "the stored size should be the real file size").toBeGreaterThan(0);

  // …and it renders in the list, under its category.
  await expect(page.getByRole("link", { name: title })).toBeVisible();

  // --- Serving: the blob comes back out of the storage backend -------------
  const served = await page.request.get(`/api/document/${row.id}`);
  expect(served.status(), "an owner can fetch their document").toBe(200);
  expect(served.headers()["content-type"]).toContain("application/pdf");
  expect(served.headers()["cache-control"], "blobs are privately cacheable").toContain("private");
  // A real PDF, not an error page: every PDF starts with %PDF.
  expect((await served.body()).subarray(0, 4).toString()).toBe("%PDF");

  // ?download forces an attachment disposition.
  const dl = await page.request.get(`/api/document/${row.id}?download`);
  expect(dl.headers()["content-disposition"]).toContain("attachment");

  // --- Access control: a stranger gets nothing (404, not a leak) -----------
  // The empty jar is explicit: an API context otherwise inherits the project's
  // signed-in storageState and this would assert nothing.
  const anon = await playwrightRequest.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const denied = await anon.get(`/api/document/${row.id}`);
  expect(denied.status(), "an unauthenticated fetch must not serve the blob").toBe(404);
  await anon.dispose();
});

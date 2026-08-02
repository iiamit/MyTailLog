import { test, expect } from "./fixtures";
import { request as playwrightRequest } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

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

// WP3 — entry ↔ document attachment editor. 0041 links the two with a single FK
// (`document.log_entry_id`), so this drives the whole loop through the real UI:
// attach an existing Vault document to a log entry from the entry's review card,
// assert the link shows up on BOTH sides (entry card + Vault "linked record")
// and on the timeline, then detach and assert it's gone from both. The detach
// half is the one that matters most: before WP3 the entry card's only "remove"
// deleted the document outright, so proving the file survives an unlink is the
// regression guard against re-introducing that data-loss footgun.
test("documents: attach a Vault document to a log entry, see it on both sides, then detach", async ({
  page,
  scratch,
}) => {
  const admin = createClient(env("TEST_SUPABASE_URL"), env("TEST_SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false },
  });
  const docTitle = `E2E 8130-3 ${scratch.tail}`;
  const entryText = `E2E attach target ${scratch.tail}`;

  // --- Seed: a page, an entry on it, and an unattached Vault document --------
  const { data: logbooks } = await admin
    .from("logbook")
    .select("id, type")
    .eq("aircraft_id", scratch.id);
  const airframe = logbooks!.find((l) => l.type === "airframe")!.id;

  const pageId = randomUUID();
  const { error: pErr } = await admin.from("page").insert({
    id: pageId,
    aircraft_id: scratch.id,
    logbook_id: airframe,
    // No real blob — the review page renders fine without the scan loading.
    storage_path: `${scratch.id}/e2e-missing.jpg`,
    page_sequence: 1,
    review_status: "unreviewed",
    extraction_status: "extracted",
  });
  expect(pErr, `seed page: ${pErr?.message}`).toBeFalsy();

  const { data: entry, error: eErr } = await admin
    .from("log_entry")
    .insert({
      aircraft_id: scratch.id,
      logbook_id: airframe,
      page_id: pageId,
      entry_date: "2026-03-14",
      description: entryText,
    })
    .select("id")
    .single();
  expect(eErr, `seed entry: ${eErr?.message}`).toBeFalsy();
  const entryId = entry!.id;

  // A Vault document sitting unattached (log_entry_id null) — exactly what the
  // picker is supposed to offer.
  const { data: doc, error: dErr } = await admin
    .from("document")
    .insert({
      aircraft_id: scratch.id,
      type: "form_8130_3",
      title: docTitle,
      file_name: "tag.pdf",
    })
    .select("id")
    .single();
  expect(dErr, `seed document: ${dErr?.message}`).toBeFalsy();
  const docId = doc!.id;

  const linkedEntryId = async () => {
    const { data } = await admin.from("document").select("log_entry_id").eq("id", docId).single();
    return data?.log_entry_id ?? null;
  };

  // --- Attach, from the entry's review card ---------------------------------
  await page.goto(`${scratch.path}/pages/${pageId}/review`);
  // The entry card is rendered (its description lives in a controlled textarea,
  // so assert on the attachments panel that WP3 owns rather than the text).
  await expect(page.getByText("Attachments", { exact: true })).toBeVisible();
  // The attachments panel starts empty for this entry.
  await expect(page.getByText("None.").first()).toBeVisible();
  await expect(page.getByRole("link", { name: docTitle })).toHaveCount(0);

  await page.getByRole("button", { name: "+ Link from Vault" }).click();
  const picker = page.getByLabel("Link a Vault document");
  await expect(picker).toBeVisible();
  // The picker offers the unattached document…
  await expect(picker.locator("option", { hasText: docTitle })).toHaveCount(1);
  await picker.selectOption({ label: docTitle });

  // …and the FK actually moved.
  await expect.poll(linkedEntryId, { timeout: 20_000 }).toBe(entryId);

  // Side 1 — the entry card now lists the attachment.
  await expect(page.getByRole("link", { name: docTitle })).toBeVisible();

  // Side 2 — the Vault shows the reverse link back to the entry.
  await page.goto(`${scratch.path}/documents`);
  const vaultRow = page.locator("li", { hasText: docTitle }).first();
  await expect(vaultRow.getByText("Linked record:")).toBeVisible();
  await expect(vaultRow.getByRole("link", { name: /2026-03-14/ })).toBeVisible();
  // …and that link actually goes to the entry's page.
  await expect(vaultRow.getByRole("link", { name: /2026-03-14/ })).toHaveAttribute(
    "href",
    `${scratch.path}/pages/${pageId}/review`,
  );

  // Side 3 — the timeline surfaces it on the entry.
  await page.goto(`${scratch.path}/timeline`);
  const timelineRow = page.locator("li", { hasText: entryText });
  await expect(timelineRow.getByText("Attached:")).toBeVisible();
  await expect(timelineRow.getByRole("link", { name: docTitle })).toHaveAttribute(
    "href",
    `/api/document/${docId}`,
  );

  // --- Detach: unlink must NOT delete the document --------------------------
  await page.goto(`${scratch.path}/pages/${pageId}/review`);
  await expect(page.getByRole("link", { name: docTitle })).toBeVisible();
  await page.getByRole("button", { name: "unlink" }).click();

  await expect.poll(linkedEntryId, { timeout: 20_000 }).toBeNull();

  // The row survives the unlink — it's detached, not deleted.
  const { data: after } = await admin
    .from("document")
    .select("id, title")
    .eq("id", docId)
    .maybeSingle();
  expect(after, "unlink must detach the document, never delete it").not.toBeNull();
  expect(after!.title).toBe(docTitle);

  // Gone from the entry card…
  await expect(page.getByRole("link", { name: docTitle })).toHaveCount(0);
  // …and from the Vault's reverse view, while the document itself still lists.
  await page.goto(`${scratch.path}/documents`);
  await expect(page.getByRole("link", { name: docTitle })).toBeVisible();
  await expect(page.getByText("Linked record:")).toHaveCount(0);
  // …and from the timeline.
  await page.goto(`${scratch.path}/timeline`);
  await expect(page.locator("li", { hasText: entryText }).getByText("Attached:")).toHaveCount(0);
});

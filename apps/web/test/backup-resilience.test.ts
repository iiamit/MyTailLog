import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { collectBackupData, blobRefsFor } from "../src/lib/backup/collect";
import { importBackup } from "../src/lib/backup/import";
import { BACKUP_FORMAT, type BackupData } from "../src/lib/backup/format";
const core: BackupData = {
  aircraft: { id: "old", tail_number: "N734DM" },
  logbooks: [{ id: "lb" }],
  pages: [],
  log_entries: [],
  components: [],
  ad_compliance: [],
  maintenance_items: [],
  documents: [],
};
function destination() {
  const inserted: Record<string, Record<string, unknown>[]> = {};
  const client = {
    from: (table: string) => ({
      insert: async (rows: Record<string, unknown>[]) => {
        (inserted[table] ??= []).push(...rows);
        return { error: null };
      },
    }),
  } as unknown as SupabaseClient<Database>;
  return { inserted, client };
}
function archive(data: BackupData, missing?: string) {
  const files: Record<string, Uint8Array> = {
    "manifest.json": strToU8(
      JSON.stringify({ format: BACKUP_FORMAT, format_version: 2 }),
    ),
    "data.json": strToU8(JSON.stringify(data)),
  };
  for (const ref of blobRefsFor(data))
    if (ref.entry !== missing) files[ref.entry] = new Uint8Array([1, 2, 3]);
  return new Blob([zipSync(files) as BlobPart]);
}
test("backup includes records past the PostgREST cap and later-page errors abort", async () => {
  const rows = Array.from({ length: 1501 }, (_, id) => ({
    id: `${id}`.padStart(5, "0"),
  }));
  let fail = false;
  const db = {
    from(table: string) {
      let start = 0,
        end = 499;
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        range: (a: number, b: number) => ((start = a), (end = b), q),
        single: async () => ({ data: core.aircraft, error: null }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({
            data: table === "log_entry" ? rows.slice(start, end + 1) : [],
            error:
              fail && table === "log_entry" && start === 1000
                ? { message: "page denied" }
                : null,
          }).then(resolve),
      };
      return q;
    },
  } as unknown as SupabaseClient<Database>;
  const result = await collectBackupData(db, "old");
  assert.equal(result.data.log_entries.length, 1501);
  assert.equal(result.manifest.counts.log_entries, 1501);
  fail = true;
  await assert.rejects(collectBackupData(db, "old"), /log_entry: page denied/);
});
test("missing originals fail before creating a partial aircraft", async () => {
  const { inserted, client } = destination();
  const data = {
    ...core,
    documents: [{ id: "doc", storage_path: "old/doc.pdf" }],
  };
  await assert.rejects(
    importBackup(client, "me", archive(data, "docs/doc.pdf")),
    /missing docs\/doc.pdf/,
  );
  assert.deepEqual(inserted, {});
});
test("restore does not call a failed original upload successful", async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("storage denied", { status: 503 });
  try {
    const { client } = destination();
    await assert.rejects(
      importBackup(
        client,
        "me",
        archive({
          ...core,
          documents: [{ id: "doc", storage_path: "old/doc.pdf" }],
        }),
      ),
      /Could not restore.*503/,
    );
  } finally {
    globalThis.fetch = old;
  }
});
test("v2 roundtrip remaps oil, W&B, source documents and both photo kinds", async () => {
  const data: BackupData = {
    ...core,
    pages: [{ id: "pg", logbook_id: "lb", storage_path: "old/lb/pg.jpg" }],
    components: [{ id: "eng" }],
    squawks: [{ id: "sq" }],
    squawk_photos: [
      {
        id: "sp",
        squawk_id: "sq",
        storage_path: "old/squawks/sq/sp.jpg",
        thumbnail_path: "old/thumb.jpg",
        created_by: "someone",
      },
    ],
    hours_readings: [{ id: "hr", tach: 14.2, photo_path: "old/meters/hr.jpg" }],
    weight_balances: [{ id: "wb", empty_weight: 1780, source_page_id: "pg" }],
    scanned_documents: [
      { id: "sd", page_id: "pg", doc_type: "weight_balance", applied: true },
    ],
    oil_additions: [{ id: "oa", component_id: "eng", quarts: 1.5 }],
    oil_analysis_samples: [
      {
        id: "os",
        component_id: "eng",
        source_page_id: "pg",
        elements_ppm: { Fe: 20 },
      },
    ],
  };
  const { inserted, client } = destination();
  const oldFetch = globalThis.fetch;
  const uploads: string[] = [];
  globalThis.fetch = async (_url, init) => {
    uploads.push(String((init?.body as FormData).get("path")));
    return new Response("ok");
  };
  try {
    const { aircraftId } = await importBackup(client, "me", archive(data));
    const row = (table: string) => inserted[table][0];
    assert.equal(row("weight_balance").source_page_id, row("page").id);
    assert.equal(row("scanned_document").page_id, row("page").id);
    assert.equal(row("oil_addition").component_id, row("component").id);
    assert.equal(row("oil_analysis_sample").component_id, row("component").id);
    assert.deepEqual(row("oil_analysis_sample").elements_ppm, { Fe: 20 });
    assert.equal(row("squawk_photo").squawk_id, row("squawk").id);
    assert.equal(row("squawk_photo").created_by, "me");
    assert.equal(row("squawk_photo").thumbnail_path, null);
    assert.match(
      String(row("hours_reading").photo_path),
      new RegExp(`^${aircraftId}/meters/`),
    );
    assert.equal(uploads.length, 3);
    assert.ok(uploads.every((path) => path.startsWith(`${aircraftId}/`)));
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("owner workspace backup includes private originals only for the actual owner", async () => {
  const requested: string[] = [];
  const records: Record<string, unknown[]> = {
    aircraft: [{ id: "old", owner_id: "owner", tail_number: "N118QA" }],
    aircraft_inbox: [
      {
        id: "inbox",
        storage_path: "old/inbox/inbox/original",
        mime_type: "application/pdf",
      },
    ],
    aircraft_expense: [{ id: "expense", amount_minor: 12550, currency: "USD" }],
    engine_observation: [{ id: "compression" }],
  };
  const db = {
    from(table: string) {
      requested.push(table);
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        range: () => q,
        single: async () => ({ data: records[table]?.[0], error: null }),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: records[table] ?? [], error: null }).then(
            resolve,
          ),
      };
      return q;
    },
  } as unknown as SupabaseClient<Database>;
  const owner = await collectBackupData(db, "old", "owner");
  assert.equal(owner.data.expenses?.length, 1);
  assert.equal(owner.data.inbox_items?.length, 1);
  assert.equal(owner.data.engine_observations?.length, 1);
  assert.equal(
    owner.blobs.find((b) => b.prefix === "inbox-files")?.entry,
    "inbox-files/inbox.pdf",
  );
  requested.length = 0;
  const editor = await collectBackupData(db, "old", "editor");
  assert.equal(editor.data.expenses?.length, 0);
  assert.equal(editor.data.inbox_items?.length, 0);
  assert.equal(editor.data.engine_observations?.length, 1);
  assert.equal(requested.includes("aircraft_inbox"), false);
  assert.equal(requested.includes("aircraft_expense"), false);
});

test("owner workspace restore remaps private invoice, engine observations and oil report sources", async () => {
  const data: BackupData = {
    ...core,
    log_entries: [{ id: "entry", logbook_id: "lb" }],
    components: [{ id: "eng", category: "engine" }],
    documents: [{ id: "doc" }],
    inbox_items: [
      {
        id: "inbox",
        storage_path: "old/inbox/inbox/original",
        mime_type: "application/pdf",
        file_name: "report.pdf",
        kind: "invoice",
        state: "approved",
        proposal: {},
        document_id: null,
        page_ids: [],
      },
    ],
    expenses: [
      {
        id: "expense",
        inbox_id: "inbox",
        document_id: "doc",
        log_entry_id: "entry",
        amount_minor: 12550,
        currency: "USD",
      },
    ],
    engine_observations: [
      {
        id: "event",
        component_id: "eng",
        source_entry_id: "entry",
        source_page_id: null,
        kind: "compression",
        readings: [{ cylinder: 1, psi: 75, reference: 80 }],
      },
    ],
    oil_analysis_samples: [
      { id: "sample", component_id: "eng", source_inbox_id: "inbox" },
    ],
  };
  const { inserted, client } = destination(),
    restoredInbox = "20000000-0000-4000-a000-000000000001";
  const calls: unknown[] = [];
  (client as unknown as { rpc: unknown }).rpc = async (
    _name: string,
    args: unknown,
  ) => {
    calls.push(args);
    return { error: null };
  };
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/inbox")) {
      assert.equal((init?.body as FormData).get("restoreSourceId"), "inbox");
      return Response.json({ item: { id: restoredInbox } });
    }
    return new Response("ok");
  };
  try {
    await importBackup(client, "owner", archive(data));
    assert.equal(inserted.aircraft_expense[0].inbox_id, restoredInbox);
    assert.equal(
      inserted.aircraft_expense[0].document_id,
      inserted.document[0].id,
    );
    assert.equal(
      inserted.aircraft_expense[0].log_entry_id,
      inserted.log_entry[0].id,
    );
    assert.equal(
      inserted.engine_observation[0].component_id,
      inserted.component[0].id,
    );
    assert.equal(
      inserted.engine_observation[0].source_entry_id,
      inserted.log_entry[0].id,
    );
    assert.equal(
      inserted.oil_analysis_sample[0].source_inbox_id,
      restoredInbox,
    );
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

import { unzip } from "fflate";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { blobRefsFor } from "./collect";
import { makeThumbnail, thumbnailKey } from "@/lib/capture/thumbnail";
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  extOf,
  mimeOf,
  type BackupData,
  type Row,
} from "./format";

type Progress = (msg: string) => void;
type TableName = keyof Database["public"]["Tables"];

/**
 * Upload one blob to a storage key under the new aircraft, via the editor-gated
 * server route. An original is required: a failed upload must never report a complete restore.
 */
async function uploadBlob(
  aircraftId: string,
  path: string,
  blob: Blob,
  contentType: string,
): Promise<void> {
  const fd = new FormData();
  fd.set("path", path);
  fd.set(
    "file",
    new File([blob], path.split("/").pop() || "blob", { type: contentType }),
  );
  const response = await fetch(`/api/aircraft/${aircraftId}/blob`, {
    method: "POST",
    body: fd,
  });
  if (!response.ok)
    throw new Error(
      `Could not restore ${path} (${response.status}). Retry the restore; no complete backup has been restored.`,
    );
}

/** Drop server-managed fields before re-inserting a backed-up row. */
function clean(row: Row): Row {
  const o = { ...row };
  delete o.id;
  delete o.created_at;
  delete o.updated_at;
  // provider_id is set again from the restored providers where a row carries one (step 5b).
  // shortcut: scan batches aren't in the backup, so that link is dropped; add them if a restore ever needs them.
  delete o.provider_id;
  delete o.batch_id;
  return o;
}

/**
 * A backed-up log entry as the owner may re-insert it. The in-app e-signature is not restored: its digest is a
 * plain hash anyone could recompute, so a restored zip can't prove the mechanic signed it, and the database only
 * lets sign_authored_entry create signed rows. The entry keeps its text, signer name and certificate number.
 */
export function restorableEntry(e: Row): Row {
  const o = clean(e);
  delete o.trust; // generated column (0069)
  for (const col of [
    "authored_signed_at",
    "authored_digest",
    "authored_by",
    "supersedes_entry_id",
    "authored_superseded_by",
    "replaced_by_entry_id",
  ]) {
    delete o[col];
  }
  return o;
}

/** The ad_reference id for a backed-up compliance row in this database, or null (the link is optional). */
export function resolveAdReference(
  a: Row,
  known: Map<string, string>,
): string | null {
  if (!a.ad_reference_id) return null;
  return (
    known.get(a.ad_reference_id as string) ??
    known.get(`ad:${a.reference}`) ??
    null
  );
}

async function insertRows(
  supabase: SupabaseClient<Database>,
  table: TableName,
  rows: Row[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    // Dynamic table name → the typed insert union collapses; cast the arg.
    const { error } = await supabase.from(table).insert(chunk as never);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

/**
 * Restore a backup .zip as a NEW aircraft owned by the signed-in user. All ids
 * are regenerated and foreign keys remapped, so it never touches existing data.
 * Runs in the browser: scans upload straight to storage, thumbnails regenerate
 * client-side. Returns the new aircraft id.
 */
export async function importBackup(
  supabase: SupabaseClient<Database>,
  userId: string,
  zipBlob: Blob,
  onProgress?: Progress,
): Promise<{ aircraftId: string; tail: string }> {
  onProgress?.("Reading archive…");
  const buf = new Uint8Array(await zipBlob.arrayBuffer());
  const files = await new Promise<Record<string, Uint8Array>>(
    (resolve, reject) =>
      unzip(buf, (err, out) => (err ? reject(err) : resolve(out))),
  );

  const dec = new TextDecoder();
  const manifestRaw = files["manifest.json"];
  if (!manifestRaw) throw new Error("Not a MyTailLog backup (no manifest).");
  const manifest = JSON.parse(dec.decode(manifestRaw));
  if (manifest.format !== BACKUP_FORMAT)
    throw new Error("This isn't a MyTailLog backup file.");
  if (manifest.format_version > BACKUP_FORMAT_VERSION) {
    throw new Error("This backup is from a newer version of MyTailLog.");
  }
  if (!files["data.json"])
    throw new Error("Not a MyTailLog backup (no records).");
  const data: BackupData = JSON.parse(dec.decode(files["data.json"]));
  if (
    !data.aircraft ||
    typeof data.aircraft !== "object" ||
    Array.isArray(data.aircraft)
  )
    throw new Error("Backup has no aircraft record.");
  for (const key of [
    "logbooks",
    "pages",
    "log_entries",
    "components",
    "ad_compliance",
    "maintenance_items",
    "documents",
  ] as const) {
    if (
      !Array.isArray(data[key]) ||
      data[key].some(
        (row) => !row || typeof row !== "object" || typeof row.id !== "string",
      )
    ) {
      throw new Error(`Backup has invalid ${key} records.`);
    }
  }
  // Validate all originals before creating anything. Old incomplete archives require the owner to recover the files.
  for (const ref of blobRefsFor(data)) {
    if (
      manifest.format_version < 2 &&
      (ref.prefix === "meter-photos" || ref.prefix === "squawk-photos")
    )
      continue;
    if (!files[ref.entry])
      throw new Error(
        `Backup is missing ${ref.entry}. Nothing has been restored.`,
      );
  }

  // 1. Aircraft (new id + this user as owner).
  const aircraftId = crypto.randomUUID();
  const aircraftRow = clean(data.aircraft);
  delete aircraftRow.owner_id;
  aircraftRow.id = aircraftId;
  aircraftRow.owner_id = userId;
  await insertRows(supabase, "aircraft", [aircraftRow]);

  // 2. Logbooks.
  const logbookMap = new Map<string, string>();
  const logbookRows = data.logbooks.map((lb) => {
    const nid = crypto.randomUUID();
    logbookMap.set(lb.id as string, nid);
    const o = clean(lb);
    o.id = nid;
    o.aircraft_id = aircraftId;
    return o;
  });
  await insertRows(supabase, "logbook", logbookRows);

  // 3. Pages — upload each scan to a fresh storage path, regenerate thumbnail.
  const pageMap = new Map(
    data.pages.map((p) => [p.id as string, crypto.randomUUID()]),
  );
  const pageRows: Row[] = [];
  let uploaded = 0;
  for (const p of data.pages) {
    const nid = pageMap.get(p.id as string)!;
    const newLogbook = logbookMap.get(p.logbook_id as string)!;
    const ext = extOf(p.storage_path as string);
    const newPath = `${aircraftId}/${newLogbook}/${nid}.${ext}`;
    const scan = files[`scans/${p.id}.${ext}`];

    let thumbnailPath: string | null = null;
    if (scan) {
      const blob = new Blob([scan as BlobPart], { type: mimeOf(ext) });
      await uploadBlob(aircraftId, newPath, blob, mimeOf(ext));
      try {
        const thumb = await makeThumbnail(blob);
        const tp = thumbnailKey(newPath);
        await uploadBlob(aircraftId, tp, thumb, "image/jpeg");
        thumbnailPath = tp;
      } catch {
        // Thumbnail is best-effort; the list view falls back to the original.
      }
    }

    const o = clean(p);
    o.id = nid;
    o.aircraft_id = aircraftId;
    o.logbook_id = newLogbook;
    o.duplicate_of_page_id = null;
    o.queued_by = null;
    o.storage_path = p.storage_path ? newPath : null;
    o.thumbnail_path = thumbnailPath;
    pageRows.push(o);
    onProgress?.(`Restoring scans… ${++uploaded}/${data.pages.length}`);
  }
  await insertRows(supabase, "page", pageRows);
  // A duplicate can point at a page in a later insert chunk.
  for (const p of data.pages) {
    const target = p.duplicate_of_page_id
      ? pageMap.get(p.duplicate_of_page_id as string)
      : null;
    if (!target) continue;
    const { error } = await supabase
      .from("page")
      .update({ duplicate_of_page_id: target })
      .eq("id", pageMap.get(p.id as string)!);
    if (error) throw new Error(`page: ${error.message}`);
  }

  onProgress?.("Restoring records…");

  // 4. Log entries. Ids are mapped up front because supersede links can point forward.
  const entryMap = new Map(
    data.log_entries.map((e) => [e.id as string, crypto.randomUUID()]),
  );
  const entryRows = data.log_entries.map((e) => {
    const o = restorableEntry(e);
    o.id = entryMap.get(e.id as string);
    o.aircraft_id = aircraftId;
    o.logbook_id = logbookMap.get(e.logbook_id as string);
    o.page_id = e.page_id ? (pageMap.get(e.page_id as string) ?? null) : null;
    return o;
  });
  await insertRows(supabase, "log_entry", entryRows);
  // Second pass: links may cross insert chunks.
  for (const e of data.log_entries) {
    const links: Row = {};
    for (const col of [
      "supersedes_entry_id",
      "authored_superseded_by",
      "replaced_by_entry_id",
    ]) {
      const to = e[col] ? entryMap.get(e[col] as string) : undefined;
      if (to) links[col] = to;
    }
    if (!Object.keys(links).length) continue;
    const { error } = await supabase
      .from("log_entry")
      .update(links as never)
      .eq("id", entryMap.get(e.id as string)!);
    if (error) throw new Error(`log_entry: ${error.message}`);
  }

  // 5. Components (reference log entries).
  const componentMap = new Map<string, string>();
  const componentRows = data.components.map((c) => {
    const nid = crypto.randomUUID();
    componentMap.set(c.id as string, nid);
    const o = clean(c);
    o.id = nid;
    o.aircraft_id = aircraftId;
    o.install_entry_id = c.install_entry_id
      ? (entryMap.get(c.install_entry_id as string) ?? null)
      : null;
    o.removal_entry_id = c.removal_entry_id
      ? (entryMap.get(c.removal_entry_id as string) ?? null)
      : null;
    return o;
  });
  await insertRows(supabase, "component", componentRows);

  // 5b. Service providers (0072), before the rows that name one.
  const providerMap = new Map<string, string>();
  await insertRows(
    supabase,
    "service_provider",
    (data.service_providers ?? []).map((p) => {
      providerMap.set(p.id as string, crypto.randomUUID());
      return owned(p, aircraftId, providerMap.get(p.id as string));
    }),
  );
  const provider = (r: Row) =>
    r.provider_id ? (providerMap.get(r.provider_id as string) ?? null) : null;

  // 6. AD/SB compliance (reference entries + components). ad_reference is a shared table whose ids differ per
  //    database (e.g. a production backup restored on test): keep an id that exists here, else match by AD number.
  const linked = data.ad_compliance.filter((a) => a.ad_reference_id);
  const known = new Map<string, string>(); // backup ad_reference_id or AD number -> id in this database
  if (linked.length) {
    const ids = [...new Set(linked.map((a) => a.ad_reference_id as string))];
    const nums = [...new Set(linked.map((a) => a.reference as string))];
    const byId = await supabase.from("ad_reference").select("id").in("id", ids);
    const byNum = await supabase
      .from("ad_reference")
      .select("id, ad_number")
      .in("ad_number", nums);
    if (byId.error || byNum.error)
      throw new Error(`ad_reference: ${(byId.error ?? byNum.error)!.message}`);
    for (const r of byId.data) known.set(r.id, r.id);
    for (const r of byNum.data)
      if (r.ad_number) known.set(`ad:${r.ad_number}`, r.id);
  }
  const adMap = new Map<string, string>();
  const adRows = data.ad_compliance.map((a) => {
    const o = clean(a);
    adMap.set(a.id as string, crypto.randomUUID());
    o.id = adMap.get(a.id as string);
    o.aircraft_id = aircraftId;
    o.provider_id = provider(a);
    o.ad_reference_id = resolveAdReference(a, known);
    o.verified_report_page_id = a.verified_report_page_id
      ? (pageMap.get(a.verified_report_page_id as string) ?? null)
      : null;
    o.reference_entry_id = a.reference_entry_id
      ? (entryMap.get(a.reference_entry_id as string) ?? null)
      : null;
    o.component_id = a.component_id
      ? (componentMap.get(a.component_id as string) ?? null)
      : null;
    return o;
  });
  await insertRows(supabase, "ad_compliance", adRows);

  // 7. Maintenance items.
  const mxMap = new Map<string, string>();
  const mxRows = data.maintenance_items.map((m) => {
    const o = clean(m);
    mxMap.set(m.id as string, crypto.randomUUID());
    o.id = mxMap.get(m.id as string);
    o.aircraft_id = aircraftId;
    o.provider_id = provider(m);
    return o;
  });
  await insertRows(supabase, "maintenance_item", mxRows);

  // 7b. Meter replacements (absent in pre-0046 archives).
  const resetRows = (data.meter_resets ?? []).map((r) => {
    const o = clean(r);
    o.aircraft_id = aircraftId;
    return o;
  });
  await insertRows(supabase, "meter_reset", resetRows);

  // 8. Documents (upload any scanned file to a fresh path).
  const docRows: Row[] = [];
  const documentMap = new Map<string, string>();
  for (const d of data.documents) {
    const nid = crypto.randomUUID();
    documentMap.set(String(d.id), nid);
    const o = clean(d);
    o.id = nid;
    o.aircraft_id = aircraftId;
    // 0041's entry attachment. Without the remap this carries the SOURCE
    // aircraft's entry id, which fails the FK and kills the whole restore.
    o.log_entry_id = d.log_entry_id
      ? (entryMap.get(d.log_entry_id as string) ?? null)
      : null;
    if (d.storage_path) {
      const ext = extOf(d.storage_path as string);
      const file = files[`docs/${d.id}.${ext}`];
      if (file) {
        const newPath = `${aircraftId}/documents/${nid}.${ext}`;
        await uploadBlob(
          aircraftId,
          newPath,
          new Blob([file as BlobPart]),
          mimeOf(ext),
        );
        o.storage_path = newPath;
      } else {
        o.storage_path = null;
      }
    }
    docRows.push(o);
  }
  await insertRows(supabase, "document", docRows);

  // Owner-private originals restore through the same authenticated upload validation as new intake.
  const inboxMap = new Map<string, string>();
  for (const item of data.inbox_items ?? []) {
    const ext =
      item.mime_type === "application/pdf"
        ? "pdf"
        : item.mime_type === "image/png"
          ? "png"
          : item.mime_type === "image/webp"
            ? "webp"
            : "jpg";
    const original = files[`inbox-files/${item.id}.${ext}`];
    if (!original) throw new Error("Inbox original is missing.");
    const form = new FormData();
    form.set("id", crypto.randomUUID());
    form.set("restoreSourceId", String(item.id));
    form.set(
      "file",
      new File([original as BlobPart], String(item.file_name ?? "document"), {
        type: String(item.mime_type),
      }),
    );
    const response = await fetch(`/api/aircraft/${aircraftId}/inbox`, {
      method: "POST",
      body: form,
    });
    if (!response.ok)
      throw new Error("Could not restore the document inbox original.");
    const result = await response.json();
    inboxMap.set(String(item.id), result.item.id);
  }
  await insertRows(
    supabase,
    "engine_observation",
    (data.engine_observations ?? []).map((r) => ({
      ...owned(r, aircraftId),
      component_id: componentMap.get(String(r.component_id)),
      source_entry_id: r.source_entry_id
        ? (entryMap.get(String(r.source_entry_id)) ?? null)
        : null,
      source_page_id: r.source_page_id
        ? (pageMap.get(String(r.source_page_id)) ?? null)
        : null,
    })),
  );

  // 9. Direction D tables (09 §6; absent in older archives). Order follows the foreign keys:
  //    squawks and visits, then completions (→ visit), then visit items (→ visit, completion, item keys).
  const remap = (m: Map<string, string>, id: unknown) =>
    id ? (m.get(id as string) ?? null) : null;
  const squawkMap = new Map<string, string>();
  await insertRows(
    supabase,
    "squawk",
    (data.squawks ?? []).map((q) => {
      squawkMap.set(q.id as string, crypto.randomUUID());
      return {
        ...owned(q, aircraftId, squawkMap.get(q.id as string)),
        resolved_log_entry_id: remap(entryMap, q.resolved_log_entry_id),
      };
    }),
  );
  const visitMap = new Map<string, string>();
  await insertRows(
    supabase,
    "planned_visit",
    (data.planned_visits ?? []).map((v) => {
      visitMap.set(v.id as string, crypto.randomUUID());
      return {
        ...owned(v, aircraftId, visitMap.get(v.id as string)),
        provider_id: provider(v),
      };
    }),
  );
  const completionMap = new Map<string, string>();
  await insertRows(
    supabase,
    "item_completion",
    (data.item_completions ?? []).flatMap((c) => {
      const mx = remap(mxMap, c.maintenance_item_id),
        ad = remap(adMap, c.ad_compliance_id);
      if (!mx && !ad) return []; // exactly one parent is required (0070)
      completionMap.set(c.id as string, crypto.randomUUID());
      return [
        {
          ...owned(c, aircraftId, completionMap.get(c.id as string)),
          maintenance_item_id: mx,
          ad_compliance_id: ad,
          log_entry_id: remap(entryMap, c.log_entry_id),
          visit_id: remap(visitMap, c.visit_id),
        },
      ];
    }),
  );
  const keyMaps = { mx: mxMap, ad: adMap, squawk: squawkMap };
  await insertRows(
    supabase,
    "planned_visit_item",
    (data.planned_visit_items ?? []).flatMap((i) => {
      const visit = remap(visitMap, i.visit_id),
        key = restoreItemKey(i.item_key as string, keyMaps);
      return visit && key
        ? [
            {
              ...owned(i, aircraftId),
              visit_id: visit,
              item_key: key,
              done_completion_id: remap(completionMap, i.done_completion_id),
            },
          ]
        : [];
    }),
  );
  await insertRows(
    supabase,
    "logbook_gap",
    (data.logbook_gaps ?? []).flatMap((g) => {
      const lb = remap(logbookMap, g.logbook_id);
      return lb ? [{ ...owned(g, aircraftId), logbook_id: lb }] : [];
    }),
  );
  // Additional record sets were added in format v2; old v1 archives remain importable.
  for (const [key, table] of [
    ["weight_balances", "weight_balance"],
    ["scanned_documents", "scanned_document"],
    ["oil_additions", "oil_addition"],
    ["oil_analysis_samples", "oil_analysis_sample"],
  ] as const) {
    await insertRows(
      supabase,
      table,
      (data[key] ?? []).map((r) => {
        const row = owned(r, aircraftId, crypto.randomUUID());
        if ("component_id" in row)
          row.component_id = remap(componentMap, r.component_id);
        if ("source_inbox_id" in row)
          row.source_inbox_id = remap(inboxMap, r.source_inbox_id);
        if ("source_page_id" in row)
          row.source_page_id = remap(pageMap, r.source_page_id);
        if ("page_id" in row) row.page_id = remap(pageMap, r.page_id);
        return row;
      }),
    );
  }
  for (const [key, table, prefix, column] of [
    ["squawk_photos", "squawk_photo", "squawk-photos", "storage_path"],
    ["hours_readings", "hours_reading", "meter-photos", "photo_path"],
  ] as const) {
    const rows: Row[] = [];
    for (const r of data[key] ?? []) {
      const nid = crypto.randomUUID();
      const row = owned(r, aircraftId, nid);
      if (table === "squawk_photo") {
        row.squawk_id = remap(squawkMap, r.squawk_id);
        row.thumbnail_path = null;
        // Restore is an owner action; satisfy the photographer insert policy.
        row.created_by = userId;
      }
      row[column] = null;
      if (
        r[column] &&
        (manifest.format_version >= 2 ||
          files[`${prefix}/${r.id}.${extOf(r[column] as string)}`])
      ) {
        const ext = extOf(r[column] as string);
        const newPath =
          table === "squawk_photo"
            ? `${aircraftId}/squawks/${row.squawk_id}/${nid}.${ext}`
            : `${aircraftId}/meters/${nid}.${ext}`;
        await uploadBlob(
          aircraftId,
          newPath,
          new Blob([files[`${prefix}/${r.id}.${ext}`] as BlobPart]),
          mimeOf(ext),
        );
        row[column] = newPath;
      }
      rows.push(row);
    }
    await insertRows(supabase, table, rows);
  }

  await insertRows(
    supabase,
    "aircraft_expense",
    (data.expenses ?? []).map((r) => ({
      ...owned(r, aircraftId),
      document_id: remap(documentMap, r.document_id),
      log_entry_id: remap(entryMap, r.log_entry_id),
      inbox_id: remap(inboxMap, r.inbox_id),
    })),
  );
  for (const item of data.inbox_items ?? []) {
    const { error } = await supabase.rpc("restore_inbox_destination", {
      p_aircraft: aircraftId,
      p_id: inboxMap.get(String(item.id))!,
      p_kind: String(item.kind ?? "unclassified"),
      p_proposal: (item.proposal ?? {}) as Record<string, unknown>,
      p_approved: item.state === "approved",
      p_document: remap(documentMap, item.document_id),
      p_pages: (Array.isArray(item.page_ids) ? item.page_ids : [])
        .map((p) => pageMap.get(String(p)))
        .filter((p): p is string => !!p),
    });
    if (error) throw new Error(`Inbox destination: ${error.message}`);
  }

  return {
    aircraftId,
    tail: (data.aircraft.tail_number as string) || "aircraft",
  };
}

/** `mx:<id>` / `ad:<id>` / `squawk:<id>` with the id this restore gave the row, or null when the row didn't come along. */
export function restoreItemKey(
  key: string,
  maps: Record<string, Map<string, string>>,
): string | null {
  const i = key.indexOf(":");
  const to = maps[key.slice(0, i)]?.get(key.slice(i + 1));
  return to ? `${key.slice(0, i)}:${to}` : null;
}

// Who did what on the source account; those user ids mean nothing (or someone else) where the backup lands.
const USER_COLS = [
  "created_by",
  "reported_by",
  "resolved_by",
  "status_set_by",
  "synced_by",
  "dismissed_by",
];

/** A Direction D row for the new aircraft: server columns dropped, user ids cleared, optionally a new id. */
function owned(row: Row, aircraftId: string, id?: string): Row {
  const o = clean(row);
  for (const c of USER_COLS) if (c in o) o[c] = null;
  o.aircraft_id = aircraftId;
  if (id) o.id = id;
  return o;
}

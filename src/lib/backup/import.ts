import { unzip } from "fflate";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { makeThumbnail, thumbnailKey } from "@/lib/capture/thumbnail";
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  extOf,
  mimeOf,
  type BackupData,
  type Row,
} from "./format";

const BUCKET = process.env.NEXT_PUBLIC_LOGBOOK_STORAGE_BUCKET || "logbook-pages";

type Progress = (msg: string) => void;
type TableName = keyof Database["public"]["Tables"];

/** Drop server-managed fields before re-inserting a backed-up row. */
function clean(row: Row): Row {
  const o = { ...row };
  delete o.id;
  delete o.created_at;
  delete o.updated_at;
  return o;
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
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
    unzip(buf, (err, out) => (err ? reject(err) : resolve(out))),
  );

  const dec = new TextDecoder();
  const manifestRaw = files["manifest.json"];
  if (!manifestRaw) throw new Error("Not a MyTailLog backup (no manifest).");
  const manifest = JSON.parse(dec.decode(manifestRaw));
  if (manifest.format !== BACKUP_FORMAT) throw new Error("This isn't a MyTailLog backup file.");
  if (manifest.format_version > BACKUP_FORMAT_VERSION) {
    throw new Error("This backup is from a newer version of MyTailLog.");
  }
  const data: BackupData = JSON.parse(dec.decode(files["data.json"]));

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
  const pageMap = new Map<string, string>();
  const pageRows: Row[] = [];
  let uploaded = 0;
  for (const p of data.pages) {
    const nid = crypto.randomUUID();
    pageMap.set(p.id as string, nid);
    const newLogbook = logbookMap.get(p.logbook_id as string)!;
    const ext = extOf(p.storage_path as string);
    const newPath = `${aircraftId}/${newLogbook}/${nid}.${ext}`;
    const scan = files[`scans/${p.id}.${ext}`];

    let thumbnailPath: string | null = null;
    if (scan) {
      const blob = new Blob([scan as BlobPart], { type: mimeOf(ext) });
      await supabase.storage.from(BUCKET).upload(newPath, blob, {
        contentType: mimeOf(ext),
        upsert: true,
      });
      try {
        const thumb = await makeThumbnail(blob);
        const tp = thumbnailKey(newPath);
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(tp, thumb, { contentType: "image/jpeg", upsert: true });
        if (!error) thumbnailPath = tp;
      } catch {
        // Thumbnail is best-effort; the list view falls back to the original.
      }
    }

    const o = clean(p);
    o.id = nid;
    o.aircraft_id = aircraftId;
    o.logbook_id = newLogbook;
    o.storage_path = newPath;
    o.thumbnail_path = thumbnailPath;
    pageRows.push(o);
    onProgress?.(`Restoring scans… ${++uploaded}/${data.pages.length}`);
  }
  await insertRows(supabase, "page", pageRows);

  onProgress?.("Restoring records…");

  // 4. Log entries.
  const entryMap = new Map<string, string>();
  const entryRows = data.log_entries.map((e) => {
    const nid = crypto.randomUUID();
    entryMap.set(e.id as string, nid);
    const o = clean(e);
    o.id = nid;
    o.aircraft_id = aircraftId;
    o.logbook_id = logbookMap.get(e.logbook_id as string);
    o.page_id = e.page_id ? pageMap.get(e.page_id as string) ?? null : null;
    return o;
  });
  await insertRows(supabase, "log_entry", entryRows);

  // 5. Components (reference log entries).
  const componentMap = new Map<string, string>();
  const componentRows = data.components.map((c) => {
    const nid = crypto.randomUUID();
    componentMap.set(c.id as string, nid);
    const o = clean(c);
    o.id = nid;
    o.aircraft_id = aircraftId;
    o.install_entry_id = c.install_entry_id ? entryMap.get(c.install_entry_id as string) ?? null : null;
    o.removal_entry_id = c.removal_entry_id ? entryMap.get(c.removal_entry_id as string) ?? null : null;
    return o;
  });
  await insertRows(supabase, "component", componentRows);

  // 6. AD/SB compliance (reference entries + components; ad_reference_id is the
  //    shared global reference table, kept as-is).
  const adRows = data.ad_compliance.map((a) => {
    const o = clean(a);
    o.aircraft_id = aircraftId;
    o.reference_entry_id = a.reference_entry_id
      ? entryMap.get(a.reference_entry_id as string) ?? null
      : null;
    o.component_id = a.component_id ? componentMap.get(a.component_id as string) ?? null : null;
    return o;
  });
  await insertRows(supabase, "ad_compliance", adRows);

  // 7. Maintenance items.
  const mxRows = data.maintenance_items.map((m) => {
    const o = clean(m);
    o.aircraft_id = aircraftId;
    return o;
  });
  await insertRows(supabase, "maintenance_item", mxRows);

  // 8. Documents (upload any scanned file to a fresh path).
  const docRows: Row[] = [];
  for (const d of data.documents) {
    const nid = crypto.randomUUID();
    const o = clean(d);
    o.id = nid;
    o.aircraft_id = aircraftId;
    if (d.storage_path) {
      const ext = extOf(d.storage_path as string);
      const file = files[`docs/${d.id}.${ext}`];
      if (file) {
        const newPath = `${aircraftId}/documents/${nid}.${ext}`;
        await supabase.storage.from(BUCKET).upload(newPath, new Blob([file as BlobPart]), {
          contentType: mimeOf(ext),
          upsert: true,
        });
        o.storage_path = newPath;
      } else {
        o.storage_path = null;
      }
    }
    docRows.push(o);
  }
  await insertRows(supabase, "document", docRows);

  return { aircraftId, tail: (data.aircraft.tail_number as string) || "aircraft" };
}

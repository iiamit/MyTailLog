import { zip, type AsyncZippable } from "fflate";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  extOf,
  type BackupData,
  type BackupManifest,
  type Row,
} from "./format";

type Progress = (msg: string) => void;

/**
 * Build a portable .zip of one aircraft's entire dataset (records + original
 * scans). Runs entirely in the browser — scans stream through the app's own
 * RLS-scoped serving routes (backend-agnostic) into the archive.
 *
 * ponytail: whole archive is assembled in memory. Fine at personal scale
 * (dozens–hundreds of pages); switch to fflate's streaming Zip if a library
 * ever grows past a few hundred MB of scans.
 */
export async function exportBackup(
  supabase: SupabaseClient<Database>,
  aircraftId: string,
  onProgress?: Progress,
): Promise<{ blob: Blob; tail: string }> {
  onProgress?.("Reading records…");

  const [aircraft, logbooks, pages, entries, components, compliance, maintenance, documents] =
    await Promise.all([
      supabase.from("aircraft").select("*").eq("id", aircraftId).single(),
      supabase.from("logbook").select("*").eq("aircraft_id", aircraftId),
      supabase.from("log_entry").select("*").eq("aircraft_id", aircraftId),
      supabase.from("page").select("*").eq("aircraft_id", aircraftId),
      supabase.from("component").select("*").eq("aircraft_id", aircraftId),
      supabase.from("ad_compliance").select("*").eq("aircraft_id", aircraftId),
      supabase.from("maintenance_item").select("*").eq("aircraft_id", aircraftId),
      supabase.from("document").select("*").eq("aircraft_id", aircraftId),
    ]);

  if (aircraft.error || !aircraft.data) {
    throw new Error(aircraft.error?.message ?? "Aircraft not found.");
  }

  // Note: the destructured order above is aircraft, logbooks, log_entry, page…
  // so name them explicitly to avoid confusion.
  const data: BackupData = {
    aircraft: aircraft.data as Row,
    logbooks: (logbooks.data ?? []) as Row[],
    log_entries: (entries.data ?? []) as Row[],
    pages: (pages.data ?? []) as Row[],
    components: (components.data ?? []) as Row[],
    ad_compliance: (compliance.data ?? []) as Row[],
    maintenance_items: (maintenance.data ?? []) as Row[],
    documents: (documents.data ?? []) as Row[],
  };

  const files: AsyncZippable = {};

  // Gather storage files: page originals + document scans.
  const items: { id: string; storagePath: string; prefix: "scans" | "docs" }[] = [];
  for (const p of data.pages) {
    const sp = p.storage_path as string | null;
    if (sp) items.push({ id: p.id as string, storagePath: sp, prefix: "scans" });
  }
  for (const d of data.documents) {
    const sp = d.storage_path as string | null;
    if (sp) items.push({ id: d.id as string, storagePath: sp, prefix: "docs" });
  }

  // Fetch each blob through the app's RLS-scoped serving routes (works on any
  // storage backend). JPEGs are already compressed, so store them (level 0) and
  // only compress the JSON.
  let done = 0;
  for (const it of items) {
    const url = it.prefix === "docs" ? `/api/document/${it.id}` : `/api/page/${it.id}/image`;
    try {
      const res = await fetch(url);
      if (res.ok) {
        const buf = new Uint8Array(await res.arrayBuffer());
        files[`${it.prefix}/${it.id}.${extOf(it.storagePath)}`] = [buf, { level: 0 }];
      }
    } catch {
      // Skip a scan that can't be fetched; the rest of the backup still saves.
    }
    onProgress?.(`Packing scans… ${++done}/${items.length}`);
  }

  const tail = (data.aircraft.tail_number as string) || "aircraft";
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    format_version: BACKUP_FORMAT_VERSION,
    app: "MyTailLog",
    exported_at: new Date().toISOString(),
    tail_number: tail,
    counts: {
      logbooks: data.logbooks.length,
      pages: data.pages.length,
      log_entries: data.log_entries.length,
      components: data.components.length,
      ad_compliance: data.ad_compliance.length,
      maintenance_items: data.maintenance_items.length,
      documents: data.documents.length,
      scans: items.length,
    },
  };

  const enc = new TextEncoder();
  files["manifest.json"] = [enc.encode(JSON.stringify(manifest, null, 2)), { level: 6 }];
  files["data.json"] = [enc.encode(JSON.stringify(data)), { level: 6 }];

  onProgress?.("Compressing…");
  const zipped = await new Promise<Uint8Array>((resolve, reject) =>
    zip(files, (err, out) => (err ? reject(err) : resolve(out))),
  );

  return {
    blob: new Blob([zipped as BlobPart], { type: "application/zip" }),
    tail,
  };
}

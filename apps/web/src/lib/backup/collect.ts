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

// ===========================================================================
// Row collection for a backup archive — the half that is identical whether the
// archive is being built in the browser (manual download) or on the server
// (scheduled cloud backup).
//
// This lives on its own precisely so those two callers CANNOT drift: the .zip a
// user downloads and the .zip that lands in their cloud must be the same format,
// or the importer that restores one won't restore the other.
//
// Isomorphic on purpose — no `server-only` import, no storage access. Blobs are
// named here but fetched by the caller, because the browser reads them over the
// RLS-scoped serving routes and the server reads them straight from storage.
// ===========================================================================

/** A blob the archive should contain, and where it goes inside the zip. */
export type BlobRef = {
  id: string;
  storagePath: string;
  prefix: "scans" | "docs";
  /** Path inside the archive, e.g. `scans/<pageId>.jpg`. */
  entry: string;
};

export type CollectedBackup = {
  data: BackupData;
  manifest: BackupManifest;
  blobs: BlobRef[];
  tail: string;
};

/**
 * Read every aircraft-scoped row plus the list of blobs that belong in the
 * archive. Runs under whatever client it's given, so RLS still applies when
 * called with a user's session and is bypassed when called with the service
 * client from the scheduled job.
 */
export async function collectBackupData(
  supabase: SupabaseClient<Database>,
  aircraftId: string,
): Promise<CollectedBackup> {
  // Order matters: the destructured names MUST line up with the query order
  // (aircraft, logbook, log_entry, page, …). Getting entries/pages crossed here
  // writes log entries into the backup's `pages` and vice-versa, and a restore
  // then fails inserting log-entry rows (with ad_refs) into the `page` table.
  const [aircraft, logbooks, entries, pages, components, compliance, maintenance, documents, resets] =
    await Promise.all([
      supabase.from("aircraft").select("*").eq("id", aircraftId).single(),
      supabase.from("logbook").select("*").eq("aircraft_id", aircraftId),
      supabase.from("log_entry").select("*").eq("aircraft_id", aircraftId),
      supabase.from("page").select("*").eq("aircraft_id", aircraftId),
      supabase.from("component").select("*").eq("aircraft_id", aircraftId),
      supabase.from("ad_compliance").select("*").eq("aircraft_id", aircraftId),
      supabase.from("maintenance_item").select("*").eq("aircraft_id", aircraftId),
      supabase.from("document").select("*").eq("aircraft_id", aircraftId),
      supabase.from("meter_reset").select("*").eq("aircraft_id", aircraftId),
    ]);

  if (aircraft.error || !aircraft.data) {
    throw new Error(aircraft.error?.message ?? "Aircraft not found.");
  }

  for (const [name, result] of [
    ["logbook", logbooks], ["log_entry", entries], ["page", pages],
    ["component", components], ["ad_compliance", compliance],
    ["maintenance_item", maintenance], ["document", documents], ["meter_reset", resets],
  ] as const) {
    if (result.error) throw new Error(`Backup could not read ${name}: ${result.error.message}`);
  }

  // Direction D tables (09 §6), keyed by table name so a query can't land under the wrong key.
  const extra = {
    service_providers: "service_provider", item_completions: "item_completion", planned_visits: "planned_visit",
    planned_visit_items: "planned_visit_item", logbook_gaps: "logbook_gap", hours_readings: "hours_reading", squawks: "squawk",
  } as const;
  const extraRows: Record<string, Row[]> = {};
  await Promise.all(Object.entries(extra).map(async ([key, table]) => {
    const { data: rows, error } = await supabase.from(table).select("*").eq("aircraft_id", aircraftId);
    if (error) throw new Error(`Backup could not read ${table}: ${error.message}`);
    extraRows[key] = (rows ?? []) as Row[];
  }));

  const data: BackupData = {
    ...extraRows,
    aircraft: aircraft.data as Row,
    logbooks: (logbooks.data ?? []) as Row[],
    log_entries: (entries.data ?? []) as Row[],
    pages: (pages.data ?? []) as Row[],
    components: (components.data ?? []) as Row[],
    ad_compliance: (compliance.data ?? []) as Row[],
    maintenance_items: (maintenance.data ?? []) as Row[],
    documents: (documents.data ?? []) as Row[],
    meter_resets: (resets.data ?? []) as Row[],
  };

  const blobs = blobRefsFor(data);
  const tail = (data.aircraft.tail_number as string) || "aircraft";

  return { data, blobs, tail, manifest: buildManifest(data, tail, blobs.length) };
}

/** Page originals + document scans, in the order they're written to the zip. */
export function blobRefsFor(data: BackupData): BlobRef[] {
  const refs: BlobRef[] = [];
  const add = (rows: Row[], prefix: "scans" | "docs") => {
    for (const r of rows) {
      const sp = r.storage_path as string | null;
      if (!sp) continue;
      const id = r.id as string;
      refs.push({ id, storagePath: sp, prefix, entry: `${prefix}/${id}.${extOf(sp)}` });
    }
  };
  add(data.pages, "scans");
  add(data.documents, "docs");
  return refs;
}

export function buildManifest(data: BackupData, tail: string, scans: number): BackupManifest {
  return {
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
      meter_resets: data.meter_resets?.length ?? 0,
      service_providers: data.service_providers?.length ?? 0,
      item_completions: data.item_completions?.length ?? 0,
      planned_visits: data.planned_visits?.length ?? 0,
      planned_visit_items: data.planned_visit_items?.length ?? 0,
      logbook_gaps: data.logbook_gaps?.length ?? 0,
      hours_readings: data.hours_readings?.length ?? 0,
      squawks: data.squawks?.length ?? 0,
      scans,
    },
  };
}

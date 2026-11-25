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
  prefix: "scans" | "docs" | "squawk-photos" | "meter-photos" | "inbox-files";
  url: string;
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
  requestingUserId?: string,
): Promise<CollectedBackup> {
  const { data: aircraft, error } = await supabase
    .from("aircraft")
    .select("*")
    .eq("id", aircraftId)
    .single();
  if (error || !aircraft)
    throw new Error(error?.message ?? "Aircraft not found.");
  const tables = {
    logbooks: "logbook",
    log_entries: "log_entry",
    pages: "page",
    components: "component",
    ad_compliance: "ad_compliance",
    maintenance_items: "maintenance_item",
    documents: "document",
    meter_resets: "meter_reset",
    service_providers: "service_provider",
    item_completions: "item_completion",
    planned_visits: "planned_visit",
    planned_visit_items: "planned_visit_item",
    logbook_gaps: "logbook_gap",
    hours_readings: "hours_reading",
    squawks: "squawk",
    squawk_photos: "squawk_photo",
    weight_balances: "weight_balance",
    scanned_documents: "scanned_document",
    oil_additions: "oil_addition",
    oil_analysis_samples: "oil_analysis_sample",
    engine_observations: "engine_observation",
    ...(requestingUserId === aircraft.owner_id
      ? ({
          inbox_items: "aircraft_inbox",
          expenses: "aircraft_expense",
        } as const)
      : {}),
  } as const;
  const sets = await Promise.all(
    Object.entries(tables).map(async ([key, table]) => {
      const rows: Row[] = [];
      // PostgREST caps each response. Stable id ordering and explicit ranges include records beyond 1,000.
      for (let offset = 0; ; offset += 500) {
        const { data: page, error } = await supabase
          .from(table)
          .select("*")
          .eq("aircraft_id", aircraftId)
          .order("id")
          .range(offset, offset + 499);
        if (error)
          throw new Error(`Backup could not read ${table}: ${error.message}`);
        rows.push(...((page ?? []) as Row[]));
        if (!page || page.length < 500) break;
      }
      return [key, rows] as const;
    }),
  );
  const data = {
    inbox_items: [],
    expenses: [],
    aircraft: aircraft as Row,
    ...Object.fromEntries(sets),
  } as unknown as BackupData;

  const blobs = blobRefsFor(data);
  const tail = (data.aircraft.tail_number as string) || "aircraft";

  return {
    data,
    blobs,
    tail,
    manifest: buildManifest(data, tail, blobs.length),
  };
}

/** Page originals + document scans, in the order they're written to the zip. */
export function blobRefsFor(data: BackupData): BlobRef[] {
  const refs: BlobRef[] = [];
  const add = (
    rows: Row[],
    prefix: BlobRef["prefix"],
    column = "storage_path",
  ) => {
    for (const r of rows) {
      const sp = r[column] as string | null;
      if (!sp) continue;
      const id = r.id as string;
      const url =
        prefix === "scans"
          ? `/api/page/${id}/image`
          : prefix === "docs"
            ? `/api/document/${id}`
            : `/api/aircraft/${data.aircraft.id}/blob?path=${encodeURIComponent(sp)}`;
      refs.push({
        id,
        storagePath: sp,
        prefix,
        url,
        entry: `${prefix}/${id}.${extOf(sp)}`,
      });
    }
  };
  add(data.pages, "scans");
  add(data.documents, "docs");
  add(data.squawk_photos ?? [], "squawk-photos");
  add(data.hours_readings ?? [], "meter-photos", "photo_path");
  for (const r of data.inbox_items ?? []) {
    if (!r.storage_path) continue;
    const ext =
      r.mime_type === "application/pdf"
        ? "pdf"
        : r.mime_type === "image/png"
          ? "png"
          : r.mime_type === "image/webp"
            ? "webp"
            : "jpg";
    refs.push({
      id: String(r.id),
      storagePath: String(r.storage_path),
      prefix: "inbox-files",
      url: `/api/aircraft/${data.aircraft.id}/inbox/${r.id}/file`,
      entry: `inbox-files/${r.id}.${ext}`,
    });
  }
  return refs;
}

export function buildManifest(
  data: BackupData,
  tail: string,
  scans: number,
): BackupManifest {
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
      squawk_photos: data.squawk_photos?.length ?? 0,
      weight_balances: data.weight_balances?.length ?? 0,
      scanned_documents: data.scanned_documents?.length ?? 0,
      oil_additions: data.oil_additions?.length ?? 0,
      oil_analysis_samples: data.oil_analysis_samples?.length ?? 0,
      inbox_items: data.inbox_items?.length ?? 0,
      expenses: data.expenses?.length ?? 0,
      engine_observations: data.engine_observations?.length ?? 0,
      scans,
    },
  };
}

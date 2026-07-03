// ===========================================================================
// Backup archive format — a single .zip a user can save and re-import.
//
//   <file>.zip
//   ├─ manifest.json   format id + version + export metadata (gate the importer)
//   ├─ data.json       every aircraft-scoped row (full column set, verbatim)
//   ├─ scans/<pageId>.<ext>       original page images (source of truth)
//   └─ docs/<documentId>.<ext>    scanned documents, if any
//
// Thumbnails are NOT stored — they're regenerated in-browser on import.
// Import creates a NEW aircraft (non-destructive), remapping all ids.
// ===========================================================================

export const BACKUP_FORMAT = "mytaillog-backup";
export const BACKUP_FORMAT_VERSION = 1;

export type BackupManifest = {
  format: typeof BACKUP_FORMAT;
  format_version: number;
  app: string;
  exported_at: string;
  tail_number: string;
  counts: Record<string, number>;
};

// Rows are carried verbatim (select *). The importer strips id/owner/timestamps
// and remaps the foreign keys it knows about, so schema drift in other columns
// doesn't break a restore.
export type Row = Record<string, unknown>;

export type BackupData = {
  aircraft: Row;
  logbooks: Row[];
  pages: Row[];
  log_entries: Row[];
  components: Row[];
  ad_compliance: Row[];
  maintenance_items: Row[];
  documents: Row[];
};

/** File extension from a storage path, defaulting to jpg. */
export function extOf(path: string | null | undefined): string {
  const m = path?.match(/\.([^./]+)$/);
  return m ? m[1].toLowerCase() : "jpg";
}

export function mimeOf(ext: string): string {
  if (ext === "png") return "image/png";
  if (ext === "pdf") return "application/pdf";
  return "image/jpeg";
}

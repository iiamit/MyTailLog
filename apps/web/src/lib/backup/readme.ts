import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, type BackupData, type BackupManifest } from "./format";

// ===========================================================================
// README.txt — the export manifest that ships inside every backup .zip, so the
// archive still explains itself years from now on a machine that has never
// heard of MyTailLog.
//
// The column lists are derived from the ROWS THEMSELVES, not from a hand-kept
// table of names: `data.json` is written with `select *`, so a hand-written list
// would silently go stale the first time a migration adds a column. This can't.
// ===========================================================================

/** What each record set in data.json holds, in the owner's terms. */
const WHAT: Record<keyof BackupData, string> = {
  aircraft: "The aircraft itself — registration, make/model, serials, enrollment meter baselines.",
  logbooks: "One row per physical logbook volume (airframe, engine, prop, avionics, other).",
  pages: "One row per scanned logbook page, incl. its file name under scans/.",
  log_entries: "Every maintenance entry transcribed from those pages.",
  components: "Installed and removed equipment (avionics, engines, props) with part/serial numbers.",
  ad_compliance: "Airworthiness Directive and Service Bulletin compliance records.",
  maintenance_items: "Tracked inspections and intervals (annual, 100-hr, transponder, ELT, oil…).",
  documents: "Records Vault files (certificates, POH/AFM, 337s, STCs…), incl. names under docs/.",
  meter_resets: "Hobbs/tach meter replacements, so hour counts stay continuous across a new meter.",
};

const rule = (c: string) => c.repeat(74);

function columnBlock(key: string, rows: Record<string, unknown>[], what: string): string[] {
  const out = [`  ${key} — ${rows.length} row${rows.length === 1 ? "" : "s"}`, `    ${what}`];
  const cols = Object.keys(rows[0] ?? {});
  out.push(
    cols.length > 0
      ? `    Columns: ${cols.join(", ")}`
      : "    Columns: (none recorded — this record set is empty in this archive)",
  );
  return out;
}

/**
 * Build the README.txt written into the archive root. Documents every file and,
 * for data.json, every column actually present in this export.
 */
export function buildReadme(data: BackupData, manifest: BackupManifest): string {
  const sets: [keyof BackupData, Record<string, unknown>[]][] = [
    ["aircraft", [data.aircraft]],
    ["logbooks", data.logbooks],
    ["pages", data.pages],
    ["log_entries", data.log_entries],
    ["components", data.components],
    ["ad_compliance", data.ad_compliance],
    ["maintenance_items", data.maintenance_items],
    ["documents", data.documents],
    ["meter_resets", data.meter_resets ?? []],
  ];

  const lines: string[] = [
    `MyTailLog backup — ${manifest.tail_number}`,
    rule("="),
    `Exported:  ${manifest.exported_at}`,
    `Format:    ${BACKUP_FORMAT} v${BACKUP_FORMAT_VERSION}`,
    "",
    "WHAT THIS IS",
    rule("-"),
    "  A complete, self-contained copy of one aircraft's records in MyTailLog:",
    "  every transcribed maintenance entry, every tracked inspection and AD, and",
    "  the ORIGINAL scanned images the transcriptions came from. Nothing is",
    "  summarised away — data.json carries the full column set, verbatim.",
    "",
    "  This archive is an index of the physical logbooks. It is NOT the legal",
    "  maintenance record: the paper logbooks remain the system of record under",
    "  14 CFR 91.417, and every transcribed value is OCR-derived.",
    "",
    "YOU ARE NOT LOCKED IN",
    rule("-"),
    "  * Everything here is plain JSON plus ordinary JPEG/PNG/PDF files. Any",
    "    text editor or image viewer opens it — no MyTailLog required, ever.",
    "  * MyTailLog is open source under the MIT licence and can be self-hosted;",
    "    the source is at https://github.com/iiamit/MyTailLog",
    "  * This archive re-imports. Export and restore are a round trip, not a",
    "    one-way dump: see below.",
    "",
    "HOW TO RESTORE IT",
    rule("-"),
    "  In MyTailLog: Hangar → Enroll aircraft → Restore from backup, and pick",
    "  this .zip. A restore always creates a NEW aircraft with fresh ids — it",
    "  never overwrites or merges into an existing one, so it is safe to try.",
    "",
    "FILES IN THIS ARCHIVE",
    rule("-"),
    "  README.txt                 This file.",
    "  manifest.json              Format id, format version, export timestamp,",
    "                             tail number, and per-record-set row counts.",
    "                             The importer reads this first and refuses an",
    "                             archive from a newer format version.",
    "  data.json                  Every record, as one JSON object keyed by the",
    "                             record sets documented below.",
    "  scans/<pageId>.<ext>       Original scanned logbook page images. The file",
    "                             name is the page's `id` in data.json → pages.",
    "  docs/<documentId>.<ext>    Records Vault files. The file name is the",
    "                             document's `id` in data.json → documents.",
    "",
    "  Thumbnails are not stored — they are regenerated on import.",
    "",
    "DATA.JSON — RECORD SETS AND COLUMNS",
    rule("-"),
    "  Column names below are the ones actually present in THIS archive, read",
    "  from the exported rows. Dates are ISO-8601; ids are UUIDs; hour readings",
    "  are decimal hours. Foreign keys (aircraft_id, logbook_id, page_id, …)",
    "  reference the `id` of the matching row in the named record set.",
    "",
  ];

  for (const [key, rows] of sets) lines.push(...columnBlock(key, rows, WHAT[key]), "");

  lines.push(
    "COUNTS AS EXPORTED",
    rule("-"),
    ...Object.entries(manifest.counts).map(([k, v]) => `  ${k.padEnd(20)} ${v}`),
    "",
    `Generated by ${manifest.app}.`,
    "",
  );

  // CRLF so the file opens correctly in Windows Notepad, which is exactly where
  // a "what is this archive" file gets opened years later.
  return lines.join("\r\n");
}

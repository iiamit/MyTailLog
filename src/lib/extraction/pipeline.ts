// ===========================================================================
// Extraction pipeline — orchestrates one page end to end:
//   download image from storage → extract via Claude → write log_entry rows
//   → update the page's pipeline state.
//
// Runs under the caller's Supabase session, so row-level security applies:
// nothing here can touch an aircraft the signed-in user doesn't own. Extracted
// entries land with owner_confirmed = false and per-field confidence — the
// review UI (step 5) confirms them before they ever drive a reminder.
// ===========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { extractFromImage } from "./extract";
import {
  CONFIDENCE_THRESHOLD,
  EXTRACTION_SCHEMA_VERSION,
  type ExtractedEntry,
} from "./schema";
import { EXTRACTION_MODEL } from "./anthropic";
import { proposeEquipmentForEntries } from "./equipmentProposals";
import type { EquipmentEntryInput } from "./equipment";
import { applyMaintenanceFromEntries } from "./maintenanceUpdates";
import type { MaintenanceEntryInput } from "./maintenance";
import { entryText } from "./entryText";
import { classifyOtherDocument, applyScannedDocument } from "./otherDocument";

const BUCKET = process.env.LOGBOOK_STORAGE_BUCKET || "logbook-pages";

// Data fields that carry a per-field confidence in the review UI.
const ENTRY_FIELDS = [
  "entry_date", "hobbs", "tach", "description", "work_performed",
  "parts", "signature_name", "mechanic_cert_number", "ad_refs", "sb_refs",
] as const;

export type PageForExtraction = {
  id: string;
  aircraft_id: string;
  logbook_id: string;
  storage_path: string;
};

export type PipelineResult = {
  entryCount: number;
  detectedPageCount: number;
  minConfidence: number | null;
  equipmentProposed: number;
  // Set only for pages in the 'other' logbook (classified A&P documents).
  docType?: "weight_balance" | "ad_report" | "other";
  wbApplied?: boolean;
  adsCorrelated?: number;
  adsCreated?: number;
};

/**
 * Build the field_confidence map the review UI reads: fields the model flagged
 * get a below-threshold score; everything else inherits the entry's overall
 * confidence. This is what lets the UI highlight exactly the fields to check.
 */
function fieldConfidence(entry: ExtractedEntry): Record<string, number> {
  const flagged = new Set(entry.low_confidence_fields ?? []);
  const map: Record<string, number> = {};
  for (const field of ENTRY_FIELDS) {
    map[field] = flagged.has(field)
      ? Math.min(entry.confidence, CONFIDENCE_THRESHOLD - 0.01)
      : entry.confidence;
  }
  return map;
}

export async function extractPage(
  supabase: SupabaseClient<Database>,
  page: PageForExtraction,
): Promise<PipelineResult> {
  await supabase
    .from("page")
    .update({ extraction_status: "processing", extraction_error: null })
    .eq("id", page.id);

  try {
    const { data: blob, error: dlError } = await supabase.storage
      .from(BUCKET)
      .download(page.storage_path);
    if (dlError || !blob) {
      throw new Error(`Couldn't download page image: ${dlError?.message ?? "not found"}`);
    }

    const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");

    // Pages captured into the 'other' logbook are A&P documents (W&B sheets /
    // AD compliance reports), not running log pages — classify + apply instead
    // of extracting log entries. Best-effort: on failure the outer catch marks
    // the page failed, exactly like the normal path.
    const { data: logbook } = await supabase
      .from("logbook")
      .select("type")
      .eq("id", page.logbook_id)
      .single();
    if (logbook?.type === "other") {
      return await extractOtherDocument(supabase, page, base64);
    }

    const result = await extractFromImage(base64, "image/jpeg");

    // Re-extraction is idempotent for machine output: clear prior UNCONFIRMED
    // entries for this page, but never discard entries a person has confirmed.
    await supabase
      .from("log_entry")
      .delete()
      .eq("page_id", page.id)
      .eq("owner_confirmed", false);

    if (result.entries.length > 0) {
      const rows = result.entries.map((e, i) => ({
        page_id: page.id,
        logbook_id: page.logbook_id,
        aircraft_id: page.aircraft_id,
        entry_index: i,
        continues_next: e.continues_next ?? false,
        is_continuation: e.is_continuation ?? false,
        entry_date: e.entry_date,
        hobbs: e.hobbs,
        tach: e.tach,
        description: e.description,
        work_performed: e.work_performed,
        parts: e.parts,
        signature_name: e.signature_name,
        mechanic_cert_number: e.mechanic_cert_number,
        ad_refs: Array.isArray(e.ad_refs) ? e.ad_refs : [],
        sb_refs: Array.isArray(e.sb_refs) ? e.sb_refs : [],
        confidence: e.confidence,
        field_confidence: fieldConfidence(e),
        extraction_schema_version: EXTRACTION_SCHEMA_VERSION,
        extraction_model: EXTRACTION_MODEL,
        owner_confirmed: false,
      }));
      const { error: insertError } = await supabase.from("log_entry").insert(rows);
      if (insertError) throw new Error(`Failed to save entries: ${insertError.message}`);
    }

    const confidences = result.entries.map((e) => e.confidence).filter(Number.isFinite);
    const minConfidence = confidences.length ? Math.min(...confidences) : null;

    await supabase
      .from("page")
      .update({
        ocr_text: result.raw_text || null,
        extraction_confidence: minConfidence,
        detected_page_count: result.detected_page_count,
        extraction_status: "extracted",
        extraction_error: null,
        extracted_at: new Date().toISOString(),
      })
      .eq("id", page.id);

    // Keep the equipment list current: propose installed/removed components from
    // this page's entries. Best-effort — never fail the extraction over it.
    let equipmentProposed = 0;
    try {
      const equipEntries: EquipmentEntryInput[] = result.entries
        .map((e) => ({
          entry_id: page.id,
          date: e.entry_date,
          logbook: "logbook",
          text: entryText(e),
        }))
        .filter((e) => e.text.length > 0);
      equipmentProposed = await proposeEquipmentForEntries(
        supabase,
        page.aircraft_id,
        equipEntries,
        page.id,
      );
    } catch {
      // ignore — equipment proposals are a convenience, not part of extraction
    }

    // Keep the maintenance forecast current: advance last-done from this page's
    // completions (annual, transponder, ELT, oil, …). Best-effort.
    try {
      const mxEntries: MaintenanceEntryInput[] = result.entries
        .map((e) => ({
          entry_id: page.id,
          date: e.entry_date,
          text: entryText(e),
        }))
        .filter((e) => e.text.length > 0);
      await applyMaintenanceFromEntries(supabase, page.aircraft_id, mxEntries);
    } catch {
      // ignore — forecast updates are a convenience, not part of extraction
    }

    return {
      entryCount: result.entries.length,
      detectedPageCount: result.detected_page_count,
      minConfidence,
      equipmentProposed,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed.";
    await supabase
      .from("page")
      .update({ extraction_status: "failed", extraction_error: message })
      .eq("id", page.id);
    throw err;
  }
}

/**
 * Handle a page in the 'other' logbook: classify the printed A&P document and
 * apply it (W&B revision / AD corroboration). No log_entry rows are produced;
 * the classification + what it updated live on scanned_document, and the page's
 * transcription lands in ocr_text so full-text search still sees it. Runs inside
 * extractPage's try, so any throw here marks the page failed like a normal page.
 */
async function extractOtherDocument(
  supabase: SupabaseClient<Database>,
  page: PageForExtraction,
  base64: string,
): Promise<PipelineResult> {
  const payload = await classifyOtherDocument(base64, "image/jpeg");
  const applied = await applyScannedDocument(
    supabase,
    { id: page.id, aircraft_id: page.aircraft_id },
    payload,
  );

  await supabase
    .from("page")
    .update({
      ocr_text: payload.raw_text || null,
      extraction_confidence: payload.confidence,
      detected_page_count: 1,
      extraction_status: "extracted",
      extraction_error: null,
      extracted_at: new Date().toISOString(),
    })
    .eq("id", page.id);

  return {
    entryCount: 0,
    detectedPageCount: 1,
    minConfidence: payload.confidence,
    equipmentProposed: 0,
    docType: applied.docType,
    wbApplied: applied.wbApplied,
    adsCorrelated: applied.adsCorrelated,
    adsCreated: applied.adsCreated,
  };
}

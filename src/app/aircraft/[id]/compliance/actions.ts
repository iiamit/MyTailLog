"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AdKind, AdStatus, AdReference } from "@/lib/database.types";
import { computeNextDue } from "@/lib/compliance";
import type { FaaAd } from "@/lib/faa/federalRegister";
import { getADFromDRS } from "@/lib/faa/drs";

export type AdInput = {
  id?: string;
  kind: AdKind;
  reference: string;
  title: string | null;
  applicability: string | null;
  recurring: boolean;
  interval_hours: number | null;
  interval_months: number | null;
  status: AdStatus;
  method: string | null;
  complied_date: string | null;
  complied_hours: number | null;
  notes: string | null;
  // Why and when the current status took effect — used to explain an AD that
  // "does not apply" (e.g. equipment removed on a date) or was superseded.
  reason: string | null;
  status_changed_on: string | null;
  // The installed component this AD concerns, if any (removing it retires the AD).
  component_id: string | null;
};

type Result = { ok: true } | { error: string };

function compliancePath(aircraftId: string) {
  return `/aircraft/${aircraftId}/compliance`;
}

/** Add or update an AD/SB record. Next-due is derived from the interval and
 *  last compliance so the forecasting view can sort by it. */
export async function upsertAdRecord(
  aircraftId: string,
  input: AdInput,
): Promise<Result> {
  if (!input.reference.trim()) return { error: "AD/SB number is required." };
  const supabase = await createClient();
  const due = computeNextDue(input);
  const row = {
    aircraft_id: aircraftId,
    kind: input.kind,
    reference: input.reference.trim(),
    title: input.title,
    applicability: input.applicability,
    recurring: input.recurring,
    interval_hours: input.interval_hours,
    interval_months: input.interval_months,
    status: input.status,
    method: input.method,
    complied_date: input.complied_date,
    complied_hours: input.complied_hours,
    next_due_date: due.next_due_date,
    next_due_hours: due.next_due_hours,
    notes: input.notes,
    reason: input.reason,
    status_changed_on: input.status_changed_on,
    component_id: input.component_id,
  };
  const { error } = input.id
    ? await supabase.from("ad_compliance").update(row).eq("id", input.id)
    : await supabase.from("ad_compliance").insert(row);
  if (error) return { error: error.message };
  revalidatePath(compliancePath(aircraftId));
  revalidatePath(`/aircraft/${aircraftId}`);
  return { ok: true };
}

export async function deleteAdRecord(
  aircraftId: string,
  id: string,
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("ad_compliance").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(compliancePath(aircraftId));
  return { ok: true };
}

// AD enrichment. The Federal Register lookup runs in the BROWSER (ComplianceClient)
// — GPO's origin 403s our datacenter egress IP, and the FR API is CORS-enabled —
// then hands the result to saveAdReference. The DRS legacy fallback stays
// server-side (drs.faa.gov doesn't block our egress). Both share the upsert+link.

type AdRecordRef = { reference: string } | { error: string };
type EnrichResult = { ok: true; found: boolean } | { error: string };

/** Confirm the compliance record is an AD owned by this aircraft. */
async function loadAdRecord(
  supabase: Awaited<ReturnType<typeof createClient>>,
  aircraftId: string,
  complianceId: string,
): Promise<AdRecordRef> {
  const { data: rec } = await supabase
    .from("ad_compliance")
    .select("id, aircraft_id, kind, reference")
    .eq("id", complianceId)
    .single();
  if (!rec || rec.aircraft_id !== aircraftId) return { error: "Record not found." };
  if (rec.kind !== "ad") {
    return { error: "Federal Register lookup is for ADs; SBs come from the manufacturer." };
  }
  return { reference: rec.reference };
}

/** Upsert the resolved reference and link it to the compliance record. */
async function applyReference(
  supabase: Awaited<ReturnType<typeof createClient>>,
  aircraftId: string,
  complianceId: string,
  row: Partial<AdReference>,
): Promise<{ ok: true; found: true } | { error: string }> {
  const { data: ref, error: refError } = await supabase
    .from("ad_reference")
    .upsert(row, { onConflict: "ad_number" })
    .select("id")
    .single();
  if (refError || !ref) return { error: refError?.message ?? "Couldn't save the AD reference." };

  const { error: linkError } = await supabase
    .from("ad_compliance")
    .update({ ad_reference_id: ref.id })
    .eq("id", complianceId);
  if (linkError) return { error: linkError.message };

  revalidatePath(compliancePath(aircraftId));
  return { ok: true, found: true };
}

/**
 * Save a Federal Register AD (looked up in the browser) as the official
 * reference for a compliance record: title, FR page, signed PDF, effective date.
 */
export async function saveAdReference(
  aircraftId: string,
  complianceId: string,
  frAd: FaaAd,
): Promise<{ ok: true; found: true } | { error: string }> {
  const supabase = await createClient();
  const rec = await loadAdRecord(supabase, aircraftId, complianceId);
  if ("error" in rec) return rec;
  return applyReference(supabase, aircraftId, complianceId, {
    ad_number: frAd.adNumber ?? rec.reference,
    source: "federal_register",
    fr_document_number: frAd.documentNumber,
    title: frAd.title,
    abstract: frAd.abstract,
    effective_date: frAd.effectiveOn,
    fr_html_url: frAd.htmlUrl,
    pdf_url: frAd.pdfUrl,
    full_text_url: frAd.fullTextUrl,
    citation: frAd.citation,
    rin: frAd.rin,
    fetched_at: new Date().toISOString(),
  });
}

/**
 * Legacy fallback when the Federal Register has no match (pre-1994 ADs): the FAA
 * Dynamic Regulatory System, best-effort. Runs server-side.
 */
export async function enrichViaDRS(
  aircraftId: string,
  complianceId: string,
): Promise<EnrichResult> {
  const supabase = await createClient();
  const rec = await loadAdRecord(supabase, aircraftId, complianceId);
  if ("error" in rec) return rec;

  const drsAd = await getADFromDRS(rec.reference);
  if (!drsAd) {
    revalidatePath(compliancePath(aircraftId));
    return { ok: true, found: false };
  }
  const res = await applyReference(supabase, aircraftId, complianceId, {
    ad_number: drsAd.adNumber || rec.reference,
    source: "drs",
    title: drsAd.title,
    drs_url: drsAd.viewUrl,
    drs_doc_id: drsAd.docUniqueId,
    document_status: drsAd.status,
    fetched_at: new Date().toISOString(),
  });
  return "error" in res ? res : { ok: true, found: true };
}

/** Start tracking an AD/SB number found in the logs — creates an open record. */
export async function trackRef(
  aircraftId: string,
  kind: AdKind,
  reference: string,
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("ad_compliance").insert({
    aircraft_id: aircraftId,
    kind,
    reference: reference.trim(),
    status: "open",
  });
  if (error) return { error: error.message };
  revalidatePath(compliancePath(aircraftId));
  return { ok: true };
}

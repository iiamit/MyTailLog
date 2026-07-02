"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AdKind, AdStatus, AdReference } from "@/lib/database.types";
import { computeNextDue } from "@/lib/compliance";
import { getADByNumber } from "@/lib/faa/federalRegister";
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

/**
 * Look up an AD in the Federal Register and attach the official reference
 * (title, FR page, signed PDF, effective date) to the compliance record.
 * Only ADs are in the FR — Service Bulletins are issued by manufacturers.
 */
export async function enrichAdRecord(
  aircraftId: string,
  complianceId: string,
): Promise<{ ok: true; found: boolean } | { error: string }> {
  const supabase = await createClient();
  const { data: rec } = await supabase
    .from("ad_compliance")
    .select("id, aircraft_id, kind, reference")
    .eq("id", complianceId)
    .single();
  if (!rec || rec.aircraft_id !== aircraftId) return { error: "Record not found." };
  if (rec.kind !== "ad") {
    return { error: "Federal Register lookup is for ADs; SBs come from the manufacturer." };
  }

  // 1) Federal Register — the official source, but only back to 1994.
  let frAd;
  try {
    frAd = await getADByNumber(rec.reference);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Lookup failed." };
  }

  let row: Partial<AdReference>;
  if (frAd) {
    row = {
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
    };
  } else {
    // 2) Legacy fallback: the FAA Dynamic Regulatory System (best-effort).
    const drsAd = await getADFromDRS(rec.reference);
    if (!drsAd) {
      revalidatePath(compliancePath(aircraftId));
      return { ok: true, found: false };
    }
    row = {
      ad_number: drsAd.adNumber || rec.reference,
      source: "drs",
      title: drsAd.title,
      drs_url: drsAd.viewUrl,
      drs_doc_id: drsAd.docUniqueId,
      document_status: drsAd.status,
      fetched_at: new Date().toISOString(),
    };
  }

  const { data: ref, error: refError } = await supabase
    .from("ad_reference")
    .upsert(row, { onConflict: "ad_number" })
    .select("id")
    .single();
  if (refError || !ref) {
    return { error: refError?.message ?? "Couldn't save the AD reference." };
  }

  const { error: linkError } = await supabase
    .from("ad_compliance")
    .update({ ad_reference_id: ref.id })
    .eq("id", complianceId);
  if (linkError) return { error: linkError.message };

  revalidatePath(compliancePath(aircraftId));
  return { ok: true, found: true };
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

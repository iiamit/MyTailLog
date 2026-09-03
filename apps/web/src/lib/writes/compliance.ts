import type { AdCompliance, AdKind, AdReference, AdStatus } from "@/lib/database.types";
import { computeNextDue } from "@/lib/compliance";
import type { FaaAd } from "@/lib/faa/federalRegister";
import { getADFromDRS } from "@/lib/faa/drs";
import { entryIsOnAircraft, FOREIGN_ENTRY, canEdit, isStale, type Db, type WriteCtx, type WriteResult } from "./entries";
import { isIsoDate, validNumber } from "./meters";

// The ONE implementation of every AD/SB compliance write (CONTRACT §3 C2, §4).
// See entries.ts for the rules. Pure helpers are tested in
// apps/web/test/writes-c2.test.ts.

const NO_EDIT = "You don't have edit access to this aircraft.";
const KINDS: AdKind[] = ["ad", "sb"];
const STATUSES: AdStatus[] = ["open", "complied", "previously_complied", "not_applicable", "superseded"];

/** The editable fields of a compliance record (the web form's shape, minus id). */
export type AdComplianceFields = {
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
  // The logbook entry that records the compliance, if the owner linked one.
  // Optional: absent means "leave whatever is there" — the web form does not
  // offer the link, so a web edit must not clear one the phone made.
  reference_entry_id?: string | null;
};

/** How the owner wants a found AD tracked: one-time, or recurring on hours, calendar, or both. */
export type TrackInput = {
  id?: string;
  kind?: AdKind;
  reference: string;
  title?: string | null;
  applicability?: string | null;
  recurring?: boolean;
  intervalHours?: number | null;
  intervalMonths?: number | null;
  nextDueDate?: string | null;
  nextDueHours?: number | null;
};

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const str = (v: unknown, max = 5000): string | null => (typeof v === "string" && v.trim() ? v.slice(0, max) : null);

/** Validate an untrusted record payload at the trust boundary. */
export function pickAdFields(input: unknown): { fields: AdComplianceFields } | { error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Record fields are missing." };
  const src = input as Record<string, unknown>;
  const reference = typeof src.reference === "string" ? src.reference.trim() : "";
  if (!reference) return { error: "AD/SB number is required." };
  if (!KINDS.includes(src.kind as AdKind)) return { error: "Pick AD or SB." };
  if (!STATUSES.includes(src.status as AdStatus)) return { error: "Pick a status." };
  if (![src.interval_hours, src.interval_months, src.complied_hours].every(validNumber)) {
    return { error: "Intervals and hours must be zero or a positive number." };
  }
  for (const k of ["complied_date", "status_changed_on"]) {
    if (src[k] != null && !isIsoDate(src[k])) return { error: `${k.replace(/_/g, " ")} must be a date.` };
  }
  return {
    fields: {
      kind: src.kind as AdKind,
      reference,
      title: str(src.title, 500),
      applicability: str(src.applicability),
      recurring: src.recurring === true,
      interval_hours: (src.interval_hours as number | null | undefined) ?? null,
      interval_months: (src.interval_months as number | null | undefined) ?? null,
      status: src.status as AdStatus,
      method: str(src.method),
      complied_date: (src.complied_date as string | null | undefined) ?? null,
      complied_hours: (src.complied_hours as number | null | undefined) ?? null,
      notes: str(src.notes),
      reason: str(src.reason),
      status_changed_on: (src.status_changed_on as string | null | undefined) ?? null,
      component_id: typeof src.component_id === "string" && src.component_id ? src.component_id : null,
      ...("reference_entry_id" in src
        ? { reference_entry_id: typeof src.reference_entry_id === "string" && src.reference_entry_id ? src.reference_entry_id : null }
        : {}),
    },
  };
}

/** A non-negative, finite number within a sane bound — or null. */
function bounded(v: unknown, max: number, whole = false): number | null | "bad" {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max) return "bad";
  if (whole && !Number.isInteger(n)) return "bad";
  return n;
}

/**
 * The open record that tracking an AD/SB creates. `ad_compliance` already
 * carries both interval axes plus the stored next-due pair the forecast sorts
 * by, so a found AD can be one-time or recurring exactly like one entered by hand.
 */
export function trackPlan(input: TrackInput): { row: Partial<AdCompliance> } | { error: string } {
  const reference = (input.reference ?? "").trim();
  if (!reference) return { error: "AD number required." };
  const kind = input.kind ?? "ad";
  if (!KINDS.includes(kind)) return { error: "Pick AD or SB." };
  const recurring = input.recurring === true;
  const intervalHours = recurring ? bounded(input.intervalHours, 100_000) : null;
  const intervalMonths = recurring ? bounded(input.intervalMonths, 1200, true) : null;
  const nextDueHours = bounded(input.nextDueHours, 1_000_000);
  if (intervalHours === "bad" || intervalMonths === "bad" || nextDueHours === "bad") {
    return { error: "Intervals and hours must be positive numbers (months whole)." };
  }
  if (recurring && intervalHours == null && intervalMonths == null) {
    return { error: "A recurring AD needs an interval — hours, months, or both." };
  }
  const nextDueDate = input.nextDueDate?.trim() || null;
  if (nextDueDate && !isIsoDate(nextDueDate)) return { error: "Next-due date must be a valid date." };
  return {
    row: {
      ...(input.id ? { id: input.id } : {}),
      kind,
      reference,
      title: str(input.title, 500),
      applicability: str(input.applicability),
      recurring,
      interval_hours: intervalHours,
      interval_months: intervalMonths,
      next_due_date: nextDueDate,
      next_due_hours: nextDueHours,
      status: "open",
    },
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

async function loadRecord(
  supabase: Db,
  ctx: WriteCtx,
  recordId: string,
): Promise<{ row: AdCompliance } | WriteResult> {
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  const { data: row, error } = await supabase
    .from("ad_compliance")
    .select("*")
    .eq("id", recordId)
    .eq("aircraft_id", ctx.aircraftId)
    .maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!row) return { status: "error", message: "Record not found.", httpStatus: 404 };
  return { row };
}

/** Add (no id) or edit (id + base) a record. Next-due is derived from the
 *  interval and last compliance so the forecasting view can sort by it. */
export async function upsert(
  supabase: Db,
  ctx: WriteCtx,
  input: { id?: string; record: unknown },
  base?: string,
): Promise<WriteResult> {
  const picked = pickAdFields(input.record);
  if ("error" in picked) return { status: "error", message: picked.error, httpStatus: 400 };
  const row = { aircraft_id: ctx.aircraftId, ...picked.fields, ...computeNextDue(picked.fields) };
  // ad_compliance.reference_entry_id is not aircraft-scoped by the FK or by RLS.
  const entryId = picked.fields.reference_entry_id;
  if (entryId && !(await entryIsOnAircraft(supabase, ctx.aircraftId, entryId))) {
    return { status: "error", message: FOREIGN_ENTRY, httpStatus: 400 };
  }

  if (input.id) {
    const loaded = await loadRecord(supabase, ctx, input.id);
    if ("status" in loaded) return loaded;
    if (isStale(loaded.row.updated_at, base)) return { status: "conflict", row: loaded.row };
    const { data, error } = await supabase
      .from("ad_compliance")
      .update(row)
      .eq("id", input.id)
      .eq("aircraft_id", ctx.aircraftId)
      .select("*")
      .maybeSingle();
    if (error) return { status: "error", message: error.message };
    if (!data) return { status: "error", message: "Record not found.", httpStatus: 404 };
    return { status: "ok", row: data };
  }

  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  const { data, error } = await supabase.from("ad_compliance").insert(row).select("*").maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  return { status: "ok", row: data };
}

/** Delete a record. Nothing references ad_compliance(id); its own links to
 *  ad_reference / component / log_entry go with it. */
export async function remove(
  supabase: Db,
  ctx: WriteCtx,
  input: { recordId: string },
  base?: string,
): Promise<WriteResult> {
  const loaded = await loadRecord(supabase, ctx, input.recordId);
  if ("status" in loaded) return loaded;
  if (isStale(loaded.row.updated_at, base)) return { status: "conflict", row: loaded.row };
  const { data, error } = await supabase
    .from("ad_compliance")
    .delete()
    .eq("id", input.recordId)
    .eq("aircraft_id", ctx.aircraftId)
    .select("id");
  if (error) return { status: "error", message: error.message };
  if (!data?.length) return { status: "error", message: "Record not found.", httpStatus: 404 };
  return { status: "ok", row: null };
}

/** Start tracking an AD/SB number — found in the logs or by the explorer —
 *  as an open record ({@link trackPlan}). `id` is the phone's idempotency key. */
export async function track(supabase: Db, ctx: WriteCtx, input: TrackInput): Promise<WriteResult> {
  const plan = trackPlan(input);
  if ("error" in plan) return { status: "error", message: plan.error, httpStatus: 400 };
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  const { data, error } = await supabase
    .from("ad_compliance")
    .upsert({ aircraft_id: ctx.aircraftId, ...plan.row }, { onConflict: "id", ignoreDuplicates: true })
    .select("*")
    .maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (data) return { status: "ok", row: data };
  const { data: existing } = await supabase
    .from("ad_compliance")
    .select("*")
    .eq("id", input.id ?? "")
    .eq("aircraft_id", ctx.aircraftId)
    .maybeSingle();
  return existing ? { status: "ok", row: existing } : { status: "error", message: "Couldn't track that AD." };
}

// ---------------------------------------------------------------------------
// AD enrichment. The Federal Register lookup runs in the BROWSER — GPO's origin
// 403s our datacenter egress IP, and the FR API is CORS-enabled — then hands the
// result to saveAdReference. The DRS legacy fallback stays server-side
// (drs.faa.gov doesn't block our egress). Both share the upsert+link.
// ---------------------------------------------------------------------------

/** Confirm the compliance record is an AD owned by this aircraft. */
async function loadAd(
  supabase: Db,
  ctx: WriteCtx,
  complianceId: string,
): Promise<{ reference: string } | WriteResult> {
  const loaded = await loadRecord(supabase, ctx, complianceId);
  if ("status" in loaded) return loaded;
  if (loaded.row.kind !== "ad") {
    return { status: "error", message: "Federal Register lookup is for ADs; SBs come from the manufacturer.", httpStatus: 400 };
  }
  return { reference: loaded.row.reference };
}

/** Upsert the resolved reference and link it to the compliance record. Returns row `{ found: true }`. */
async function applyReference(
  supabase: Db,
  ctx: WriteCtx,
  complianceId: string,
  row: Partial<AdReference>,
): Promise<WriteResult> {
  const { data: ref, error: refError } = await supabase
    .from("ad_reference")
    .upsert(row, { onConflict: "ad_number" })
    .select("id")
    .maybeSingle();
  if (refError || !ref) return { status: "error", message: refError?.message ?? "Couldn't save the AD reference." };

  const { data: linked, error: linkError } = await supabase
    .from("ad_compliance")
    .update({ ad_reference_id: ref.id })
    .eq("id", complianceId)
    .eq("aircraft_id", ctx.aircraftId)
    .select("id");
  if (linkError) return { status: "error", message: linkError.message };
  if (!linked?.length) return { status: "error", message: "Record not found.", httpStatus: 404 };
  return { status: "ok", row: { found: true } };
}

/**
 * Save a Federal Register AD (looked up in the browser) as the official
 * reference for a compliance record: title, FR page, signed PDF, effective date.
 */
export async function saveAdReference(
  supabase: Db,
  ctx: WriteCtx,
  input: { complianceId: string; ad: FaaAd },
): Promise<WriteResult> {
  const rec = await loadAd(supabase, ctx, input.complianceId);
  if ("status" in rec) return rec;
  const ad = input.ad;
  return applyReference(supabase, ctx, input.complianceId, {
    ad_number: ad.adNumber ?? rec.reference,
    source: "federal_register",
    fr_document_number: ad.documentNumber,
    title: ad.title,
    abstract: ad.abstract,
    effective_date: ad.effectiveOn,
    fr_html_url: ad.htmlUrl,
    pdf_url: ad.pdfUrl,
    full_text_url: ad.fullTextUrl,
    citation: ad.citation,
    rin: ad.rin,
    fetched_at: new Date().toISOString(),
  });
}

/**
 * Legacy fallback when the Federal Register has no match (pre-1994 ADs): the FAA
 * Dynamic Regulatory System, best-effort. Runs server-side (needs the network).
 * Returns row `{ found }`.
 */
export async function enrichViaDRS(
  supabase: Db,
  ctx: WriteCtx,
  input: { complianceId: string },
): Promise<WriteResult> {
  const rec = await loadAd(supabase, ctx, input.complianceId);
  if ("status" in rec) return rec;
  const drsAd = await getADFromDRS(rec.reference);
  if (!drsAd) return { status: "ok", row: { found: false } };
  return applyReference(supabase, ctx, input.complianceId, {
    ad_number: drsAd.adNumber || rec.reference,
    source: "drs",
    title: drsAd.title,
    drs_url: drsAd.viewUrl,
    drs_doc_id: drsAd.docUniqueId,
    document_status: drsAd.status,
    fetched_at: new Date().toISOString(),
  });
}

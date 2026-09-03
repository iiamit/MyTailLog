import type { Squawk, SquawkSeverity } from "@/lib/database.types";
import { entryIsOnAircraft, FOREIGN_ENTRY, canEdit, isStale, type Db, type WriteCtx, type WriteResult } from "./entries";

// The ONE implementation of every squawk write (CONTRACT §3 C3, §4). See
// entries.ts for the rules. Anyone with access may REPORT (RLS squawk_report);
// resolving, editing, reopening and deleting are editor-only.

const NO_EDIT = "You don't have edit access to this aircraft.";
const SEVERITIES: SquawkSeverity[] = ["low", "medium", "high"];

// ---------------------------------------------------------------------------
// Pure helpers — tested in apps/web/test/writes-c3.test.ts
// ---------------------------------------------------------------------------

/** Anything unrecognised becomes `low` rather than being rejected: the squawk
 *  itself is the thing worth keeping, and a client sending something else must
 *  not lose the report. */
export function normalizeSeverity(v: unknown): SquawkSeverity {
  return SEVERITIES.includes(v as SquawkSeverity) ? (v as SquawkSeverity) : "low";
}

/** Validate an untrusted `{description?, severity?}` patch. Only the two
 *  owner-editable columns pass; a blank description is refused. */
export function pickSquawkFields(input: unknown): { fields: Partial<Pick<Squawk, "description" | "severity">> } | { error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Squawk fields are missing." };
  const src = input as Record<string, unknown>;
  const out: Partial<Pick<Squawk, "description" | "severity">> = {};
  if ("description" in src) {
    const d = typeof src.description === "string" ? src.description.trim() : "";
    if (!d) return { error: "Describe the issue." };
    out.description = d;
  }
  if ("severity" in src) out.severity = normalizeSeverity(src.severity);
  if (!Object.keys(out).length) return { error: "Nothing to change." };
  return { fields: out };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

async function loadSquawk(
  supabase: Db,
  ctx: WriteCtx,
  squawkId: string,
  base: string | undefined,
): Promise<{ row: Squawk } | WriteResult> {
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  const { data: row, error } = await supabase
    .from("squawk")
    .select("*")
    .eq("id", squawkId)
    .eq("aircraft_id", ctx.aircraftId)
    .maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!row) return { status: "error", message: "Squawk not found.", httpStatus: 404 };
  if (isStale(row.updated_at, base)) return { status: "conflict", row };
  return { row };
}

async function patchSquawk(
  supabase: Db,
  ctx: WriteCtx,
  squawkId: string,
  patch: Partial<Squawk>,
): Promise<WriteResult> {
  const { data, error } = await supabase
    .from("squawk")
    .update(patch)
    .eq("id", squawkId)
    .eq("aircraft_id", ctx.aircraftId)
    .select("*")
    .maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "error", message: "Squawk not found.", httpStatus: 404 };
  return { status: "ok", row: data };
}

/** Report a squawk. `id` is the phone's idempotency key (a retry after a lost
 *  response finds the row it already wrote). The reporter's display name is
 *  captured at report time, as the web has always done. */
export async function create(
  supabase: Db,
  ctx: WriteCtx,
  input: { id?: string; description: string; severity?: unknown; reportedAt?: string | null },
): Promise<WriteResult> {
  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (!description) return { status: "error", message: "Describe the issue.", httpStatus: 400 };

  const { data: profile } = await supabase.from("profile").select("full_name, email").eq("id", ctx.userId).maybeSingle();
  const reporterName = profile?.full_name?.trim() || profile?.email || null;

  const { data, error } = await supabase
    .from("squawk")
    .upsert(
      {
        ...(input.id ? { id: input.id } : {}),
        aircraft_id: ctx.aircraftId,
        description,
        severity: normalizeSeverity(input.severity),
        status: "open",
        reported_by: ctx.userId,
        reporter_name: reporterName,
        ...(input.reportedAt ? { reported_at: input.reportedAt } : {}),
      },
      { onConflict: "id", ignoreDuplicates: true },
    )
    .select("*")
    .maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (data) return { status: "ok", row: data };
  const { data: existing } = await supabase
    .from("squawk")
    .select("*")
    .eq("id", input.id ?? "")
    .eq("aircraft_id", ctx.aircraftId)
    .maybeSingle();
  return existing ? { status: "ok", row: existing } : { status: "error", message: "Couldn't report the squawk." };
}

export async function resolve(
  supabase: Db,
  ctx: WriteCtx,
  input: { squawkId: string; resolvedAt?: string | null; resolvedEntryId?: string | null; resolutionNotes?: string | null },
  base?: string,
): Promise<WriteResult> {
  const loaded = await loadSquawk(supabase, ctx, input.squawkId, base);
  if ("status" in loaded) return loaded;
  if (input.resolvedEntryId && !(await entryIsOnAircraft(supabase, ctx.aircraftId, input.resolvedEntryId))) {
    return { status: "error", message: FOREIGN_ENTRY, httpStatus: 400 };
  }
  return patchSquawk(supabase, ctx, input.squawkId, {
    status: "resolved",
    resolved_at: input.resolvedAt || new Date().toISOString(),
    resolved_by: ctx.userId,
    resolved_log_entry_id: input.resolvedEntryId ?? null,
    resolution_notes: input.resolutionNotes?.trim() || null,
  });
}

export async function reopen(
  supabase: Db,
  ctx: WriteCtx,
  input: { squawkId: string },
  base?: string,
): Promise<WriteResult> {
  const loaded = await loadSquawk(supabase, ctx, input.squawkId, base);
  if ("status" in loaded) return loaded;
  return patchSquawk(supabase, ctx, input.squawkId, {
    status: "open",
    resolved_at: null,
    resolved_by: null,
    resolved_log_entry_id: null,
    resolution_notes: null,
  });
}

export async function update(
  supabase: Db,
  ctx: WriteCtx,
  input: { squawkId: string; description?: string; severity?: unknown },
  base?: string,
): Promise<WriteResult> {
  const picked = pickSquawkFields({
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.severity !== undefined ? { severity: input.severity } : {}),
  });
  if ("error" in picked) return { status: "error", message: picked.error, httpStatus: 400 };
  const loaded = await loadSquawk(supabase, ctx, input.squawkId, base);
  if ("status" in loaded) return loaded;
  return patchSquawk(supabase, ctx, input.squawkId, picked.fields);
}

/** Nothing references squawk(id) (checked the migrations), so a delete is final. */
export async function remove(
  supabase: Db,
  ctx: WriteCtx,
  input: { squawkId: string },
  base?: string,
): Promise<WriteResult> {
  const loaded = await loadSquawk(supabase, ctx, input.squawkId, base);
  if ("status" in loaded) return loaded;
  const { data, error } = await supabase
    .from("squawk")
    .delete()
    .eq("id", input.squawkId)
    .eq("aircraft_id", ctx.aircraftId)
    .select("id");
  if (error) return { status: "error", message: error.message };
  if (!data?.length) return { status: "error", message: "Squawk not found.", httpStatus: 404 };
  return { status: "ok", row: null };
}

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
  input: { id?: string; description: string; severity?: unknown; reportedAt?: string | null; photoBlobIds?: string[] },
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
  if (data) {
    // 09 §5.3 `squawk.create` (extended): photos uploaded with the report, one row each (blob id = photo id).
    for (const blobId of Array.isArray(input.photoBlobIds) ? input.photoBlobIds.slice(0, 20) : []) {
      const r = await addPhoto(supabase, ctx, { id: blobId, squawkId: data.id, blobId });
      if (r.status !== "ok") return r;
    }
    return { status: "ok", row: data };
  }
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

/** A delete is final: squawk_photo rows cascade (0076) and their images are removed here. */
export async function remove(
  supabase: Db,
  ctx: WriteCtx,
  input: { squawkId: string },
  base?: string,
): Promise<WriteResult> {
  const loaded = await loadSquawk(supabase, ctx, input.squawkId, base);
  if ("status" in loaded) return loaded;
  const { data: photos } = await supabase.from("squawk_photo").select("storage_path, thumbnail_path")
    .eq("squawk_id", input.squawkId).eq("aircraft_id", ctx.aircraftId);
  const { data, error } = await supabase
    .from("squawk")
    .delete()
    .eq("id", input.squawkId)
    .eq("aircraft_id", ctx.aircraftId)
    .select("id");
  if (error) return { status: "error", message: error.message };
  if (!data?.length) return { status: "error", message: "Squawk not found.", httpStatus: 404 };
  await dropBlobs((photos ?? []).flatMap((p) => [p.storage_path, p.thumbnail_path]));
  return { status: "ok", row: null };
}

// ---------------------------------------------------------------------------
// Photos (09 §2.8, §5.3 `squawkPhoto.create`, `squawkPhoto.delete`)
// ---------------------------------------------------------------------------

const BLOB_ID = /^[0-9A-Za-z-]{8,64}$/;

/** Where a squawk photo lives (09 §6): under the aircraft, so the storage policies cover it. */
export const squawkPhotoPath = (aircraftId: string, squawkId: string, blobId: string) =>
  `${aircraftId}/squawks/${squawkId}/${blobId}.jpg`;

/** Best-effort image cleanup after the row is gone; storage loads lazily so the unit tests never touch it. */
async function dropBlobs(paths: (string | null)[]) {
  const list = paths.filter((p): p is string => !!p);
  if (!list.length) return;
  try {
    const { removeBlobs } = await import("@/lib/storage");
    await removeBlobs(list);
  } catch {
    // An orphaned image is harmless and invisible (the row is what grants access to it).
  }
}

/** The reporter or an editor may add a photo; everyone else (other viewers) is refused (RLS squawk_photo_add). */
export async function addPhoto(
  supabase: Db,
  ctx: WriteCtx,
  input: { id: string; squawkId: string; blobId: string; takenAt?: string | null },
): Promise<WriteResult> {
  if (typeof input.id !== "string" || !BLOB_ID.test(input.id) || typeof input.blobId !== "string" || !BLOB_ID.test(input.blobId))
    return { status: "error", message: "The photo is missing its id.", httpStatus: 400 };
  if (input.takenAt != null && Number.isNaN(Date.parse(input.takenAt))) return { status: "error", message: "The photo's time is unreadable.", httpStatus: 400 };
  const { data: squawk } = await supabase.from("squawk").select("id, reported_by")
    .eq("id", input.squawkId).eq("aircraft_id", ctx.aircraftId).maybeSingle();
  if (!squawk) return { status: "error", message: "Squawk not found.", httpStatus: 404 };
  if (squawk.reported_by !== ctx.userId && !(await canEdit(supabase, ctx.aircraftId)))
    return { status: "error", message: "You can add photos only to squawks you reported.", httpStatus: 403 };
  const { data: existing } = await supabase.from("squawk_photo").select("*").eq("id", input.id).maybeSingle();
  if (existing) return existing.aircraft_id === ctx.aircraftId ? { status: "ok", row: existing } : { status: "error", message: "Photo not found.", httpStatus: 404 };
  const { data, error } = await supabase.from("squawk_photo").insert({
    id: input.id, aircraft_id: ctx.aircraftId, squawk_id: input.squawkId,
    storage_path: squawkPhotoPath(ctx.aircraftId, input.squawkId, input.blobId),
    taken_at: input.takenAt ?? null, created_by: ctx.userId,
  }).select("*").maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  return { status: "ok", row: data };
}

/** The photo's creator or an editor may delete it. */
export async function removePhoto(supabase: Db, ctx: WriteCtx, input: { photoId: string }, base?: string): Promise<WriteResult> {
  const { data: row } = await supabase.from("squawk_photo").select("*").eq("id", input.photoId).eq("aircraft_id", ctx.aircraftId).maybeSingle();
  if (!row) return { status: "error", message: "Photo not found.", httpStatus: 404 };
  if (row.created_by !== ctx.userId && !(await canEdit(supabase, ctx.aircraftId)))
    return { status: "error", message: NO_EDIT, httpStatus: 403 };
  if (isStale(row.updated_at, base)) return { status: "conflict", row };
  const { data, error } = await supabase.from("squawk_photo").delete().eq("id", input.photoId).eq("aircraft_id", ctx.aircraftId).select("id");
  if (error) return { status: "error", message: error.message };
  if (!data?.length) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  await dropBlobs([row.storage_path, row.thumbnail_path]);
  return { status: "ok", row: null };
}

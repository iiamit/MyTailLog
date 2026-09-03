import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, LogEntry, ReferenceLink } from "@/lib/database.types";
import { isEntryClean } from "@/lib/extraction/schema";

// The ONE implementation of every log-entry write (CONTRACT §3 C1, §4). Called
// by the web server actions (cookie client) and by POST /api/sync/push (Bearer
// client). Never throws for an expected failure, never revalidates, does its own
// can_edit_aircraft check and reads every write back (Rule 7).
//
// Only `import type` from tainted modules and pure runtime imports: the unit
// tests load this file under node directly.

export type Db = SupabaseClient<Database>;
export type WriteCtx = { aircraftId: string; userId: string };
export type WriteResult =
  | { status: "ok"; row: Record<string, unknown> | null }
  | { status: "conflict"; row: Record<string, unknown> }
  | { status: "error"; message: string; httpStatus?: number };

// The editable fields of a log entry. Arrays arrive already split from the
// client's comma-separated inputs.
export type EntryFields = {
  entry_date: string | null;
  hobbs: number | null;
  airframe: number | null;
  tach: number | null;
  description: string | null;
  work_performed: string | null;
  parts: string | null;
  signature_name: string | null;
  mechanic_cert_number: string | null;
  ad_refs: string[];
  sb_refs: string[];
  // Optional: only present when the entry's attachment/links editor changes it,
  // so a normal field save via .update({...fields}) leaves existing links intact.
  reference_links?: ReferenceLink[];
};

const NO_EDIT = "You don't have edit access to this aircraft.";

/** Owner-readable text for a non-ok result. The web wrappers pass no `base`, so
 *  a conflict can't reach them; the text exists so the type is handled once. */
export function failMessage(r: Exclude<WriteResult, { status: "ok" }>): string {
  return r.status === "error" ? r.message : "Someone else changed this just now. Reload and try again.";
}

export async function canEdit(supabase: Db, aircraftId: string): Promise<boolean> {
  const { data } = await supabase.rpc("can_edit_aircraft", { target_aircraft: aircraftId });
  return data === true;
}

/** Optimistic concurrency (§2): the row moved on since the caller saw it. */
export function isStale(updatedAt: string, base: string | undefined): boolean {
  return base != null && Date.parse(updatedAt) > Date.parse(base);
}

export const FOREIGN_ENTRY = "That entry isn't on this aircraft.";

/**
 * Is this log_entry on the aircraft being written?
 *
 * RLS proves the caller may edit the ROW, and says nothing about which entry
 * its foreign key points at — none of the five `references log_entry(id)`
 * columns is aircraft-scoped. Without this, an editor of aircraft A who knows a
 * log_entry UUID on aircraft B can persist a row on A that points into B, and
 * entries.mergeContinuation will later re-point it when B's entry is merged.
 * Every write that accepts a client-supplied entry id calls this.
 */
export async function entryIsOnAircraft(supabase: Db, aircraftId: string, entryId: string): Promise<boolean> {
  const { data } = await supabase
    .from("log_entry")
    .select("id")
    .eq("id", entryId)
    .eq("aircraft_id", aircraftId)
    .maybeSingle();
  return !!data;
}

// ---------------------------------------------------------------------------
// Pure helpers — tested in apps/web/test/writes-entries.test.ts
// ---------------------------------------------------------------------------

const TEXT_KEYS = [
  "entry_date",
  "description",
  "work_performed",
  "parts",
  "signature_name",
  "mechanic_cert_number",
] as const;
const NUM_KEYS = ["hobbs", "airframe", "tach"] as const;
const REF_KEYS = ["ad_refs", "sb_refs"] as const;

/**
 * Validate an untrusted `fields` payload at the trust boundary: only the
 * editable columns pass, each with its column type. Unknown keys are dropped so
 * a phone can never set aircraft_id, confidence or owner_confirmed through here.
 */
export function pickEntryFields(input: unknown): { fields: Partial<EntryFields> } | { error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Entry fields are missing." };
  const src = input as Record<string, unknown>;
  const out: Partial<EntryFields> = {};
  for (const k of TEXT_KEYS) {
    if (!(k in src)) continue;
    const v = src[k];
    if (v !== null && typeof v !== "string") return { error: `${label(k)} must be text.` };
    out[k] = v;
  }
  for (const k of NUM_KEYS) {
    if (!(k in src)) continue;
    const v = src[k];
    if (v !== null && !(typeof v === "number" && Number.isFinite(v))) return { error: `${label(k)} must be a number.` };
    out[k] = v;
  }
  for (const k of REF_KEYS) {
    if (!(k in src)) continue;
    const v = src[k];
    if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) return { error: `${label(k)} must be a list.` };
    out[k] = v;
  }
  if ("reference_links" in src) out.reference_links = cleanLinks(src.reference_links);
  return { fields: out };
}

const label = (k: string) => (k === "ad_refs" ? "AD references" : k === "sb_refs" ? "Service bulletins" : k.replace(/_/g, " "));

/**
 * Only http(s) URLs are stored (these render as an <a href>, so a javascript:
 * link would be XSS); labels and count are bounded.
 */
export function cleanLinks(links: unknown): ReferenceLink[] {
  if (!Array.isArray(links)) return [];
  return links
    .map((l) => ({
      label: String(l?.label ?? "").trim().slice(0, 120),
      url: String(l?.url ?? "").trim(),
    }))
    .filter((l) => /^https?:\/\//i.test(l.url))
    .slice(0, 20);
}

export const joinText = (a: string | null, b: string | null): string | null =>
  [a, b].map((x) => x?.trim()).filter(Boolean).join(" ") || null;

export const unionRefs = (a: string[] | null, b: string[] | null): string[] => [
  ...new Set([...(a ?? []), ...(b ?? [])]),
];

type Mergeable = Pick<
  LogEntry,
  | "entry_date" | "hobbs" | "airframe" | "tach" | "description" | "work_performed" | "parts"
  | "signature_name" | "mechanic_cert_number" | "ad_refs" | "sb_refs" | "continues_next" | "is_continuation"
>;

/**
 * The merged head of a page-spanning entry: keep the head's date/meters,
 * concatenate the work text, take the closing signature from the tail, union
 * AD/SB refs. Drops back to unconfirmed so the owner vets the result.
 */
export function mergeEntryFields(head: Mergeable, tail: Mergeable) {
  return {
    entry_date: head.entry_date ?? tail.entry_date,
    hobbs: head.hobbs ?? tail.hobbs,
    airframe: head.airframe ?? tail.airframe,
    tach: head.tach ?? tail.tach,
    description: joinText(head.description, tail.description),
    work_performed: joinText(head.work_performed, tail.work_performed),
    parts: joinText(head.parts, tail.parts),
    signature_name: tail.signature_name ?? head.signature_name,
    mechanic_cert_number: tail.mechanic_cert_number ?? head.mechanic_cert_number,
    ad_refs: unionRefs(head.ad_refs, tail.ad_refs),
    sb_refs: unionRefs(head.sb_refs, tail.sb_refs),
    continues_next: tail.continues_next, // the tail may itself run onward (3+ pages)
    is_continuation: head.is_continuation,
    field_confidence: null,
    owner_confirmed: false,
  };
}

/** Which entry on the previous page is the head of a continuation: the one the
 *  model flagged as continuing; else one still "open" (no signature); else the
 *  last entry on the page. `candidates` are ordered by entry_index descending. */
export function pickHead<T extends { continues_next: boolean; signature_name: string | null }>(
  candidates: T[],
): T | undefined {
  return candidates.find((h) => h.continues_next) ?? candidates.find((h) => !h.signature_name) ?? candidates[0];
}

/** Pages whose every entry is now confirmed (imported entries have no page). */
export function fullyConfirmedPages(rows: { page_id: string | null; owner_confirmed: boolean }[]): string[] {
  const byPage = new Map<string, { total: number; confirmed: number }>();
  for (const e of rows) {
    if (!e.page_id) continue;
    const g = byPage.get(e.page_id) ?? { total: 0, confirmed: 0 };
    g.total += 1;
    if (e.owner_confirmed) g.confirmed += 1;
    byPage.set(e.page_id, g);
  }
  return [...byPage.entries()].filter(([, g]) => g.total > 0 && g.confirmed === g.total).map(([p]) => p);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Load an entry for an update/delete: edit access, ownership, then the base check. */
async function loadEntry(
  supabase: Db,
  ctx: WriteCtx,
  entryId: string,
  base: string | undefined,
): Promise<{ row: LogEntry } | WriteResult> {
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  const { data: row, error } = await supabase
    .from("log_entry")
    .select("*")
    .eq("id", entryId)
    .eq("aircraft_id", ctx.aircraftId)
    .maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!row) return { status: "error", message: "Entry not found.", httpStatus: 404 };
  if (isStale(row.updated_at, base)) return { status: "conflict", row };
  return { row };
}

/** Add an entry the extractor missed. Human-authored, so confirmed and with no
 *  machine confidence/model provenance. `id` is the phone's idempotency key;
 *  a retry after a lost response finds the row it already wrote. */
export async function create(
  supabase: Db,
  ctx: WriteCtx,
  input: { id?: string; logbookId: string; pageId?: string | null; fields: unknown },
): Promise<WriteResult> {
  const picked = pickEntryFields(input.fields);
  if ("error" in picked) return { status: "error", message: picked.error, httpStatus: 400 };
  if (!input.logbookId) return { status: "error", message: "Logbook is missing.", httpStatus: 400 };
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };

  const { data, error } = await supabase
    .from("log_entry")
    .upsert(
      {
        ...(input.id ? { id: input.id } : {}),
        page_id: input.pageId ?? null,
        logbook_id: input.logbookId,
        aircraft_id: ctx.aircraftId,
        ...picked.fields,
        owner_confirmed: true,
        confidence: null,
        field_confidence: null,
        extraction_model: null,
      },
      { onConflict: "id", ignoreDuplicates: true },
    )
    .select("*")
    .maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (data) return { status: "ok", row: data };
  // ignoreDuplicates returned nothing: the id already exists. Ours (a retry) or
  // someone else's (invisible under RLS) — read back to tell which.
  const { data: existing } = await supabase
    .from("log_entry")
    .select("*")
    .eq("id", input.id ?? "")
    .eq("aircraft_id", ctx.aircraftId)
    .maybeSingle();
  return existing ? { status: "ok", row: existing } : { status: "error", message: "Couldn't add the entry." };
}

/** Save edits to an extracted entry. Editing implicitly confirms it — a human
 *  has now vetted the fields, so it's trustworthy enough to drive reminders. */
export async function update(
  supabase: Db,
  ctx: WriteCtx,
  input: { entryId: string; fields: unknown },
  base?: string,
): Promise<WriteResult> {
  const picked = pickEntryFields(input.fields);
  if ("error" in picked) return { status: "error", message: picked.error, httpStatus: 400 };
  const loaded = await loadEntry(supabase, ctx, input.entryId, base);
  if ("status" in loaded) return loaded;
  return patchEntry(supabase, ctx, input.entryId, { ...picked.fields, owner_confirmed: true });
}

export async function setConfirmed(
  supabase: Db,
  ctx: WriteCtx,
  input: { entryId: string; confirmed: boolean },
  base?: string,
): Promise<WriteResult> {
  const loaded = await loadEntry(supabase, ctx, input.entryId, base);
  if ("status" in loaded) return loaded;
  return patchEntry(supabase, ctx, input.entryId, { owner_confirmed: input.confirmed === true });
}

/** Replace an entry's external reference links (see {@link cleanLinks}). */
export async function setLinks(
  supabase: Db,
  ctx: WriteCtx,
  input: { entryId: string; links: unknown },
  base?: string,
): Promise<WriteResult> {
  const loaded = await loadEntry(supabase, ctx, input.entryId, base);
  if ("status" in loaded) return loaded;
  return patchEntry(supabase, ctx, input.entryId, { reference_links: cleanLinks(input.links) });
}

async function patchEntry(
  supabase: Db,
  ctx: WriteCtx,
  entryId: string,
  patch: Database["public"]["Tables"]["log_entry"]["Update"],
): Promise<WriteResult> {
  const { data, error } = await supabase
    .from("log_entry")
    .update(patch)
    .eq("id", entryId)
    .eq("aircraft_id", ctx.aircraftId)
    .select("*")
    .maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "error", message: "Entry not found.", httpStatus: 404 };
  return { status: "ok", row: data };
}

/**
 * Delete one entry. Five tables reference log_entry(id) ON DELETE SET NULL
 * (component install/removal, ad_compliance reference, document attachment,
 * squawk resolution): the owner is removing the entry itself, so those
 * references die with it — unlike a merge, where they move to the head.
 */
export async function remove(
  supabase: Db,
  ctx: WriteCtx,
  input: { entryId: string },
  base?: string,
): Promise<WriteResult> {
  const loaded = await loadEntry(supabase, ctx, input.entryId, base);
  if ("status" in loaded) return loaded;
  const { data, error } = await supabase
    .from("log_entry")
    .delete()
    .eq("id", input.entryId)
    .eq("aircraft_id", ctx.aircraftId)
    .select("id");
  if (error) return { status: "error", message: error.message };
  if (!data?.length) return { status: "error", message: "Entry not found.", httpStatus: 404 };
  return { status: "ok", row: null };
}

/**
 * Consolidate a page-spanning entry. `tailEntryId` is the continuation (the
 * orphaned top-of-page half). We find its "head" — the entry that runs off the
 * bottom of the previous page in the same logbook — merge the two into the head
 * ({@link mergeEntryFields}), re-point everything that referenced the tail at
 * the head (#188), then delete the tail. `base` is the tail's updated_at.
 */
export async function mergeContinuation(
  supabase: Db,
  ctx: WriteCtx,
  input: { tailEntryId: string },
  base?: string,
): Promise<WriteResult> {
  const loaded = await loadEntry(supabase, ctx, input.tailEntryId, base);
  if ("status" in loaded) return loaded;
  const tail = loaded.row;

  const { data: tailPage } = await supabase
    .from("page")
    .select("page_sequence, logbook_id")
    .eq("id", tail.page_id ?? "")
    .maybeSingle();
  if (!tailPage || tailPage.page_sequence == null) {
    return { status: "error", message: "This page has no sequence number, so the previous page can't be found." };
  }

  const { data: prevPages } = await supabase
    .from("page")
    .select("id")
    .eq("logbook_id", tailPage.logbook_id)
    .lt("page_sequence", tailPage.page_sequence)
    .order("page_sequence", { ascending: false })
    .limit(1);
  const prevPage = prevPages?.[0];
  if (!prevPage) return { status: "error", message: "There's no previous page in this logbook to merge into." };

  const { data: candidates } = await supabase
    .from("log_entry")
    .select("*")
    .eq("page_id", prevPage.id)
    .order("entry_index", { ascending: false, nullsFirst: false });
  const head = pickHead(candidates ?? []);
  if (!head) return { status: "error", message: "The previous page has no entry to merge into." };
  if (head.id === tail.id) return { status: "error", message: "Nothing to merge." };

  const merged = await patchEntry(supabase, ctx, head.id, mergeEntryFields(head, tail));
  if (merged.status !== "ok") return merged;

  // Re-point everything that referenced the tail at the head BEFORE deleting it.
  //
  // Five tables reference log_entry(id) ON DELETE SET NULL, so deleting the tail
  // silently severs each one: equipment loses the entry that installed or
  // removed it, an AD compliance record loses the entry documenting it, an
  // attached document detaches, and a resolved squawk loses the entry that
  // cleared it. The merged entry IS the same real-world entry, so anything
  // pointing at the tail should point at the head.
  for (const [table, column] of [
    ["component", "install_entry_id"],
    ["component", "removal_entry_id"],
    ["ad_compliance", "reference_entry_id"],
    ["document", "log_entry_id"],
    ["squawk", "resolved_log_entry_id"],
  ] as const) {
    const { error } = await supabase
      // dynamic table name — the typed union collapses; cast the arg
      .from(table as never)
      .update({ [column]: head.id } as never)
      .eq(column, tail.id);
    // A relink failing is worse than the merge not happening: the tail would be
    // deleted and the reference lost with no way back. Stop before the delete.
    if (error) return { status: "error", message: `Couldn't move ${table} links onto the merged entry: ${error.message}` };
  }

  const { error: deleteError } = await supabase.from("log_entry").delete().eq("id", tail.id);
  if (deleteError) return { status: "error", message: deleteError.message };

  return merged;
}

/**
 * Bulk-confirm every "clean" extracted entry across the whole aircraft in one
 * shot — the strict definition ({@link isEntryClean}): high overall confidence,
 * no flagged field, not a continuation. Anything the model was unsure about is
 * left for hands-on review. Pages whose entries then all read as confirmed flip
 * to `confirmed` (never touching disputed pages).
 * Returns row `{ confirmed, remaining }`.
 */
export async function confirmClean(supabase: Db, ctx: WriteCtx): Promise<WriteResult> {
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };

  const { data: entries, error } = await supabase
    .from("log_entry")
    .select("id, confidence, field_confidence, is_continuation")
    .eq("aircraft_id", ctx.aircraftId)
    .eq("owner_confirmed", false);
  if (error) return { status: "error", message: error.message };

  const rows = entries ?? [];
  const cleanIds = rows.filter(isEntryClean).map((e) => e.id);
  const remaining = rows.length - cleanIds.length;
  if (cleanIds.length === 0) return { status: "ok", row: { confirmed: 0, remaining } };

  const { data: confirmed, error: upErr } = await supabase
    .from("log_entry")
    .update({ owner_confirmed: true })
    .in("id", cleanIds)
    .select("id");
  if (upErr) return { status: "error", message: upErr.message };

  // Flip pages whose entries are now all confirmed. One extra read of (page_id,
  // owner_confirmed) for the whole aircraft; a personal logbook is small enough
  // that this is cheaper than tracking affected pages.
  // ponytail: full re-scan per call; batch by affected pages if libraries get huge.
  const { data: all } = await supabase
    .from("log_entry")
    .select("page_id, owner_confirmed")
    .eq("aircraft_id", ctx.aircraftId);
  const fullPages = fullyConfirmedPages(all ?? []);
  if (fullPages.length > 0) {
    await supabase
      .from("page")
      .update({ review_status: "confirmed" })
      .in("id", fullPages)
      .eq("review_status", "unreviewed");
  }

  return { status: "ok", row: { confirmed: confirmed?.length ?? 0, remaining } };
}

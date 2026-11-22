import { insertRecords } from "./insert";
import { writeRecord } from "./conditional";
import { canEdit, isStale, type Db, type WriteCtx, type WriteResult } from "./entries";
import { detectGaps, reconcileGaps, type StoredGap } from "../gaps";
import type { MapEntryRow } from "../mapModel";

// Gap writes (09 §2.6, §5.3 `gap.setStatus`, `gap.create`; 14-decisions.md D2) and the re-detection that
// runs after confirmed entries change (09 §3.8). Same contract as the other write modules: own
// can_edit_aircraft check, base rule, read back, never throws for an expected failure.

const NO_EDIT = "You don't have edit access to this aircraft.";
const OWNER_STATUSES = ["open", "no_pages_exist", "asked_previous_owner", "dismissed"] as const;
type OwnerStatus = (typeof OWNER_STATUSES)[number];

function cleanNote(note: unknown): { note: string | null } | { error: string } {
  if (note == null || note === "") return { note: null };
  if (typeof note !== "string") return { error: "The note must be text." };
  if (note.length > 1000) return { error: "The note is too long (1,000 characters at most)." };
  return { note };
}

/** `gap.setStatus` (base): the owner explains a gap. `filled` is the system's alone. */
export async function setStatus(
  supabase: Db,
  ctx: WriteCtx,
  input: { gapId: string; status: OwnerStatus; note?: string | null },
  base?: string,
): Promise<WriteResult> {
  if (!OWNER_STATUSES.includes(input.status)) return { status: "error", message: "Unknown gap status.", httpStatus: 400 };
  const note = cleanNote(input.note);
  if ("error" in note) return { status: "error", message: note.error, httpStatus: 400 };
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  const { data: row, error } = await supabase.from("logbook_gap").select("*")
    .eq("id", input.gapId).eq("aircraft_id", ctx.aircraftId).maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!row) return { status: "error", message: "Gap not found.", httpStatus: 404 };
  if (isStale(row.updated_at, base)) return { status: "conflict", row };
  // A note is kept unless the owner sends one (the gap sheet's "Change" re-sends it).
  const patch = {
    status: input.status, status_set_by: ctx.userId, status_set_at: new Date().toISOString(),
    ...("note" in input ? { note: note.note } : {}),
  };
  return writeRecord(supabase, ctx, "logbook_gap", input.gapId, row.updated_at, patch);
}

/** `gap.create`: an owner-declared gap. `id` is the idempotency key; a retry finds the row it wrote. */
export async function create(
  supabase: Db,
  ctx: WriteCtx,
  input: { id: string; logbookId: string; fromDate: string; toDate: string; note?: string | null },
): Promise<WriteResult> {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (typeof input.id !== "string" || !input.id) return { status: "error", message: "The gap is missing its id.", httpStatus: 400 };
  if (!iso.test(input.fromDate ?? "") || !iso.test(input.toDate ?? "") || input.toDate <= input.fromDate)
    return { status: "error", message: "Dates must be YYYY-MM-DD, the end after the start.", httpStatus: 400 };
  const note = cleanNote(input.note);
  if ("error" in note) return { status: "error", message: note.error, httpStatus: 400 };
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  const { data: existing } = await supabase.from("logbook_gap").select("*").eq("id", input.id).maybeSingle();
  if (existing) return existing.aircraft_id === ctx.aircraftId ? { status: "ok", row: existing } : { status: "error", message: "Gap not found.", httpStatus: 404 };
  const { data: book } = await supabase.from("logbook").select("id")
    .eq("id", input.logbookId).eq("aircraft_id", ctx.aircraftId).maybeSingle();
  if (!book) return { status: "error", message: "That logbook isn't on this aircraft.", httpStatus: 400 };
  return insertRecords(supabase, ctx, "logbook_gap", {
    id: input.id, aircraft_id: ctx.aircraftId, logbook_id: input.logbookId, from_date: input.fromDate, to_date: input.toDate,
    source: "owner", note: note.note, status_set_by: ctx.userId, status_set_at: new Date().toISOString(),
  });
}

/**
 * Re-run detection and write the difference (09 §3.8 rule 4). Called after a write changes confirmed entries.
 * Derived data: a failure here never fails the owner's write; the next confirm repairs it.
 * shortcut: reads every entry of the aircraft per call (fine for a personal aircraft's few thousand rows);
 * the nightly 03:00 UTC pass of 09 §6 is not scheduled yet.
 */
export async function refreshGaps(supabase: Db, aircraftId: string): Promise<void> {
  try {
    const [{ data: aircraft }, { data: logbook }, { data: stored }] = await Promise.all([
      supabase.from("aircraft").select("year").eq("id", aircraftId).maybeSingle(),
      supabase.from("logbook").select("id, type, component_ref, title").eq("aircraft_id", aircraftId),
      supabase.from("logbook_gap").select("id, logbook_id, from_date, to_date, status, source, updated_at").eq("aircraft_id", aircraftId),
    ]);
    const entries: MapEntryRow[] = [];
    for (let start = 0; ; start += 1000) {
      const { data, error } = await supabase.from("log_entry")
        .select("id, logbook_id, page_id, entry_date, trust, replaced_by_entry_id, is_continuation, entry_kind, description")
        .eq("aircraft_id", aircraftId).order("id").range(start, start + 999);
      if (error) return;
      entries.push(...((data ?? []) as MapEntryRow[]));
      if (!data || data.length < 1000) break;
    }
    const books = logbook ?? [];
    const plan = reconcileGaps((stored ?? []) as StoredGap[], detectGaps({ year: aircraft?.year, logbook: books, log_entry: entries }), books);
    if (plan.insert.length)
      await supabase.from("logbook_gap").insert(plan.insert.map((g) => ({ ...g, aircraft_id: aircraftId })));
    for (const u of plan.update)
      await supabase.from("logbook_gap").update({ from_date: u.from_date, to_date: u.to_date, ...(u.status ? { status: u.status } : {}) })
        .eq("id", u.id).eq("aircraft_id", aircraftId).eq("updated_at", stored?.find((g) => g.id === u.id)?.updated_at ?? "");
  } catch {
    // Derived data only; see above.
  }
}

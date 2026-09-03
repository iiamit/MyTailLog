import { canEdit, type Db, type WriteCtx, type WriteResult } from "./entries";

// The ONE implementation of every oil top-off write (CONTRACT §3 C3, §4). See
// entries.ts for the rules.
//
// oil_addition has NO updated_at column (0042) and no update path, so there is
// nothing for a `base` to compare against: deleteTopOff ignores it. Reported to
// the lead as a contract/schema mismatch.

const NO_EDIT = "You don't have edit access to this aircraft.";

export type TopOffInput = {
  id?: string;
  date: string;
  quarts: number;
  hobbs?: number | null;
  tach?: number | null;
  notes?: string | null;
};

// ---------------------------------------------------------------------------
// Pure helpers — tested in apps/web/test/writes-c3.test.ts
// ---------------------------------------------------------------------------

export type TopOffRow = { added_date: string; quarts: number; hobbs: number | null; tach: number | null; notes: string | null };

/** Validate an untrusted top-off at the trust boundary. */
export function validateTopOff(input: unknown): { row: TopOffRow } | { error: string } {
  if (!input || typeof input !== "object") return { error: "Top-off details are missing." };
  const src = input as Record<string, unknown>;
  const quarts = num(src.quarts);
  if (quarts == null || quarts <= 0) return { error: "Enter how many quarts were added." };
  const date = typeof src.date === "string" ? src.date : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick a date." };
  for (const k of ["hobbs", "tach"] as const) {
    if (src[k] == null || src[k] === "") continue;
    const n = num(src[k]);
    if (n == null || n < 0) return { error: `${k[0].toUpperCase()}${k.slice(1)} must be zero or a positive number.` };
  }
  const notes = typeof src.notes === "string" ? src.notes.trim() || null : null;
  return { row: { added_date: date, quarts, hobbs: num(src.hobbs), tach: num(src.tach), notes } };
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Oil added at the airplane — feeds the consumption trend. `id` is the
 *  phone's idempotency key. */
export async function addTopOff(supabase: Db, ctx: WriteCtx, input: TopOffInput): Promise<WriteResult> {
  const v = validateTopOff(input);
  if ("error" in v) return { status: "error", message: v.error, httpStatus: 400 };
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };

  const { data, error } = await supabase
    .from("oil_addition")
    .upsert(
      { ...(input.id ? { id: input.id } : {}), aircraft_id: ctx.aircraftId, ...v.row },
      { onConflict: "id", ignoreDuplicates: true },
    )
    .select("*")
    .maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (data) return { status: "ok", row: data };
  const { data: existing } = await supabase
    .from("oil_addition")
    .select("*")
    .eq("id", input.id ?? "")
    .eq("aircraft_id", ctx.aircraftId)
    .maybeSingle();
  return existing ? { status: "ok", row: existing } : { status: "error", message: "Couldn't save the top-off." };
}

/** Nothing references oil_addition(id) (checked the migrations). */
export async function deleteTopOff(
  supabase: Db,
  ctx: WriteCtx,
  input: { additionId: string },
  base?: string,
): Promise<WriteResult> {
  void base; // no updated_at on this table — see the header
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  const { data, error } = await supabase
    .from("oil_addition")
    .delete()
    .eq("id", input.additionId)
    .eq("aircraft_id", ctx.aircraftId)
    .select("id");
  if (error) return { status: "error", message: error.message };
  if (!data?.length) return { status: "error", message: "Top-off not found.", httpStatus: 404 };
  return { status: "ok", row: null };
}

import { isEngineComponent } from "@/lib/engineComponent";
import { insertRecords } from "./insert";
import { writeRecord } from "./conditional";
import { canEdit, isStale, type Db, type WriteCtx, type WriteResult } from "./entries";

// The ONE implementation of every oil top-off write (CONTRACT §3 C3, §4). See
// entries.ts for the rules.
//
// Migration 0058 gave oil_addition an `updated_at` and a BEFORE UPDATE trigger,
// so `oil.delete` carries a real base and deleteTopOff compares it like every
// other delete. (It did not when this file was written; the stale note that
// said so is what nearly kept the check out.)

const NO_EDIT = "You don't have edit access to this aircraft.";

export type TopOffInput = {
  id?: string;
  date: string;
  quarts: number;
  hobbs?: number | null;
  tach?: number | null;
  notes?: string | null;
  componentId?: string | null;
};

// ---------------------------------------------------------------------------
// Pure helpers — tested in apps/web/test/writes-c3.test.ts
// ---------------------------------------------------------------------------

export type TopOffRow = { component_id?: string | null; added_date: string; quarts: number; hobbs: number | null; tach: number | null; notes: string | null };

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
  const component = src.componentId;
  if(component!=null&&component!==""&&(typeof component!=="string"||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(component)))return {error:"Choose a valid engine."};
  const notes = typeof src.notes === "string" ? src.notes.trim() || null : null;
  return { row: { ...(component?{component_id:String(component)}:{}),added_date: date, quarts, hobbs: num(src.hobbs), tach: num(src.tach), notes } };
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

  if(v.row.component_id){const {data:engine,error}=await supabase.from("component").select("*").eq("aircraft_id",ctx.aircraftId).eq("id",v.row.component_id).maybeSingle();if(error)return {status:"error",message:"Could not check this engine. Try again.",httpStatus:503};if(!engine || !isEngineComponent(engine))return {status:"error",message:"Choose an engine on this aircraft.",httpStatus:400};}
  return insertRecords(supabase, ctx, "oil_addition", { ...(input.id ? { id: input.id } : {}), aircraft_id: ctx.aircraftId, ...v.row });
}

/** Nothing references oil_addition(id) (checked the migrations). */
export async function deleteTopOff(
  supabase: Db,
  ctx: WriteCtx,
  input: { additionId: string },
  base?: string,
): Promise<WriteResult> {
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  const { data: row } = await supabase
    .from("oil_addition")
    .select("*")
    .eq("id", input.additionId)
    .eq("aircraft_id", ctx.aircraftId)
    .maybeSingle();
  if (!row) return { status: "error", message: "Top-off not found.", httpStatus: 404 };
  // §2: the row moved on since the phone last saw it — say so, delete nothing.
  if (isStale(row.updated_at, base)) return { status: "conflict", row };
  return writeRecord(supabase, ctx, "oil_addition", input.additionId, row.updated_at, null);
}

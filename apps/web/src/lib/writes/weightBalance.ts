import type { WeightBalance } from "@/lib/database.types";
import { completeWB } from "@/lib/weightBalance";
import { canEdit, isStale, type Db, type WriteCtx, type WriteResult } from "./entries";

// The ONE implementation of every weight & balance write (CONTRACT §3 C3, §4).
// See entries.ts for the rules.

const NO_EDIT = "You don't have edit access to this aircraft.";

export type WBFields = Pick<
  WeightBalance,
  | "revision_date" | "empty_weight" | "empty_weight_arm" | "empty_weight_moment"
  | "max_gross_weight" | "method" | "reference" | "reason" | "notes"
>;

// ---------------------------------------------------------------------------
// Pure helpers — tested in apps/web/test/writes-c3.test.ts
// ---------------------------------------------------------------------------

const NUM_KEYS = ["empty_weight", "empty_weight_arm", "empty_weight_moment", "max_gross_weight"] as const;
const TEXT_KEYS = ["reference", "reason", "notes"] as const;

/**
 * Validate an untrusted W&B revision and derive the missing one of
 * weight/arm/moment so stored rows are always consistent (moment = weight × arm).
 */
export function validateWB(input: unknown): { fields: WBFields } | { error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Weight & balance details are missing." };
  const src = input as Record<string, unknown>;
  const revision_date = typeof src.revision_date === "string" ? src.revision_date : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(revision_date)) return { error: "Revision date is required." };

  const nums: Record<(typeof NUM_KEYS)[number], number | null> = {
    empty_weight: null, empty_weight_arm: null, empty_weight_moment: null, max_gross_weight: null,
  };
  for (const k of NUM_KEYS) {
    const v = src[k];
    if (v == null || v === "") continue;
    const n = Number(v);
    if (!Number.isFinite(n)) return { error: `${label(k)} must be a number.` };
    if (n < 0 && k !== "empty_weight_arm" && k !== "empty_weight_moment") return { error: `${label(k)} can't be negative.` };
    nums[k] = n;
  }
  const { weight, arm, moment } = completeWB({
    weight: nums.empty_weight, arm: nums.empty_weight_arm, moment: nums.empty_weight_moment,
  });

  const method = src.method == null || src.method === "" ? null : src.method;
  if (method !== null && method !== "weighed" && method !== "computed") return { error: "Method must be weighed or computed." };

  const text: Record<(typeof TEXT_KEYS)[number], string | null> = { reference: null, reason: null, notes: null };
  for (const k of TEXT_KEYS) {
    const v = src[k];
    if (v == null) continue;
    if (typeof v !== "string") return { error: `${label(k)} must be text.` };
    text[k] = v.trim() || null;
  }

  return {
    fields: {
      revision_date,
      empty_weight: weight,
      empty_weight_arm: arm,
      empty_weight_moment: moment,
      max_gross_weight: nums.max_gross_weight,
      method,
      ...text,
    },
  };
}

const label = (k: string) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

async function loadWB(
  supabase: Db,
  ctx: WriteCtx,
  wbId: string,
  base: string | undefined,
): Promise<{ row: WeightBalance } | WriteResult> {
  const { data: row, error } = await supabase
    .from("weight_balance")
    .select("*")
    .eq("id", wbId)
    .eq("aircraft_id", ctx.aircraftId)
    .maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!row) return { status: "error", message: "Weight & balance revision not found.", httpStatus: 404 };
  if (isStale(row.updated_at, base)) return { status: "conflict", row };
  return { row };
}

/** Create (no `id`) or edit (`id` + `base`) one revision. */
export async function upsert(
  supabase: Db,
  ctx: WriteCtx,
  input: { id?: string | null; fields: unknown },
  base?: string,
): Promise<WriteResult> {
  const v = validateWB(input.fields);
  if ("error" in v) return { status: "error", message: v.error, httpStatus: 400 };
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };

  if (input.id) {
    const loaded = await loadWB(supabase, ctx, input.id, base);
    if ("status" in loaded) return loaded;
    const { data, error } = await supabase
      .from("weight_balance")
      .update(v.fields)
      .eq("id", input.id)
      .eq("aircraft_id", ctx.aircraftId)
      .select("*")
      .maybeSingle();
    if (error) return { status: "error", message: error.message };
    if (!data) return { status: "error", message: "Weight & balance revision not found.", httpStatus: 404 };
    return { status: "ok", row: data };
  }

  const { data, error } = await supabase
    .from("weight_balance")
    .insert({ aircraft_id: ctx.aircraftId, ...v.fields })
    .select("*")
    .maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "error", message: "Couldn't save the revision." };
  return { status: "ok", row: data };
}

/** Nothing references weight_balance(id) (checked the migrations). */
export async function remove(
  supabase: Db,
  ctx: WriteCtx,
  input: { wbId: string },
  base?: string,
): Promise<WriteResult> {
  if (!(await canEdit(supabase, ctx.aircraftId))) return { status: "error", message: NO_EDIT, httpStatus: 403 };
  const loaded = await loadWB(supabase, ctx, input.wbId, base);
  if ("status" in loaded) return loaded;
  const { data, error } = await supabase
    .from("weight_balance")
    .delete()
    .eq("id", input.wbId)
    .eq("aircraft_id", ctx.aircraftId)
    .select("id");
  if (error) return { status: "error", message: error.message };
  if (!data?.length) return { status: "error", message: "Weight & balance revision not found.", httpStatus: 404 };
  return { status: "ok", row: null };
}

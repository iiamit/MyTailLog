import type { Aircraft } from "@/lib/database.types";
import { LOGBOOK_TYPES } from "@/lib/logbooks";
import { isStale, type Db, type WriteCtx, type WriteResult } from "./entries";
import { seedStandard } from "./maintenance";

const NO_EDIT = "You don't have edit access to this aircraft.";

// The ONE implementation of enrollment (CONTRACT §3 C3 `aircraft.enroll`).
// Called by the web server action (cookie client) and POST /api/aircraft/enroll
// (Bearer). `ctx.aircraftId` is the id the NEW aircraft gets — client-generated
// so a retry after a lost response finds the row it already made.

export type EnrollFields = Pick<
  Aircraft,
  | "tail_number" | "make" | "model" | "serial_number" | "year" | "engine_serials" | "prop_serials"
  | "home_base" | "enrollment_hobbs" | "enrollment_tach" | "enrollment_airframe"
>;

// ---------------------------------------------------------------------------
// Pure helpers — tested in apps/web/test/writes-c3.test.ts
// ---------------------------------------------------------------------------

const NUM_KEYS = ["enrollment_hobbs", "enrollment_tach", "enrollment_airframe"] as const;

/** Validate an untrusted enrollment (form fields or JSON). Serial lists accept
 *  either an array or the form's comma-separated text. */
export function pickEnrollFields(input: unknown): { fields: EnrollFields } | { error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Aircraft details are missing." };
  const src = input as Record<string, unknown>;
  const tail = text(src.tail_number ?? src.tail)?.toUpperCase();
  if (!tail) return { error: "Tail number is required." };

  const year = num(src.year);
  if (src.year != null && src.year !== "" && (year == null || !Number.isInteger(year))) return { error: "Year must be a whole number." };
  for (const k of NUM_KEYS) {
    if (src[k] != null && src[k] !== "" && num(src[k]) == null) return { error: `${k.replace("enrollment_", "")} must be a number.` };
  }

  return {
    fields: {
      tail_number: tail,
      make: text(src.make),
      model: text(src.model),
      serial_number: text(src.serial_number),
      home_base: text(src.home_base),
      year,
      engine_serials: list(src.engine_serials),
      prop_serials: list(src.prop_serials),
      enrollment_hobbs: num(src.enrollment_hobbs),
      enrollment_tach: num(src.enrollment_tach),
      enrollment_airframe: num(src.enrollment_airframe),
    },
  };
}

const text = (v: unknown): string | null => (typeof v === "string" ? v.trim() || null : null);
function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function list(v: unknown): string[] {
  const items = Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.split(",") : [];
  return items.map((s) => s.trim()).filter(Boolean);
}

/** Editable identity fields; blank serial lists intentionally clear old values. */
export function pickAircraftDetails(input: unknown):
  | { fields: Pick<Aircraft, "make" | "model" | "serial_number" | "year" | "engine_serials" | "prop_serials" | "home_base"> }
  | { error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Aircraft details are missing." };
  const src = input as Record<string, unknown>;
  for (const key of ["make", "model", "serial_number", "year", "engine_serials", "prop_serials", "home_base"]) {
    if (typeof src[key] !== "string") return { error: `Invalid ${key.replaceAll("_", " ")}.` };
  }
  const year = num(src.year);
  if (src.year !== "" && (year == null || !Number.isInteger(year))) return { error: "Year must be a whole number." };
  return { fields: {
    make: text(src.make), model: text(src.model), serial_number: text(src.serial_number), year,
    engine_serials: list(src.engine_serials), prop_serials: list(src.prop_serials), home_base: text(src.home_base),
  } };
}

export async function updateAircraftDetails(supabase: Db, ctx: WriteCtx, input: unknown): Promise<WriteResult> {
  const picked = pickAircraftDetails(input);
  if ("error" in picked) return { status: "error", message: picked.error, httpStatus: 400 };
  // Aircraft identity belongs to the owner; the existing owner RLS policy is
  // the final guard, and the returned row distinguishes a real save from 0 rows.
  const { data, error } = await supabase.from("aircraft").update(picked.fields)
    .eq("id", ctx.aircraftId).eq("owner_id", ctx.userId).select("id").maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "error", message: "Only the aircraft owner can edit these details.", httpStatus: 403 };
  return { status: "ok", row: data };
}

/** Load the aircraft for a base check (09 §5.5). */
async function aircraftVersion(supabase: Db, ctx: WriteCtx) {
  const { data } = await supabase.from("aircraft").select("*").eq("id", ctx.aircraftId).maybeSingle();
  return data;
}

/** `aircraft.setExpectedHours` (base, editors): "Usual flying", the third projection fallback (09 §2.14, §3.3). */
export async function setExpectedHours(supabase: Db, ctx: WriteCtx, input: { hoursPerWeek: number | null }, base?: string): Promise<WriteResult> {
  const h = input.hoursPerWeek;
  if (h !== null && !(typeof h === "number" && Number.isFinite(h) && h >= 0 && h <= 60))
    return { status: "error", message: "Hours a week must be between 0 and 60.", httpStatus: 400 };
  const row = await aircraftVersion(supabase, ctx);
  if (!row) return { status: "error", message: "Aircraft not found.", httpStatus: 404 };
  if (isStale(row.updated_at, base)) return { status: "conflict", row };
  // Aircraft rows are owner-update only; this definer function lets editors change this one column (0090).
  const { error } = await supabase.rpc("set_expected_hours", { target_aircraft: ctx.aircraftId, hours_per_week: h === null ? null : Math.round(h * 10) / 10 });
  if (error) return { status: "error", message: error.code === "42501" ? NO_EDIT : error.message, httpStatus: error.code === "42501" ? 403 : 400 };
  return { status: "ok", row: await aircraftVersion(supabase, ctx) };
}

/** `aircraft.setSituation` (base, owner): "I'm selling it" / "It's in the shop", or clear (09 §2.14, §3.6). */
export async function setSituation(supabase: Db, ctx: WriteCtx, input: { situation: "preparing_sale" | "in_shop" | null }, base?: string): Promise<WriteResult> {
  if (input.situation !== null && input.situation !== "preparing_sale" && input.situation !== "in_shop")
    return { status: "error", message: "Unknown situation.", httpStatus: 400 };
  const row = await aircraftVersion(supabase, ctx);
  if (!row) return { status: "error", message: "Aircraft not found.", httpStatus: 404 };
  if (isStale(row.updated_at, base)) return { status: "conflict", row };
  const { data, error } = await supabase.from("aircraft").update({ situation_override: input.situation })
    .eq("id", ctx.aircraftId).eq("owner_id", ctx.userId).select("*").maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "error", message: "Only the aircraft owner can change this.", httpStatus: 403 };
  return { status: "ok", row: data };
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Enroll an aircraft and seed its standard logbooks. owner_id comes from the
 * session, never the client (RLS insists on it anyway).
 *
 * The aircraft insert deliberately has no `.select()`: a returning insert also
 * runs the SELECT policy (has_aircraft_access — a STABLE function that can't see
 * the row mid-insert) and wrongly reports an RLS violation. The row is read
 * back in a second query.
 */
export async function enroll(supabase: Db, ctx: WriteCtx, input: unknown): Promise<WriteResult> {
  const picked = pickEnrollFields(input);
  if ("error" in picked) return { status: "error", message: picked.error, httpStatus: 400 };

  const { error } = await supabase
    .from("aircraft")
    .insert({ id: ctx.aircraftId, owner_id: ctx.userId, ...picked.fields });
  // 23505 = unique_violation: a retry of an enrollment that already landed.
  if (error && error.code !== "23505") return { status: "error", message: error.message };

  const { data: row } = await supabase
    .from("aircraft")
    .select("*")
    .eq("id", ctx.aircraftId)
    .eq("owner_id", ctx.userId)
    .maybeSingle();
  if (!row) return { status: "error", message: "Couldn't enroll the aircraft." };
  if (error) return { status: "ok", row }; // the retry: logbooks were seeded first time

  // A single annual usually touches several logbooks, so seed them all.
  const { error: logbookError } = await supabase
    .from("logbook")
    .insert(LOGBOOK_TYPES.map((type) => ({ aircraft_id: ctx.aircraftId, type })));
  if (logbookError) return { status: "error", message: `Aircraft saved, but logbooks failed: ${logbookError.message}` };

  // Start with the Part 91 recurring items (annual, transponder, pitot-static,
  // ELT) so status has something to count down the moment a date is known.
  // Not fatal: the Maintenance page can still seed them by hand.
  const seeded = await seedStandard(supabase, ctx);
  if (seeded.status !== "ok") console.error("enroll: Part 91 seed failed", seeded);
  return { status: "ok", row };
}

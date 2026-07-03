"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { LOGBOOK_TYPES } from "@/lib/logbooks";

function parseNum(value: FormDataEntryValue | null): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseCsv(value: FormDataEntryValue | null): string[] {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export type EnrollResult = { error: string } | never;

/**
 * Enroll an aircraft and seed its three standard logbooks (airframe, engine,
 * prop). RLS guarantees owner_id must equal the signed-in user, so we set it
 * explicitly from the session rather than trusting client input.
 */
export async function enrollAircraft(formData: FormData): Promise<EnrollResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const tail = String(formData.get("tail_number") ?? "").trim();
  if (!tail) return { error: "Tail number is required." };

  const aircraftRow = {
    owner_id: user.id,
    tail_number: tail.toUpperCase(),
    make: (String(formData.get("make") ?? "").trim() || null) as string | null,
    model: (String(formData.get("model") ?? "").trim() || null) as string | null,
    serial_number:
      (String(formData.get("serial_number") ?? "").trim() || null) as string | null,
    year: parseNum(formData.get("year")),
    engine_serials: parseCsv(formData.get("engine_serials")),
    prop_serials: parseCsv(formData.get("prop_serials")),
    home_base:
      (String(formData.get("home_base") ?? "").trim() || null) as string | null,
    enrollment_hobbs: parseNum(formData.get("enrollment_hobbs")),
    enrollment_tach: parseNum(formData.get("enrollment_tach")),
  };

  // Generate the id client-side and insert WITHOUT .select(): a returning insert
  // (`.select()`) forces Postgres to also check the SELECT policy on the new
  // row, and the aircraft SELECT policy is has_aircraft_access(id) — a STABLE
  // function that re-queries the table and can't see the row mid-insert, so it
  // wrongly reports "new row violates row-level security policy". No RETURNING,
  // no SELECT-policy check; the INSERT with_check (owner_id = auth.uid()) is all
  // that runs, and we already know the id.
  const aircraftId = crypto.randomUUID();
  const { error: aircraftError } = await supabase
    .from("aircraft")
    .insert({ id: aircraftId, ...aircraftRow });

  if (aircraftError) {
    return { error: aircraftError.message };
  }

  // Seed the standard logbooks (airframe/engine/prop/avionics). A single annual
  // usually touches several of them.
  const { error: logbookError } = await supabase.from("logbook").insert(
    LOGBOOK_TYPES.map((type) => ({ aircraft_id: aircraftId, type })),
  );

  if (logbookError) {
    return { error: `Aircraft saved, but logbooks failed: ${logbookError.message}` };
  }

  revalidatePath("/dashboard");
  redirect(`/aircraft/${aircraftId}`);
}

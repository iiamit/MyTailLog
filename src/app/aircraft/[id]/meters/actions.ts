"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { METERS, type Meter } from "@/lib/hobbsTach";

type Result = { ok: true } | { error: string };

const path = (aircraftId: string) => `/aircraft/${aircraftId}/meters`;

// Every hour countdown in the app reads these, so a change invalidates the
// airworthiness surfaces too, not just this page.
function revalidateHours(aircraftId: string) {
  revalidatePath(path(aircraftId));
  revalidatePath(`/aircraft/${aircraftId}`);
  revalidatePath(`/aircraft/${aircraftId}/status`);
  revalidatePath(`/aircraft/${aircraftId}/maintenance`);
}

/**
 * Record a meter replacement: the old meter's final reading and what the new one
 * started at. The app stitches history across it so hour-based items keep
 * counting instead of seeing time run backwards. Editors only (RLS).
 */
export async function addMeterReset(
  aircraftId: string,
  input: { meter: Meter; reset_date: string; prior_value: number | null; new_value: number; notes: string | null },
): Promise<Result> {
  if (!METERS.includes(input.meter)) return { error: "Pick a meter." };
  if (!input.reset_date) return { error: "When did the new meter go in?" };
  const bad = (n: number | null) => n != null && (!Number.isFinite(n) || n < 0);
  if (bad(input.prior_value) || bad(input.new_value))
    return { error: "Readings must be zero or a positive number." };

  const supabase = await createClient();
  const { error } = await supabase.from("meter_reset").insert({
    aircraft_id: aircraftId,
    meter: input.meter,
    reset_date: input.reset_date,
    prior_value: input.prior_value,
    new_value: input.new_value ?? 0,
    notes: input.notes?.trim() || null,
  });
  if (error) return { error: error.message };
  revalidateHours(aircraftId);
  return { ok: true };
}

export async function deleteMeterReset(aircraftId: string, id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("meter_reset").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidateHours(aircraftId);
  return { ok: true };
}

/**
 * Record a meter reading by hand. The normal path is a scanned logbook page or a
 * MyFlightBook sync, but airframe time (a glider's only meter) comes from neither
 * — this is how it gets in. Stored as a `manual` hours_reading.
 */
export async function addMeterReading(
  aircraftId: string,
  input: { reading_date: string; hobbs: number | null; tach: number | null; airframe: number | null },
): Promise<Result> {
  if (!input.reading_date) return { error: "Pick a date." };
  const values = [input.hobbs, input.tach, input.airframe];
  if (values.every((v) => v == null)) return { error: "Enter at least one reading." };
  if (values.some((v) => v != null && (!Number.isFinite(v) || v < 0)))
    return { error: "Readings must be zero or a positive number." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("hours_reading").insert({
    aircraft_id: aircraftId,
    reading_date: input.reading_date,
    hobbs: input.hobbs,
    tach: input.tach,
    airframe: input.airframe,
    source: "manual",
    synced_by: user?.id ?? null,
  });
  if (error) return { error: error.message };
  revalidateHours(aircraftId);
  return { ok: true };
}

export async function deleteMeterReading(aircraftId: string, id: string): Promise<Result> {
  const supabase = await createClient();
  // Scoped to manual rows: a synced MyFlightBook reading is deleted by re-syncing,
  // and a logbook entry's hours belong to the entry, not to this page.
  const { error } = await supabase
    .from("hours_reading")
    .delete()
    .eq("id", id)
    .eq("aircraft_id", aircraftId)
    .eq("source", "manual");
  if (error) return { error: error.message };
  revalidateHours(aircraftId);
  return { ok: true };
}

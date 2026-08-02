"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { METERS, type Meter } from "@/lib/hobbsTach";
import { normalizeIcao24, resolveIcao24 } from "@/lib/adsb/icao24";

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

// --- ADS-B (passive hours) --------------------------------------------------

/**
 * Turn the ADS-B fallback observer on or off for this aircraft. Opt-in, off by
 * default: this is position data about someone's aircraft and nobody gets
 * enrolled silently.
 *
 * Turning it on resolves the Mode S hex once and caches it, so the daily sweep
 * never re-resolves. `hexInput` is the manual escape hatch for when neither the
 * FAA registry nor adsbdb knows the aircraft.
 */
export async function setAdsbEnabled(
  aircraftId: string,
  enabled: boolean,
  hexInput?: string | null,
): Promise<{ ok: true; icao24: string | null } | { error: string }> {
  const supabase = await createClient();

  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("tail_number, icao24")
    .eq("id", aircraftId)
    .single();
  if (!aircraft) return { error: "Aircraft not found." };

  let icao24 = aircraft.icao24;
  if (hexInput != null && hexInput.trim() !== "") {
    icao24 = normalizeIcao24(hexInput);
    if (!icao24) return { error: "A Mode S address is six hex characters, e.g. A12239." };
  } else if (enabled && !icao24) {
    icao24 = await resolveIcao24(aircraft.tail_number);
    if (!icao24) {
      return {
        error:
          "Couldn't find this aircraft's Mode S address in the FAA registry or adsbdb. Enter it by hand — it's on your registration.",
      };
    }
  }

  const { error } = await supabase
    .from("aircraft")
    .update({ adsb_enabled: enabled, icao24 })
    .eq("id", aircraftId);
  if (error) return { error: error.message };
  revalidateHours(aircraftId);
  return { ok: true, icao24 };
}

/**
 * Dismiss the current suggestion: mark every undismissed observed flight as
 * seen so it stops being counted. The rows stay — dismissing is "I know, and my
 * records are right", not "delete the observation".
 */
export async function dismissAdsbFlights(aircraftId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("adsb_flight")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("aircraft_id", aircraftId)
    .is("dismissed_at", null);
  if (error) return { error: error.message };
  revalidateHours(aircraftId);
  return { ok: true };
}

/**
 * Accept an ADS-B suggestion: write ONE hours_reading with source
 * `adsb_estimate`, at the value the USER confirmed (pre-filled, fully editable).
 * Never auto-written — this action only ever runs from an explicit click.
 *
 * The row is deliberately marked `adsb_estimate` and not `manual`: it is never
 * authoritative for compliance and must never feed a utilization-rate
 * calculation, which would be circular. `external_ref` keys it to the date so a
 * double-click can't create a second row.
 */
export async function acceptAdsbEstimate(
  aircraftId: string,
  input: { reading_date: string; tach: number | null; hobbs: number | null },
): Promise<Result> {
  if (!input.reading_date) return { error: "Pick a date." };
  const values = [input.tach, input.hobbs];
  if (values.every((v) => v == null)) return { error: "Enter at least one reading." };
  if (values.some((v) => v != null && (!Number.isFinite(v) || v < 0)))
    return { error: "Readings must be zero or a positive number." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("hours_reading").upsert(
    {
      aircraft_id: aircraftId,
      reading_date: input.reading_date,
      tach: input.tach,
      hobbs: input.hobbs,
      source: "adsb_estimate",
      synced_by: user?.id ?? null,
      external_ref: input.reading_date,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "aircraft_id,source,external_ref" },
  );
  if (error) return { error: error.message };
  // The accepted reading becomes the new cutoff, so the observed flights behind
  // it are now accounted for — clear them so the banner doesn't re-fire.
  await dismissAdsbFlights(aircraftId);
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

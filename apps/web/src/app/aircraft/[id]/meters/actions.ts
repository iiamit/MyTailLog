"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Meter } from "@/lib/hobbsTach";
import { failMessage, type WriteCtx, type WriteResult } from "@/lib/writes/entries";
import * as meters from "@/lib/writes/meters";

// Thin wrappers over lib/writes/meters (CONTRACT §4): session, the write, then
// revalidate. The rules and the validation live in the lib module.

type Result = { ok: true } | { error: string };

// Every hour countdown in the app reads these, so a change invalidates the
// airworthiness surfaces too, not just this page.
function revalidateHours(aircraftId: string) {
  revalidatePath(`/aircraft/${aircraftId}/meters`);
  revalidatePath(`/aircraft/${aircraftId}`);
  revalidatePath(`/aircraft/${aircraftId}/status`);
  revalidatePath(`/aircraft/${aircraftId}/maintenance`);
}

async function session(aircraftId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, ctx: { aircraftId, userId: user?.id ?? "" } as WriteCtx };
}

function finish(aircraftId: string, r: WriteResult): Result {
  if (r.status !== "ok") return { error: failMessage(r) };
  revalidateHours(aircraftId);
  return { ok: true };
}

/** Correct the enrollment meter readings — the baseline captured at enrollment.
 *  Passing null CLEARS a meter. */
export async function updateEnrollmentMeters(
  aircraftId: string,
  input: { hobbs: number | null; tach: number | null; airframe: number | null },
): Promise<Result> {
  const { supabase, ctx } = await session(aircraftId);
  return finish(aircraftId, await meters.updateEnrollmentMeters(supabase, ctx, input));
}

/** Record a meter replacement: the old meter's final reading and the new one's start. */
export async function addMeterReset(
  aircraftId: string,
  input: { meter: Meter; reset_date: string; prior_value: number | null; new_value: number; notes: string | null },
): Promise<Result> {
  const { supabase, ctx } = await session(aircraftId);
  return finish(
    aircraftId,
    await meters.addReset(supabase, ctx, {
      meter: input.meter,
      date: input.reset_date,
      prior: input.prior_value,
      next: input.new_value,
      notes: input.notes,
    }),
  );
}

export async function deleteMeterReset(aircraftId: string, id: string): Promise<Result> {
  const { supabase, ctx } = await session(aircraftId);
  return finish(aircraftId, await meters.deleteReset(supabase, ctx, { resetId: id }));
}

/** Record a meter reading by hand (stored as a `manual` hours_reading). */
export async function addMeterReading(
  aircraftId: string,
  input: { reading_date: string; hobbs: number | null; tach: number | null; airframe: number | null },
): Promise<Result> {
  const { supabase, ctx } = await session(aircraftId);
  return finish(
    aircraftId,
    await meters.addReading(supabase, ctx, {
      date: input.reading_date,
      hobbs: input.hobbs,
      tach: input.tach,
      airframe: input.airframe,
    }),
  );
}

export async function deleteMeterReading(aircraftId: string, id: string): Promise<Result> {
  const { supabase, ctx } = await session(aircraftId);
  return finish(aircraftId, await meters.deleteReading(supabase, ctx, { readingId: id }));
}

// --- ADS-B (passive hours) --------------------------------------------------

/** Turn the ADS-B fallback observer on or off; `hexInput` overrides the resolved Mode S hex. */
export async function setAdsbEnabled(
  aircraftId: string,
  enabled: boolean,
  hexInput?: string | null,
): Promise<{ ok: true; icao24: string | null } | { error: string }> {
  const { supabase, ctx } = await session(aircraftId);
  const r = await meters.setAdsbEnabled(supabase, ctx, { enabled, hexInput });
  if (r.status !== "ok") return { error: failMessage(r) };
  revalidateHours(aircraftId);
  return { ok: true, icao24: (r.row?.icao24 as string | null) ?? null };
}

/** Dismiss the current ADS-B suggestion (the observations stay). */
export async function dismissAdsbFlights(aircraftId: string): Promise<Result> {
  const { supabase, ctx } = await session(aircraftId);
  return finish(aircraftId, await meters.dismissAdsbFlights(supabase, ctx));
}

/** Accept an ADS-B suggestion at the value the user confirmed. */
export async function acceptAdsbEstimate(
  aircraftId: string,
  input: { reading_date: string; tach: number | null; hobbs: number | null },
): Promise<Result> {
  const { supabase, ctx } = await session(aircraftId);
  return finish(
    aircraftId,
    await meters.acceptAdsbEstimate(supabase, ctx, { date: input.reading_date, tach: input.tach, hobbs: input.hobbs }),
  );
}

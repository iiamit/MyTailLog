"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { failMessage, type WriteResult } from "@/lib/writes/entries";
import * as meters from "@/lib/writes/meters";
import * as aircraft from "@/lib/writes/aircraft";
import * as timeChecks from "@/lib/writes/timeChecks";
import { writeSession } from "@/lib/v2/session";
import { formNumber } from "@/lib/v2/hours";
import type { Meter } from "@/lib/hobbsTach";
import type { ActResult } from "./ActForm";

// Server actions for W-AIRCRAFT-01. Each is a thin wrapper over lib/writes (CONTRACT §4): the rules and
// validation live there. Every hours countdown reads these rows, so a change revalidates the whole binder.

const page = (id: string) => `/aircraft/${id}/hours`;
function revalidateHours(id: string) {
  revalidatePath(`/aircraft/${id}`, "layout");
}

async function run(id: string, write: (s: Awaited<ReturnType<typeof writeSession>>) => Promise<WriteResult>): Promise<string | null> {
  const s = await writeSession(id);
  if (!s.user) return "Not signed in.";
  const r = await write(s);
  if (r.status !== "ok") return failMessage(r);
  revalidateHours(id);
  return null;
}

/** Add a reading (?panel=reading). Warns once when a value is lower than the last one on record. */
export async function addReading(id: string, latest: { tach: number | null; hobbs: number | null }, _p: ActResult, form: FormData): Promise<ActResult> {
  const input = {
    date: String(form.get("date") ?? ""),
    tach: formNumber(form.get("tach")),
    hobbs: formNumber(form.get("hobbs")),
    airframe: formNumber(form.get("airframe")),
  };
  if (form.get("confirmLower") !== "1") {
    for (const m of ["tach", "hobbs"] as const) {
      const v = input[m];
      const last = latest[m];
      if (v != null && last != null && v < last)
        return { error: `${m === "tach" ? "Tach" : "Hobbs"} ${v} is lower than the last reading, ${last.toFixed(1)}. Check the meter. To keep it, tick “Keep it even if it is lower” and save again.` };
    }
  }
  const err = await run(id, ({ supabase, ctx }) => meters.addReading(supabase, ctx, input));
  if (err) return { error: err };
  redirect(`${page(id)}?done=reading`);
}

export async function removeReading(id: string, readingId: string, base: string): Promise<ActResult> {
  const err = await run(id, ({ supabase, ctx }) => meters.deleteReading(supabase, ctx, { readingId }, base));
  return err ? { error: err } : { ok: "Reading removed." };
}

export async function addReplacement(id: string, _p: ActResult, form: FormData): Promise<ActResult> {
  const err = await run(id, ({ supabase, ctx }) =>
    meters.addReset(supabase, ctx, {
      meter: String(form.get("meter") ?? "") as Meter,
      date: String(form.get("date") ?? ""),
      prior: formNumber(form.get("prior")),
      next: formNumber(form.get("next")) ?? 0,
      notes: String(form.get("notes") ?? ""),
    }),
  );
  if (err) return { error: err };
  redirect(`${page(id)}?done=replacement#replaced`);
}

export async function removeReplacement(id: string, resetId: string, base: string): Promise<ActResult> {
  const err = await run(id, ({ supabase, ctx }) => meters.deleteReset(supabase, ctx, { resetId }, base));
  return err ? { error: err } : { ok: "Replacement removed." };
}

/** Starting readings: a blank field clears that meter (stops tracking it). */
export async function saveStarting(id: string, _p: ActResult, form: FormData): Promise<ActResult> {
  const err = await run(id, ({ supabase, ctx }) =>
    meters.updateEnrollmentMeters(supabase, ctx, {
      tach: formNumber(form.get("tach")),
      hobbs: formNumber(form.get("hobbs")),
      airframe: formNumber(form.get("airframe")),
    }, String(form.get("base") ?? "") || undefined),
  );
  if (err) return { error: err };
  redirect(`${page(id)}?done=starting#starting`);
}

export async function saveUsualFlying(id: string, _p: ActResult, form: FormData): Promise<ActResult> {
  const err = await run(id, ({ supabase, ctx }) => aircraft.setExpectedHours(supabase, ctx, { hoursPerWeek: formNumber(form.get("hours")) }, String(form.get("base") ?? "") || undefined));
  if (err) return { error: err };
  redirect(`${page(id)}?done=usual`);
}

export async function setAdsb(id: string, enabled: boolean, _p: ActResult, form: FormData): Promise<ActResult> {
  const hexInput = String(form.get("hex") ?? "").trim() || null;
  const err = await run(id, ({ supabase, ctx }) => meters.setAdsbEnabled(supabase, ctx, { enabled, hexInput }, String(form.get("base") ?? "") || undefined));
  return err ? { error: err } : { ok: enabled ? "ADS-B checks are on." : "ADS-B checks are off." };
}

export async function dismissAdsb(id: string): Promise<ActResult> {
  const err = await run(id, ({ supabase, ctx }) => meters.dismissAdsbFlights(supabase, ctx));
  return err ? { error: err } : { ok: "Dismissed. The flights stay on record." };
}

/** Written versus calculated: "They agree, dismiss" or "Add to annual prep" (timeCheck.dismiss). */
export async function answerTimeCheck(
  id: string,
  check: { component: string; entryId: string; written: number; calculated: number },
  action: "agree" | "added_to_annual_prep",

): Promise<ActResult> {
  const err = await run(id, ({ supabase, ctx }) => timeChecks.dismiss(supabase, ctx, { id: crypto.randomUUID(), ...check, action }));
  if (err) return { error: err };
  revalidatePath(`/aircraft/${id}/maintenance/annual`);
  return { ok: action === "agree" ? "Dismissed." : "Added to annual prep as a loose end." };
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { saveStartHours, setItemDate } from "@/app/aircraft/[id]/start/actions";

type Result = { ok: true } | { error: string };
const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : Number(s);
};

/** Meters today (W-SETUP-01). Same write as v1's guided start: one manual reading dated today. */
export async function saveMeters(aircraftId: string, fd: FormData): Promise<Result> {
  const tach = num(fd.get("tach"));
  const hobbs = num(fd.get("hobbs"));
  if (tach == null && hobbs == null) return { error: "Enter the tach, the hobbs, or both." };
  if ([tach, hobbs].some((v) => v != null && (!Number.isFinite(v) || v < 0))) return { error: "Readings are zero or more." };
  const r = await saveStartHours(aircraftId, { tach, hobbs });
  revalidatePath(`/aircraft/${aircraftId}/setup`);
  return r;
}

/** A Part 91 item's last date (the annual, or transponder, pitot-static, ELT). Never moves last-done backward. */
export async function saveItemDate(aircraftId: string, kind: string, fd: FormData): Promise<Result> {
  const date = String(fd.get("date") ?? "");
  if (!date) return { error: "Pick a date on or before today." };
  const r = await setItemDate(aircraftId, { kind, date });
  revalidatePath(`/aircraft/${aircraftId}/setup`);
  return r;
}

/** The reminders toggle: flips profile.preferences.notify_due and leaves the rest of the preferences as they are. */
export async function saveReminders(on: boolean): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };
  const { data } = await supabase.from("profile").select("preferences").eq("id", user.id).maybeSingle();
  const prefs = (data?.preferences ?? {}) as Record<string, unknown>;
  const { error } = await supabase.from("profile").update({ preferences: { ...prefs, notify_due: on } }).eq("id", user.id);
  return error ? { error: "That didn't save. Try again." } : { ok: true };
}

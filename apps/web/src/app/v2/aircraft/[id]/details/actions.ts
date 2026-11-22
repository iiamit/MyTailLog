"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { failMessage } from "@/lib/writes/entries";
import { updateAircraftDetails } from "@/lib/writes/aircraft";
import { createServiceClient } from "@/lib/supabase/service";
import { writeSession } from "@/lib/v2/session";
import { tailMatches, type DetailsField } from "@/lib/v2/details";
import { deleteAircraft, transferAircraft } from "@/app/aircraft/[id]/share/actions";
import type { ActionState } from "../equipment/ActionForm";

const FIELDS = ["make", "model", "year", "serial_number", "engine_serials", "prop_serials", "home_base"] as const;
const base = (id: string) => `/aircraft/${id}/details`;

/** "Save details" (owner). The write's owner guard is final; editors and viewers never see the form. */
export async function saveDetails(aircraftId: string, _p: ActionState, f: FormData): Promise<{ error?: string; version?: string }> {
  const expected = String(f.get("base") ?? "");
  if (!expected) return { error: "Reload the aircraft details before saving." };
  const { supabase, ctx } = await writeSession(aircraftId);
  const r = await updateAircraftDetails(supabase, ctx, Object.fromEntries(FIELDS.map((k) => [k, String(f.get(k) ?? "")])), expected);
  if (r.status !== "ok") return { error: failMessage(r) };
  revalidatePath(`/aircraft/${aircraftId}`, "layout");
  return { version: (r.row as { updated_at: string }).updated_at };
}

/** "Use the registry's": copy one registry value over the owner's, keeping every other field as it is. */
export async function applyRegistryValue(aircraftId: string, field: DetailsField, value: string, expected: string) {
  if (!expected || !["make", "model", "serial_number", "year"].includes(field) || typeof value !== "string") redirect(`${base(aircraftId)}?done=error`);
  const { supabase, ctx } = await writeSession(aircraftId);
  const { data: ac } = await supabase.from("aircraft").select("make, model, year, serial_number, engine_serials, prop_serials, home_base").eq("id", aircraftId).maybeSingle();
  if (!ac) redirect(`${base(aircraftId)}?done=error`);
  const current: Record<string, string> = {
    make: ac.make ?? "", model: ac.model ?? "", year: ac.year?.toString() ?? "", serial_number: ac.serial_number ?? "",
    engine_serials: (ac.engine_serials ?? []).join(", "), prop_serials: (ac.prop_serials ?? []).join(", "), home_base: ac.home_base ?? "",
  };
  const r = await updateAircraftDetails(supabase, ctx, { ...current, [field]: value }, expected);
  revalidatePath(`/aircraft/${aircraftId}`, "layout");
  redirect(`${base(aircraftId)}?done=${r.status === "ok" ? "saved" : "error"}`);
}

/**
 * Transfer to another account (C-DETAILS-02). The owner-checked RPC moves the aircraft; then, with the owner
 * no longer able to write them, the service client revokes live record rooms and mechanic links and, when asked,
 * gives the old owner view access.
 */
export async function transfer(aircraftId: string, _p: ActionState, f: FormData): Promise<ActionState> {
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter the new owner's email." };
  const { user } = await writeSession(aircraftId);
  if (!user) return { error: "Not signed in." };
  const r = await transferAircraft(aircraftId, email);
  if (r.error) return { error: r.error };
  let followUp = "ok";
  try {
    const svc = createServiceClient();
    const now = new Date().toISOString();
    await svc.from("record_room").update({ revoked_at: now }).eq("aircraft_id", aircraftId).is("revoked_at", null);
    await svc.from("mechanic_link").update({ revoked_at: now }).eq("aircraft_id", aircraftId).is("revoked_at", null);
    if (f.get("keep") === "on" && user.email)
      await svc.from("aircraft_share").insert({ aircraft_id: aircraftId, invited_email: user.email.toLowerCase(), role: "viewer", invited_by: user.id });
  } catch {
    // The aircraft has moved; only the clean-up failed. Say so on the hangar rather than undo a transfer.
    followUp = "partial";
  }
  revalidatePath("/dashboard");
  redirect(`/dashboard?transferred=${followUp}`);
}

/** Delete (owner): the typed tail must match; storage and rows go as in the current design's delete. */
export async function deleteIt(aircraftId: string, tail: string, _p: ActionState, f: FormData): Promise<ActionState> {
  if (!tailMatches(String(f.get("confirm") ?? ""), tail)) return { error: `Type ${tail} to confirm.` };
  const r = await deleteAircraft(aircraftId, "DELETE");
  if (r.error) return { error: r.error };
  redirect("/dashboard");
}

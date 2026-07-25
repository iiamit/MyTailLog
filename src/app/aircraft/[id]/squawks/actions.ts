"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SquawkSeverity } from "@/lib/database.types";

type Result = { ok: true } | { error: string };

const SEVERITIES: SquawkSeverity[] = ["low", "medium", "high"];
const path = (aircraftId: string) => `/aircraft/${aircraftId}/squawks`;

/** Report a squawk. Anyone with access (incl. a read-only pilot) may report. */
export async function addSquawk(
  aircraftId: string,
  input: { description: string; severity: SquawkSeverity },
): Promise<Result> {
  const description = input.description.trim();
  if (!description) return { error: "Describe the issue." };
  const severity = SEVERITIES.includes(input.severity) ? input.severity : "low";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // Display name for the reporter, captured at report time.
  const { data: profile } = await supabase.from("profile").select("full_name").eq("id", user.id).maybeSingle();
  const reporterName = profile?.full_name?.trim() || user.email || null;

  // RLS (squawk_report) enforces access + reported_by = auth.uid().
  const { error } = await supabase.from("squawk").insert({
    aircraft_id: aircraftId,
    description,
    severity,
    reported_by: user.id,
    reporter_name: reporterName,
  });
  if (error) return { error: error.message };
  revalidatePath(path(aircraftId));
  return { ok: true };
}

/** Resolve a squawk — editors only (RLS: squawk_manage_update). */
export async function resolveSquawk(
  aircraftId: string,
  id: string,
  resolutionNotes?: string,
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("squawk")
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolved_by: user?.id ?? null,
      resolution_notes: resolutionNotes?.trim() || null,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(path(aircraftId));
  return { ok: true };
}

export async function reopenSquawk(aircraftId: string, id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("squawk")
    .update({ status: "open", resolved_at: null, resolved_by: null, resolution_notes: null })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(path(aircraftId));
  return { ok: true };
}

export async function deleteSquawk(aircraftId: string, id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("squawk").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(path(aircraftId));
  return { ok: true };
}

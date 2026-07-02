"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AdKind, AdStatus } from "@/lib/database.types";
import { computeNextDue } from "@/lib/compliance";

export type AdInput = {
  id?: string;
  kind: AdKind;
  reference: string;
  title: string | null;
  applicability: string | null;
  recurring: boolean;
  interval_hours: number | null;
  interval_months: number | null;
  status: AdStatus;
  method: string | null;
  complied_date: string | null;
  complied_hours: number | null;
  notes: string | null;
};

type Result = { ok: true } | { error: string };

function compliancePath(aircraftId: string) {
  return `/aircraft/${aircraftId}/compliance`;
}

/** Add or update an AD/SB record. Next-due is derived from the interval and
 *  last compliance so the forecasting view can sort by it. */
export async function upsertAdRecord(
  aircraftId: string,
  input: AdInput,
): Promise<Result> {
  if (!input.reference.trim()) return { error: "AD/SB number is required." };
  const supabase = await createClient();
  const due = computeNextDue(input);
  const row = {
    aircraft_id: aircraftId,
    kind: input.kind,
    reference: input.reference.trim(),
    title: input.title,
    applicability: input.applicability,
    recurring: input.recurring,
    interval_hours: input.interval_hours,
    interval_months: input.interval_months,
    status: input.status,
    method: input.method,
    complied_date: input.complied_date,
    complied_hours: input.complied_hours,
    next_due_date: due.next_due_date,
    next_due_hours: due.next_due_hours,
    notes: input.notes,
  };
  const { error } = input.id
    ? await supabase.from("ad_compliance").update(row).eq("id", input.id)
    : await supabase.from("ad_compliance").insert(row);
  if (error) return { error: error.message };
  revalidatePath(compliancePath(aircraftId));
  revalidatePath(`/aircraft/${aircraftId}`);
  return { ok: true };
}

export async function deleteAdRecord(
  aircraftId: string,
  id: string,
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("ad_compliance").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(compliancePath(aircraftId));
  return { ok: true };
}

/** Start tracking an AD/SB number found in the logs — creates an open record. */
export async function trackRef(
  aircraftId: string,
  kind: AdKind,
  reference: string,
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("ad_compliance").insert({
    aircraft_id: aircraftId,
    kind,
    reference: reference.trim(),
    status: "open",
  });
  if (error) return { error: error.message };
  revalidatePath(compliancePath(aircraftId));
  return { ok: true };
}

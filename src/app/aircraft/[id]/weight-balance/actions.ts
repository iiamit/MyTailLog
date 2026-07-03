"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { completeWB } from "@/lib/weightBalance";

export type WBInput = {
  id?: string;
  revision_date: string;
  empty_weight: number | null;
  empty_weight_arm: number | null;
  empty_weight_moment: number | null;
  max_gross_weight: number | null;
  method: "weighed" | "computed" | null;
  reference: string | null;
  reason: string | null;
  notes: string | null;
};

type Result = { ok: true } | { error: string };
const wbPath = (id: string) => `/aircraft/${id}/weight-balance`;

export async function upsertWeightBalance(
  aircraftId: string,
  input: WBInput,
): Promise<Result> {
  if (!input.revision_date) return { error: "Revision date is required." };
  // Derive the missing one of weight/arm/moment so stored rows are consistent.
  const { weight, arm, moment } = completeWB({
    weight: input.empty_weight,
    arm: input.empty_weight_arm,
    moment: input.empty_weight_moment,
  });
  const supabase = await createClient();
  const row = {
    aircraft_id: aircraftId,
    revision_date: input.revision_date,
    empty_weight: weight,
    empty_weight_arm: arm,
    empty_weight_moment: moment,
    max_gross_weight: input.max_gross_weight,
    method: input.method,
    reference: input.reference,
    reason: input.reason,
    notes: input.notes,
  };
  const { error } = input.id
    ? await supabase.from("weight_balance").update(row).eq("id", input.id)
    : await supabase.from("weight_balance").insert(row);
  if (error) return { error: error.message };
  revalidatePath(wbPath(aircraftId));
  revalidatePath(`/aircraft/${aircraftId}`);
  return { ok: true };
}

export async function deleteWeightBalance(
  aircraftId: string,
  id: string,
): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("weight_balance").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(wbPath(aircraftId));
  revalidatePath(`/aircraft/${aircraftId}`);
  return { ok: true };
}

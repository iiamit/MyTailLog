"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type OilTopOffInput = {
  added_date: string;
  quarts: number;
  hobbs: number | null;
  tach: number | null;
  notes: string | null;
};

type Result = { ok: true } | { error: string };

export async function addOilTopOff(aircraftId: string, input: OilTopOffInput): Promise<Result> {
  if (!(input.quarts > 0)) return { error: "Enter how many quarts were added." };
  if (!input.added_date) return { error: "Pick a date." };
  const supabase = await createClient();
  // RLS (can_edit_aircraft) also enforces this; the check gives a clean message.
  const { data: canEdit } = await supabase.rpc("can_edit_aircraft", { target_aircraft: aircraftId });
  if (!canEdit) return { error: "You don't have edit access to this aircraft." };

  const { error } = await supabase.from("oil_addition").insert({
    aircraft_id: aircraftId,
    added_date: input.added_date,
    quarts: input.quarts,
    hobbs: input.hobbs,
    tach: input.tach,
    notes: input.notes,
  });
  if (error) return { error: error.message };
  revalidatePath(`/aircraft/${aircraftId}/oil-analysis`);
  return { ok: true };
}

export async function deleteOilTopOff(aircraftId: string, id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("oil_addition").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/aircraft/${aircraftId}/oil-analysis`);
  return { ok: true };
}

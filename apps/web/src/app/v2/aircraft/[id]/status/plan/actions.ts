"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** "Use as my usual flying" (W-STATUS-03): saves aircraft.expected_hours_per_week. RLS limits it to owner and editors. */
export async function saveUsualFlying(aircraftId: string, hoursPerWeek: number): Promise<string> {
  if (!(hoursPerWeek >= 0 && hoursPerWeek <= 60) || Math.round(hoursPerWeek * 2) !== hoursPerWeek * 2) return "Hours a week is 0 to 60, in half hours.";
  const supabase = await createClient();
  const { data, error } = await supabase.from("aircraft").update({ expected_hours_per_week: hoursPerWeek }).eq("id", aircraftId).select("id");
  if (error || !data?.length) return "You don't have edit access to this aircraft.";
  revalidatePath(`/aircraft/${aircraftId}/status`);
  return `Saved. ${hoursPerWeek} h a week is now your usual flying.`;
}

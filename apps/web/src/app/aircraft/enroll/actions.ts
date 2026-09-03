"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { failMessage } from "@/lib/writes/entries";
import * as aircraft from "@/lib/writes/aircraft";

// Thin wrapper over lib/writes/aircraft.enroll (CONTRACT §4). The phone uses
// POST /api/aircraft/enroll, which calls the same function.

export type EnrollResult = { error: string } | never;

export async function enrollAircraft(formData: FormData): Promise<EnrollResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const aircraftId = crypto.randomUUID();
  const r = await aircraft.enroll(supabase, { aircraftId, userId: user.id }, Object.fromEntries(formData.entries()));
  if (r.status !== "ok") return { error: failMessage(r) };

  revalidatePath("/dashboard");
  redirect(`/aircraft/${aircraftId}`);
}

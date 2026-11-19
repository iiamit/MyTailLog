"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { failMessage } from "@/lib/writes/entries";
import * as aircraft from "@/lib/writes/aircraft";

/** W-HANGAR-02: the same enroll write as v1 and the phone (lib/writes/aircraft), then straight on to setup. */
export async function addAircraft(formData: FormData): Promise<{ error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/aircraft/new");
  const aircraftId = crypto.randomUUID();
  const r = await aircraft.enroll(supabase, { aircraftId, userId: user.id }, Object.fromEntries(formData.entries()));
  if (r.status !== "ok") return { error: failMessage(r) };
  revalidatePath("/hangar");
  redirect(`/aircraft/${aircraftId}/setup`);
}

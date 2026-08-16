"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { error: string };

/**
 * Remove a SHARED aircraft from your own dashboard by dropping your own grant.
 *
 * This deletes nothing but your access — not the aircraft, not a single record,
 * and not anyone else's grant. It exists because the demo aircraft is auto-shared
 * read-only with every new account (0026) and, until 0053, there was no way to
 * get rid of it: a viewer could see their grant but not drop it.
 *
 * An OWNER can't use this — they have no share row to delete, and the delete
 * simply matches nothing. Deleting an aircraft you own is a different, far more
 * destructive operation and is deliberately not this.
 */
export async function leaveSharedAircraft(aircraftId: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not signed in." };

  // RLS (0053) already restricts this to rows addressed to the caller; matching
  // on the email too keeps the intent obvious at the call site.
  const { data, error } = await supabase
    .from("aircraft_share")
    .delete()
    .eq("aircraft_id", aircraftId)
    .ilike("invited_email", user.email)
    .select("id");
  if (error) return { error: error.message };
  // RLS turns a disallowed delete into zero rows rather than an error, so an
  // empty result is "that wasn't yours to remove", not success.
  if (!data || data.length === 0) {
    return { error: "That aircraft isn't shared with you — an aircraft you own can't be removed here." };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

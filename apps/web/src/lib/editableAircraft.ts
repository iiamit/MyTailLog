import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type Aircraft = {
  id: string;
  tail_number: string;
  enrollment_hobbs: number | null;
  enrollment_tach: number | null;
  enrollment_airframe: number | null;
  enrollment_date: string | null;
};

/**
 * Aircraft accessible to this user, resolved WITHOUT a JWT (service role bypasses
 * RLS). Reminders require a real aircraft the user owns or can edit.
 */
export async function editableAircraft(
  supabase: SupabaseClient<Database>,
  userId: string,
  email: string | undefined,
  remindersOnly = false,
): Promise<Aircraft[]> {
  const byId = new Map<string, Aircraft>();

  let ownedQuery = supabase
    .from("aircraft")
    .select("id, tail_number, enrollment_hobbs, enrollment_tach, enrollment_airframe, enrollment_date")
    .eq("owner_id", userId);
  if (remindersOnly) ownedQuery = ownedQuery.eq("is_demo", false);
  const { data: owned, error: ownedError } = await ownedQuery;
  if (ownedError) throw ownedError;
  for (const a of owned ?? []) byId.set(a.id, a);

  if (email) {
    let sharesQuery = supabase
      .from("aircraft_share")
      .select("aircraft_id")
      .ilike("invited_email", email.replace(/[\\%_]/g, "\\$&"));
    // Service-role writes must obey the same owner/editor rule as the manual sync route.
    sharesQuery = sharesQuery.eq("role", "editor");
    const { data: shares, error: sharesError } = await sharesQuery;
    if (sharesError) throw sharesError;
    const ids = (shares ?? []).map((s) => s.aircraft_id).filter((id) => !byId.has(id));
    if (ids.length) {
      let sharedQuery = supabase
        .from("aircraft")
        .select("id, tail_number, enrollment_hobbs, enrollment_tach, enrollment_airframe, enrollment_date")
        .in("id", ids);
      if (remindersOnly) sharedQuery = sharedQuery.eq("is_demo", false);
      const { data: shared, error: sharedError } = await sharedQuery;
      if (sharedError) throw sharedError;
      for (const a of shared ?? []) byId.set(a.id, a);
    }
  }
  return [...byId.values()];
}

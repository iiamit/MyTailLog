import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ShareRole } from "./database.types";

export type AircraftRole = "owner" | ShareRole;

/**
 * The signed-in user's role on an aircraft. RLS has already gated the row, so
 * this is only for UI (badges, hiding edit controls) — never the security
 * boundary. `ownerId` is the aircraft's owner_id, already loaded by the caller.
 */
export async function getAircraftRole(
  supabase: SupabaseClient<Database>,
  aircraftId: string,
  ownerId: string,
): Promise<AircraftRole> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && user.id === ownerId) return "owner";

  const email = user?.email?.toLowerCase();
  if (email) {
    const { data } = await supabase
      .from("aircraft_share")
      .select("role")
      .eq("aircraft_id", aircraftId)
      .eq("invited_email", email)
      .maybeSingle();
    if (data) return data.role as ShareRole;
  }
  // Reached the row via RLS but no explicit grant found → safest is read-only.
  return "viewer";
}

export const canEditRole = (role: AircraftRole) =>
  role === "owner" || role === "editor";

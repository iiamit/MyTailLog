import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { callsInLastDay, dailyCallCap } from "@/lib/extraction/aiContext";

// Which aircraft the caller may EDIT, not just see — plus their AI allowance.
//
// The device needs this because RLS makes a viewer's write match zero rows
// rather than fail — a silent no-op. Without it the app would show Save buttons
// to a co-owner with viewer access, and they'd appear to work: the row would
// queue, drain, and vanish. `aircraft_access` isn't in SYNCED_TABLES, so the
// device can't derive this locally.
//
// Authoritative permission still lives in RLS on the write path. This is purely
// so the UI doesn't offer an action that is going to be refused.
//
// `allowance` is the same rolling-24h number the profile page shows
// (callsToday / dailyCap), so the Extract button on the phone can say how many
// extractions are left before the cap that will actually stop it.
export const runtime = "nodejs";

export async function GET(req: Request) {
  const supabase = await createSyncClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // RLS already scopes this to aircraft the user can see at all.
  const [{ data: aircraft, error }, { data: key }, { data: usage }] = await Promise.all([
    supabase.from("aircraft").select("id"),
    // key_last4 only — the ciphertext lives in a private schema (0039).
    supabase.rpc("my_ai_key_metadata"),
    supabase.from("ai_usage").select("created_at"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Reuse the same SECURITY DEFINER function the RLS policies call, rather than
  // re-deriving owner/share logic here — two copies of a permission rule is how
  // one of them ends up wrong.
  const access = await Promise.all(
    (aircraft ?? []).map(async (a) => {
      const { data } = await supabase.rpc("can_edit_aircraft", { target_aircraft: a.id });
      return { aircraft_id: a.id, can_edit: data === true };
    }),
  );

  const allowance = {
    callsToday: callsInLastDay(usage ?? []),
    dailyCap: dailyCallCap(Boolean(key?.last4)),
  };

  return NextResponse.json({ access, allowance });
}

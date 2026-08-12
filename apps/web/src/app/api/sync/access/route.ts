import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";

// Which aircraft the caller may EDIT, not just see.
//
// The device needs this because RLS makes a viewer's write match zero rows
// rather than fail — a silent no-op. Without it the app would show Save buttons
// to a co-owner with viewer access, and they'd appear to work: the row would
// queue, drain, and vanish. `aircraft_access` isn't in SYNCED_TABLES, so the
// device can't derive this locally.
//
// Authoritative permission still lives in RLS on the write path. This is purely
// so the UI doesn't offer an action that is going to be refused.
export const runtime = "nodejs";

export async function GET(req: Request) {
  const supabase = await createSyncClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // RLS already scopes this to aircraft the user can see at all.
  const { data: aircraft, error } = await supabase.from("aircraft").select("id");
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

  return NextResponse.json({ access });
}

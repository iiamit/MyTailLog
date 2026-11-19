import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { openConflicts } from "@/lib/sync/v2";

// GET /api/sync/v2/conflicts → { conflicts: [{mutationId, aircraftId, type, base, at}] }
// The caller's undecided conflicts (09 §5.5), so another device or the web can say "1 change needs a decision".
export const runtime = "nodejs";

export async function GET(req: Request) {
  const supabase = await createSyncClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "not_signed_in" }, { status: 401 });
  const r = await openConflicts(supabase, user.id);
  if ("error" in r) return NextResponse.json({ error: r.error, code: "server_error" }, { status: 500 });
  return NextResponse.json(r);
}

import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { resolveConflict } from "@/lib/sync/v2";

// POST /api/sync/v2/conflicts/{mutationId} { resolution: 'take_theirs'|'discard' } → { ok: true }
// Closes a conflict record when the device drops its change. Keeping yours is a re-push with the new base.
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ mutationId: string }> }) {
  const { mutationId } = await params;
  const supabase = await createSyncClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "not_signed_in" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { resolution?: unknown } | null;
  const r = await resolveConflict(supabase, user.id, mutationId, body?.resolution);
  return NextResponse.json(r.body, { status: r.status });
}

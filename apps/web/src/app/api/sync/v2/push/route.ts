import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { pushV2 } from "@/lib/sync/v2";

// POST /api/sync/v2/push  (09 §5.3, §5.5)
// Body { mutations: [{id, type, aircraftId, payload, base?, resolution?}] } (≤ 100)
// → { results: [{id, status: 'ok'|'conflict'|'error', row?, error?, code?, replayed?}] }, same order.
// `resolution: 'keep_both'` marks a re-push made from "Keep both changes" (default keep_mine).
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const supabase = await createSyncClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "not_signed_in" }, { status: 401 });

  const r = await pushV2(supabase, user.id, await req.json().catch(() => null));
  return NextResponse.json(r.body, { status: r.status });
}

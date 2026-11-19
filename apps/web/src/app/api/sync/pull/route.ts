import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { pullChanges, pullParams } from "@/lib/sync/pull";

// GET /api/sync/pull?cursor=<seq>&limit=<n>  (v1 — the Capacitor app)
//
// The offline client's read path. Returns every change to the caller's accessible
// aircraft with seq > cursor, collapsed to the latest state per record: `upsert`
// (with the current row) or `delete`. The client applies the changes, stores
// `nextCursor`, and loops while `hasMore`. Idempotent — safe to re-pull.
// v2 (/api/sync/v2/pull) shares lib/sync/pull.ts and adds 410 resync_required.
export const runtime = "nodejs";

export async function GET(req: Request) {
  const supabase = await createSyncClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { cursor, limit } = pullParams(req.url);
  const page = await pullChanges(supabase, user.id, cursor, limit);
  if ("error" in page) return NextResponse.json({ error: page.error }, { status: 500 });
  return NextResponse.json(page);
}

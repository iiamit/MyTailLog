import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { createServiceClient } from "@/lib/supabase/service";
import { pullParams } from "@/lib/sync/pull";
import { pullV2 } from "@/lib/sync/v2";

// GET /api/sync/v2/pull?cursor=<seq>&limit=<n≤1000>  (09 §5.1, §5.4)
// → { changes, nextCursor, hasMore, serverTime, minAppVersion }
// → 410 { code: 'resync_required' } when the cursor predates pruned history:
//   the phone keeps its outbox, drops its mirror and pulls from 0.
export const runtime = "nodejs";

export async function GET(req: Request) {
  const supabase = await createSyncClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "not_signed_in" }, { status: 401 });

  const { cursor, limit } = pullParams(req.url);
  // sync_retention is service-role only (0084). No row (or an error) means nothing was pruned.
  const { data: retention } = await createServiceClient().from("sync_retention").select("min_seq_retained").maybeSingle();
  const r = await pullV2(supabase, user.id, cursor, limit, Number(retention?.min_seq_retained ?? 0), process.env.SYNC_MIN_APP_VERSION || null);
  return NextResponse.json(r.body, { status: r.status });
}

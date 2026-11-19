import { NextResponse, after } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { pushV2 } from "@/lib/sync/v2";
import { readQueuedPages } from "@/lib/extraction/queue";

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

  const body = await req.json().catch(() => null);
  const r = await pushV2(supabase, user.id, body);
  // Registered pages start reading without waiting for the minute cron (09 §3.9.1 "insert webhook").
  if (r.status === 200 && r.body.results.some((x, i) => x.status === "ok" && (body as { mutations: { type?: string }[] }).mutations[i]?.type === "page.register")) {
    after(() => readQueuedPages().catch((e) => console.error("reader kick failed", e)));
  }
  return NextResponse.json(r.body, { status: r.status });
}

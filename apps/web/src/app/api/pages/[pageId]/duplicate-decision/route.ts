import { NextResponse, after } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { duplicateDecision } from "@/lib/writes/pages";
import { readQueuedPages } from "@/lib/extraction/queue";

// POST /api/pages/{pageId}/duplicate-decision { decision: 'keep_both'|'skip' } → { ok: true }
// (09 §4.8, §3.9.3). Online path of `page.duplicateDecision`; same write function.
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const supabase = await createSyncClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "not_signed_in" }, { status: 401 });
  const { data: page } = await supabase.from("page").select("aircraft_id").eq("id", pageId).maybeSingle();
  if (!page) return NextResponse.json({ error: "Page not found.", code: "not_found" }, { status: 404 });
  const b = ((await req.json().catch(() => null)) ?? {}) as { decision?: "keep_both" | "skip" };
  const r = await duplicateDecision(supabase, { aircraftId: page.aircraft_id, userId: user.id }, { pageId, decision: b.decision as "keep_both" });
  if (r.status === "error") {
    return NextResponse.json({ error: r.message, code: r.httpStatus === 403 ? "viewer_read_only" : "invalid" }, { status: r.httpStatus ?? 500 });
  }
  if (b.decision === "keep_both") after(() => readQueuedPages().catch((e) => console.error("reader kick failed", e)));
  return NextResponse.json({ ok: true });
}

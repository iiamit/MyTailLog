import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { sharedAiPaused } from "@/lib/extraction/aiContext";
import { allowanceSummary } from "@/lib/extraction/allowance";
import { batchProgress } from "@/lib/extraction/queueRules";
import type { Page } from "@/lib/database.types";

// GET /api/aircraft/{id}/reading-queue  (09 §4.8) — polled every 5 s by the web
// queue and by phones while pages are in flight (reading progress).
// → { batches: [{id, logbook, logbookId, createdAt, expected, uploaded, queued, reading,
//      waitingAllowance, read, failed, needsLook, waitingDecision, completedAt}],
//    allowance: {usedCalls, capCalls, pagesUsedApprox, pagesCapApprox, nextFreeAt, ownKey, globalPaused} }
// The allowance is the caller's own (rolling 24 hours).
export const runtime = "nodejs";

const RECENT_BATCHES = 20;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSyncClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "not_signed_in" }, { status: 401 });

  const [{ data: aircraft }, { data: batches, error }, { data: key }, { data: usage }] = await Promise.all([
    supabase.from("aircraft").select("id").eq("id", id).maybeSingle(),
    supabase.from("scan_batch").select("id, logbook_id, expected_pages, created_at, completed_at")
      .eq("aircraft_id", id).order("created_at", { ascending: false }).limit(RECENT_BATCHES),
    supabase.rpc("my_ai_key_metadata"),
    supabase.from("ai_usage").select("created_at").eq("user_id", user.id).gt("created_at", new Date(Date.now() - 86_400_000).toISOString()),
  ]);
  if (!aircraft) return NextResponse.json({ error: "Aircraft not found.", code: "not_found" }, { status: 404 });
  if (error) return NextResponse.json({ error: error.message, code: "server_error" }, { status: 500 });

  const ids = (batches ?? []).map((b) => b.id);
  const [{ data: pages }, { data: books }] = await Promise.all([
    ids.length
      ? supabase.from("page").select("batch_id, extraction_status, needs_look, duplicate_of_page_id").in("batch_id", ids)
      : Promise.resolve({ data: [] as Pick<Page, "batch_id" | "extraction_status" | "needs_look" | "duplicate_of_page_id">[] }),
    supabase.from("logbook").select("id, type").eq("aircraft_id", id),
  ]);
  const bookType = new Map((books ?? []).map((b) => [b.id, b.type]));

  const ownKey = Boolean(key?.last4);
  return NextResponse.json({
    batches: (batches ?? []).map((b) => ({
      id: b.id,
      logbook: bookType.get(b.logbook_id) ?? null,
      logbookId: b.logbook_id,
      createdAt: b.created_at,
      ...batchProgress((pages ?? []).filter((p) => p.batch_id === b.id), b.expected_pages),
      completedAt: b.completed_at,
    })),
    allowance: allowanceSummary(usage ?? [], ownKey, !ownKey && (await sharedAiPaused(supabase))),
  });
}

import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { loadDueInput } from "@/lib/due/load";
import { gapEvidence, type StoredGap } from "@/lib/gaps";

// GET /api/aircraft/{id}/gaps/{gapId}/evidence → what the other books show (09 §3.8, §4.7; W-BOOKS-04, M-BOOKS-04).
// Read through RLS as the caller; computed on read from confirmed entries only.
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string; gapId: string }> }) {
  const { id, gapId } = await params;
  const supabase = await createSyncClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "unauthorized" }, { status: 401 });

  let loaded;
  try {
    loaded = await loadDueInput(supabase, id, user.id);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  const gap = loaded?.input.logbook_gap?.find((g) => g.id === gapId);
  if (!loaded || !gap) return NextResponse.json({ error: "Gap not found.", code: "not_found" }, { status: 404 });

  const evidence = gapEvidence({
    gap: gap as StoredGap & { note: string | null },
    logbook: loaded.input.logbook ?? [],
    log_entry: loaded.input.log_entry ?? [],
    page: loaded.input.page ?? [],
  });
  if (!evidence) return NextResponse.json({ error: "Gap not found.", code: "not_found" }, { status: 404 });
  return NextResponse.json(evidence, { headers: { "Cache-Control": "private, no-store" } });
}

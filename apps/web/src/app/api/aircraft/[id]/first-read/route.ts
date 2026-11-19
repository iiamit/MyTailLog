import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { loadDueInput } from "@/lib/due/load";
import { firstRead } from "@/lib/firstRead";

// GET /api/aircraft/{id}/first-read?logbookId= (09 §4.7, W-BOOKS-09, 08 §3.7)
//   → { logbookId, ready, pages, pagesToReview, pagesBeingRead, from, to, findings, nextBook, aiPartial }.
// Read through RLS as the caller (viewers too); computed on read from confirmed entries only.
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const logbookId = new URL(req.url).searchParams.get("logbookId");
  if (!logbookId) return NextResponse.json({ error: "Which logbook?", code: "bad_request" }, { status: 400 });
  const supabase = await createSyncClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "unauthorized" }, { status: 401 });

  let loaded;
  try {
    loaded = await loadDueInput(supabase, id, user.id);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  const body = loaded ? firstRead(loaded.input, logbookId) : null;
  if (!body) return NextResponse.json({ error: "Logbook not found.", code: "not_found" }, { status: 404 });
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}

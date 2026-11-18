import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { computeStatus } from "@/lib/due/engine";
import { loadDueInput } from "@/lib/due/load";

// GET /api/aircraft/{id}/status[?fresh=1] → StatusSnapshot (09 §4.2, 4.3).
// Reads through RLS as the caller, so viewers get the status and strangers a 404.
// Always computed on request: snapshot rows are written by the service role only
// (0083), and this route never uses it. shortcut: `fresh` is accepted and
// ignored, until the debounced snapshot writer (09 §2.15) lands.
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSyncClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "unauthorized" }, { status: 401 });

  try {
    const loaded = await loadDueInput(supabase, id, user.id);
    if (!loaded) return NextResponse.json({ error: "Aircraft not found.", code: "not_found" }, { status: 404 });
    const body = computeStatus(loaded.input, loaded.today);
    return NextResponse.json(
      { ...body, computedAt: new Date().toISOString(), inputsSeq: loaded.inputsSeq },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "We could not work out what is due right now. Try again.", code: "status_failed" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { buildSummary, loadShareInput } from "@/lib/share/model";
import { summaryPdf, pdfResponse } from "@/lib/pdf/render";

// GET /api/aircraft/{id}/summary[?format=json] → the maintenance summary (W-SHARE-04, M-SHARE share sheet) as a
// PDF, or its view model as JSON. Reads through RLS as the caller, so any role can print it; strangers get a 404.
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSyncClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "unauthorized" }, { status: 401 });
  try {
    const share = await loadShareInput(supabase, id, user.id);
    if (!share) return NextResponse.json({ error: "Aircraft not found.", code: "not_found" }, { status: 404 });
    const m = buildSummary(share, { includeReporters: true });
    if (new URL(req.url).searchParams.get("format") === "json") return NextResponse.json(m, { headers: { "Cache-Control": "private, no-store" } });
    return pdfResponse(await summaryPdf(m), `${m.tail}-maintenance-summary.pdf`);
  } catch (err) {
    console.error("[pdf] summary failed", err);
    // EXPOSE_SERVER_ERRORS is set only on the test backend (apphosting.mfb_test.yaml), never in production.
    const detail = process.env.EXPOSE_SERVER_ERRORS === "1" ? { detail: String(err) } : {};
    return NextResponse.json({ ...detail, error: "We could not make the summary right now. Try again.", code: "summary_failed" }, { status: 500 });
  }
}

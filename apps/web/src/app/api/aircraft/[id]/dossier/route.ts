import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { buildDossier, loadShareInput } from "@/lib/share/model";
import { dossierPdf, pdfResponse } from "@/lib/pdf/render";

// GET /api/aircraft/{id}/dossier[?format=json][&for=J.%20Okafor] → the pre-buy dossier (W-SHARE-03) as a US Letter
// PDF on light paper, or its view model as JSON for the screens. RLS as the caller; strangers get a 404.
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSyncClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams;
  try {
    const share = await loadShareInput(supabase, id, user.id);
    if (!share) return NextResponse.json({ error: "Aircraft not found.", code: "not_found" }, { status: 404 });
    const m = buildDossier(share, { preparedFor: q.get("for")?.trim().slice(0, 80) || null });
    if (q.get("format") === "json") return NextResponse.json(m, { headers: { "Cache-Control": "private, no-store" } });
    return pdfResponse(await dossierPdf(m), `${m.tail}-pre-buy-dossier.pdf`);
  } catch {
    return NextResponse.json({ error: "We could not make the dossier right now. Try again.", code: "dossier_failed" }, { status: 500 });
  }
}

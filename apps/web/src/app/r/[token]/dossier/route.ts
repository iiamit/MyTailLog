import { buildDossier } from "@/lib/share/model";
import { dossierPdf, pdfResponse } from "@/lib/pdf/render";
import { roomShare } from "@/lib/share/room";

// GET /r/{token}/dossier → the pre-buy dossier PDF (W-SHARE-03) when the room includes it. No account.
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const r = await roomShare(req, (await params).token, "dossier");
  if (r instanceof Response) return r;
  const m = buildDossier(r.share, { preparedFor: r.room.label });
  return pdfResponse(await dossierPdf(m), `${m.tail}-pre-buy-dossier.pdf`);
}

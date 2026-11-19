import { buildSummary } from "@/lib/share/model";
import { summaryPdf, pdfResponse } from "@/lib/pdf/render";
import { roomShare } from "@/lib/share/room";

// GET /r/{token}/summary → the maintenance summary PDF (W-SHARE-04) when the room includes it. No account.
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const r = await roomShare(req, (await params).token, "summary");
  if (r instanceof Response) return r;
  const m = buildSummary(r.share, { includeSquawks: r.room.include_squawks, includeReporters: r.room.include_reporters });
  return pdfResponse(await summaryPdf(m), `${m.tail}-maintenance-summary.pdf`);
}

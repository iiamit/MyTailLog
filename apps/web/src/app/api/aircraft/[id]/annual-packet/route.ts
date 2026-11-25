import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { loadAnnualPacket } from "@/lib/annualPacketLoad";
import { PACKET_MAX_BYTES, selectPacketEvidence } from "@/lib/annualPacket";
import { annualArchive } from "@/lib/annualArchive";
import { annualPacketPdf, pdfResponse } from "@/lib/pdf/render";
import { blobSize, getBlob } from "@/lib/storage";
import { ownerJson } from "@/lib/owner/body";
import { publicOrigin } from "@/lib/publicOrigin";

export const runtime = "nodejs";
export const maxDuration = 300;
const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ id: string }> };

async function respond(req: Request, context: Context, selection?: unknown) {
  const { id } = await context.params;
  const client = await createSyncClient(req);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: "Not signed in." },
      { status: 401, headers },
    );
  const query = new URL(req.url).searchParams;
  const format = selection ? "zip" : (query.get("format") ?? "pdf");
  if (!["json", "pdf", "zip"].includes(format))
    return NextResponse.json(
      { error: "Choose PDF, JSON or an evidence ZIP." },
      { status: 400, headers },
    );
  try {
    const loaded = await loadAnnualPacket(client, id, user.id);
    if (!loaded)
      return NextResponse.json(
        { error: "Aircraft not found." },
        { status: 404, headers },
      );
    const { packet, paths } = loaded;
    const cutoff =
      query.get("cutoff") ||
      (selection as { cutoff?: string } | undefined)?.cutoff;
    if (cutoff && cutoff !== packet.cutoff)
      return NextResponse.json(
        {
          error:
            "This packet reflects today's records. Historical snapshots are not supported.",
        },
        { status: 400, headers },
      );
    if (format === "json") return NextResponse.json(packet, { headers });
    let chosen;
    try {
      chosen = selectPacketEvidence(
        packet,
        selection ?? { pageIds: [], documentIds: [] },
      );
    } catch (error) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status: 400, headers },
      );
    }
    let bytes = 0;
    for (const source of chosen) {
      const size = await blobSize(
        paths.get(`${source.kind}:${source.id}`)!,
        id,
      );
      if (size == null)
        return NextResponse.json(
          {
            error: `Source file is missing: ${source.label}. Retry or remove it from the selection.`,
          },
          { status: 409, headers },
        );
      bytes += size;
      if (bytes > PACKET_MAX_BYTES - 5 * 1024 * 1024)
        return NextResponse.json(
          {
            error:
              "Choose fewer files; the packet limit is 100 MB including the summary.",
          },
          { status: 413, headers },
        );
    }
    const pdf = await annualPacketPdf(packet);
    const filename = `${packet.tail.replace(/[^\w-]/g, "_")}-annual-packet`;
    if (format === "pdf") return pdfResponse(pdf, `${filename}.pdf`);
    return new Response(
      annualArchive(packet, pdf, chosen, async (source) => {
        const blob = await getBlob(
          paths.get(`${source.kind}:${source.id}`)!,
          id,
        );
        return blob?.data ?? null;
      }),
      {
        headers: {
          ...headers,
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${filename}.zip"`,
        },
      },
    );
  } catch (error) {
    console.error("[annual-packet] failed", error);
    return NextResponse.json(
      { error: "The annual packet could not be prepared. Try again." },
      { status: 500, headers },
    );
  }
}
export async function GET(req: Request, context: Context) {
  return respond(req, context);
}
export async function POST(req: Request, context: Context) {
  const origin = req.headers.get("origin");
  if (origin && origin !== publicOrigin(req))
    return NextResponse.json(
      { error: "Open this aircraft in MyTailLog to prepare a packet." },
      { status: 403, headers },
    );
  let body;
  try {
    body = await ownerJson(req, 32768);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof RangeError
            ? "The selection is too large."
            : "Choose an evidence ZIP and its files.",
      },
      { status: error instanceof RangeError ? 413 : 400, headers },
    );
  }
  if (!body || body.format !== "zip")
    return NextResponse.json(
      { error: "Choose an evidence ZIP and its files." },
      { status: 400, headers },
    );
  return respond(req, context, body);
}

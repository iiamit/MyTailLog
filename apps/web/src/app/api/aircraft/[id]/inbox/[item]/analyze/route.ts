import { NextResponse } from "next/server";
import { ownerAccess, ownerError } from "@/lib/owner/access";
import { getBlob } from "@/lib/storage";
import { analyzeInbox } from "@/lib/owner/analyze";
import {
  prepareAi,
  reserveAiCall,
  releaseAiReservation,
  runWithAiContext,
  logAiUsage,
  aiBudgetMessage,
} from "@/lib/extraction/aiContext";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; item: string }> },
) {
  const { id, item } = await params,
    a = await ownerAccess(req, id, "edit");
  if (a.response) return a.response;
  const { data: source, error: readError } = await a.supabase
    .from("aircraft_inbox")
    .select("*")
    .eq("id", item)
    .eq("aircraft_id", id)
    .maybeSingle();
  if (readError) return ownerError(new Error(readError.message), 503);
  if (!source) return ownerError(new Error("Inbox item not found."), 404);
  if (source.state === "approved")
    return ownerError(new Error("This upload is already approved."), 409);
  const gate = await prepareAi(a.supabase, a.user.id);
  if ("error" in gate) return ownerError(new Error(gate.error), gate.status);
  const now = new Date().toISOString(),
    lease = new Date(Date.now() + 125000).toISOString();
  const { data: claimed, error: claimError } = await a.supabase
    .from("aircraft_inbox")
    .update({ processing_until: lease, error: null })
    .eq("id", item)
    .eq("updated_at", source.updated_at)
    .or(`processing_until.is.null,processing_until.lt.${now}`)
    .select("*")
    .maybeSingle();
  if (claimError) return ownerError(new Error(claimError.message), 503);
  if (!claimed)
    return ownerError(
      new Error("This upload is being read. Retry in a moment."),
      409,
    );
  let reservation: string | null = null;
  try {
    const blob = await getBlob(source.storage_path, id);
    if (!blob) throw new Error("Original is temporarily unavailable.");
    reservation = await reserveAiCall(a.user.id, gate.ownKey, gate.provider);
    if (!reservation)
      return ownerError(new Error(aiBudgetMessage(gate.ownKey)), 429);
    const result = await runWithAiContext(
      {
        provider: gate.provider,
        apiKey: gate.apiKey,
        onUsage: (u) => logAiUsage(a.user.id, "inbox", u, gate.ownKey),
      },
      () => analyzeInbox(blob.data, source.mime_type),
    );
    const { data, error } = await a.supabase.rpc("complete_inbox_analysis", {
      p_aircraft: id,
      p_id: item,
      p_base: claimed.updated_at,
      p_kind: result.kind,
      p_proposal: result.proposal,
    });
    if (error) throw new Error(error.message);
    if (!data)
      return ownerError(
        new Error(
          "Upload changed while it was being read. Reload to keep your changes.",
        ),
        409,
      );
    return NextResponse.json({ item: data });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Document could not be read.";
    await a.supabase.rpc("complete_inbox_analysis", {
      p_aircraft: id,
      p_id: item,
      p_base: claimed.updated_at,
      p_kind: source.kind,
      p_proposal: source.proposal,
      p_error: message.slice(0, 500),
    });
    return ownerError(new Error(message), 503);
  } finally {
    await releaseAiReservation(reservation);
    await a.supabase
      .from("aircraft_inbox")
      .update({ processing_until: null })
      .eq("id", item)
      .eq("processing_until", lease);
  }
}

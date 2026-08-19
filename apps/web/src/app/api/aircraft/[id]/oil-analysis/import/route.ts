import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prepareAi, runWithAiContext, logAiUsage, reserveAiCall, releaseAiReservation, aiBudgetMessage } from "@/lib/extraction/aiContext";
import { extractOilAnalysis, oilReportToRows } from "@/lib/extraction/oilAnalysis";
import type { ImageMediaType } from "@/lib/extraction/extract";

export const runtime = "nodejs";
export const maxDuration = 120;

const ACCEPTED = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
// Bound memory + cost: the whole file is buffered and base64'd to the model.
// Anthropic's own PDF ceiling is 32 MB; 20 leaves margin.
const MAX_BYTES = 20 * 1024 * 1024;

// Import an oil analysis report (PDF or photo). Extracts every sample via Claude
// and upserts one oil_analysis_sample row per sample (dedup by date). RLS scopes
// writes to editors of this aircraft.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // RLS: no row means no access (or wrong aircraft).
  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("id, tail_number")
    .eq("id", id)
    .single();
  if (!aircraft) return NextResponse.json({ error: "Aircraft not found." }, { status: 404 });

  // Gate the PAID extraction on edit access — a read-only viewer can see the
  // aircraft but must not be able to spend an AI call (the writes would no-op
  // under RLS anyway). Check before prepareAi / the model call.
  const { data: canEdit } = await supabase.rpc("can_edit_aircraft", { target_aircraft: id });
  if (!canEdit) {
    return NextResponse.json(
      { error: "You don't have edit access to this aircraft." },
      { status: 403 },
    );
  }

  const gate = await prepareAi(supabase, user.id);
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Attach an oil analysis PDF or photo." }, { status: 400 });
  }
  if (!ACCEPTED.includes(file.type)) {
    return NextResponse.json(
      { error: "Unsupported file. Upload the lab's PDF, or a JPEG/PNG photo of the report." },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 20 MB)." }, { status: 413 });
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const mediaType = file.type as "application/pdf" | ImageMediaType;

  // Atomically claim a budget slot right before the paid call. Released below.
  const reservationId = await reserveAiCall(user.id, gate.ownKey, gate.provider);
  if (!reservationId) {
    return NextResponse.json({ error: aiBudgetMessage(gate.ownKey) }, { status: 429 });
  }

  let payload;
  try {
    payload = await runWithAiContext(
      {
        provider: gate.provider,
        apiKey: gate.apiKey,
        onUsage: (u) => logAiUsage(user.id, "oil-analysis", u, gate.ownKey),
      },
      () => extractOilAnalysis(base64, mediaType),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Oil report extraction failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await releaseAiReservation(reservationId);
  }

  const rows = oilReportToRows(payload, id);
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No dated samples were found in that report." },
      { status: 422 },
    );
  }

  // Upsert by (aircraft_id, sample_date): re-importing the same report updates in
  // place rather than duplicating. Low volume (a report has a handful of samples).
  let inserted = 0;
  let updated = 0;
  for (const row of rows) {
    const { data: existing } = await supabase
      .from("oil_analysis_sample")
      .select("id")
      .eq("aircraft_id", id)
      .eq("sample_date", row.sample_date!)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase.from("oil_analysis_sample").update(row).eq("id", existing.id);
      if (!error) updated++;
    } else {
      const { error } = await supabase.from("oil_analysis_sample").insert(row);
      if (!error) inserted++;
    }
  }

  return NextResponse.json({
    ok: true,
    inserted,
    updated,
    lab: payload.lab,
    // Surface the report's tail so the UI can warn if it doesn't match this aircraft.
    reportTail: payload.tail_number,
    aircraftTail: aircraft.tail_number,
    confidence: payload.confidence,
  });
}

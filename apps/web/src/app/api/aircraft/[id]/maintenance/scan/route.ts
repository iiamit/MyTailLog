import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { MaintenanceEntryInput } from "@/lib/extraction/maintenance";
import { applyMaintenanceFromEntries } from "@/lib/extraction/maintenanceUpdates";
import { prepareAi, runWithAiContext, logAiUsage, reserveAiCall, releaseAiReservation, aiBudgetMessage } from "@/lib/extraction/aiContext";
import { entryText } from "@/lib/extraction/entryText";

export const runtime = "nodejs";
// maxDuration is a Vercel-only hint. On Cloud Run / Firebase App Hosting the
// Cloud Run request timeout (default 300s) governs — enough for a full-history
// rescan. On Vercel Hobby this is capped to 60 and large scans may 504.
export const maxDuration = 300;

// Full-history pass: scan all entries and advance the maintenance forecast's
// last-done data from the logs. RLS scopes everything to the owner.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: aircraft } = await supabase.from("aircraft").select("id").eq("id", id).single();
  if (!aircraft) return NextResponse.json({ error: "Aircraft not found." }, { status: 404 });

  // Gate the PAID scan on edit access — a read-only viewer can see the aircraft
  // but must not be able to spend an AI call (the writes would no-op under RLS
  // anyway). Check before prepareAi / the model call.
  const { data: canEdit } = await supabase.rpc("can_edit_aircraft", { target_aircraft: id });
  if (!canEdit) {
    return NextResponse.json({ error: "You don't have edit access to this aircraft." }, { status: 403 });
  }

  const gate = await prepareAi(supabase, user.id);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  // Only advance the forecast from OWNER-CONFIRMED entries — unreviewed OCR must
  // not move a compliance signal (M3). The owner reviews entries, then scans.
  const { data: entries } = await supabase
    .from("log_entry")
    .select("id, entry_date, description, work_performed, parts")
    .eq("aircraft_id", id)
    .eq("owner_confirmed", true)
    .order("entry_date", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true });

  const inputs: MaintenanceEntryInput[] = (entries ?? [])
    .map((e) => ({
      entry_id: e.id,
      date: e.entry_date,
      text: entryText(e),
    }))
    .filter((e) => e.text.length > 0);

  if (inputs.length === 0) return NextResponse.json({ ok: true, updated: 0, entryCount: 0 });

  // Atomically claim a budget slot right before the paid call. Released below.
  const reservationId = await reserveAiCall(user.id, gate.ownKey, gate.provider);
  if (!reservationId) {
    return NextResponse.json({ error: aiBudgetMessage(gate.ownKey) }, { status: 429 });
  }

  try {
    const { updated, detected } = await runWithAiContext(
      {
        provider: gate.provider,
        apiKey: gate.apiKey,
        onUsage: (u) => logAiUsage(user.id, "maintenance-scan", u, gate.ownKey),
      },
      () => applyMaintenanceFromEntries(supabase, id, inputs),
    );
    return NextResponse.json({ ok: true, updated, detected, entryCount: inputs.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Maintenance scan failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await releaseAiReservation(reservationId);
  }
}

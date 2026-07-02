import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractionConfigured } from "@/lib/extraction/anthropic";
import {
  extractEquipmentFromEntries,
  type EquipmentEntryInput,
} from "@/lib/extraction/equipment";
import { logbookLabel } from "@/lib/logbooks";

export const runtime = "nodejs";
export const maxDuration = 300;

// Scan the aircraft's log entries and PROPOSE an equipment list. Read-only —
// the owner confirms proposals before anything is written (see the apply
// server action). RLS scopes every query to the owner.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!extractionConfigured()) {
    return NextResponse.json(
      { error: "Extraction isn't configured. Set ANTHROPIC_API_KEY." },
      { status: 501 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("id")
    .eq("id", id)
    .single();
  if (!aircraft) return NextResponse.json({ error: "Aircraft not found." }, { status: 404 });

  const { data: logbooks } = await supabase
    .from("logbook")
    .select("id, type, title")
    .eq("aircraft_id", id);
  const labelById = new Map(
    (logbooks ?? []).map((lb) => [lb.id, logbookLabel(lb.type, lb.title)]),
  );

  // Oldest first so the model can reconstruct the install/removal timeline.
  const { data: entries } = await supabase
    .from("log_entry")
    .select("id, logbook_id, entry_date, description, work_performed, parts")
    .eq("aircraft_id", id)
    .order("entry_date", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true });

  const inputs: EquipmentEntryInput[] = (entries ?? [])
    .map((e) => ({
      entry_id: e.id,
      date: e.entry_date,
      logbook: labelById.get(e.logbook_id) ?? "logbook",
      text: [e.description, e.work_performed, e.parts]
        .map((s) => s?.trim())
        .filter(Boolean)
        .join(" — "),
    }))
    .filter((e) => e.text.length > 0);

  if (inputs.length === 0) {
    return NextResponse.json({ ok: true, proposals: [], entryCount: 0 });
  }

  try {
    const proposals = await extractEquipmentFromEntries(inputs);
    return NextResponse.json({ ok: true, proposals, entryCount: inputs.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Equipment scan failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractionConfigured } from "@/lib/extraction/anthropic";
import type { MaintenanceEntryInput } from "@/lib/extraction/maintenance";
import { applyMaintenanceFromEntries } from "@/lib/extraction/maintenanceUpdates";
import { entryText } from "@/lib/extraction/entryText";

export const runtime = "nodejs";
export const maxDuration = 300;

// Full-history pass: scan all entries and advance the maintenance forecast's
// last-done data from the logs. RLS scopes everything to the owner.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!extractionConfigured()) {
    return NextResponse.json({ error: "Extraction isn't configured. Set ANTHROPIC_API_KEY." }, { status: 501 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { data: aircraft } = await supabase.from("aircraft").select("id").eq("id", id).single();
  if (!aircraft) return NextResponse.json({ error: "Aircraft not found." }, { status: 404 });

  const { data: entries } = await supabase
    .from("log_entry")
    .select("id, entry_date, description, work_performed, parts")
    .eq("aircraft_id", id)
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

  try {
    const { updated, detected } = await applyMaintenanceFromEntries(supabase, id, inputs);
    return NextResponse.json({ ok: true, updated, detected, entryCount: inputs.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Maintenance scan failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

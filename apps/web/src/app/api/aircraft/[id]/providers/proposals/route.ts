import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { providerProposals, type ProposalEntry } from "@/lib/writes/providers";

// GET /api/aircraft/{id}/providers/proposals (09 §2.4; W-MAINT-06 "Found in the logs") →
//   [{ name, certNumber, entries, lastDate }]: signers seen on ≥ 2 confirmed entries that are not a shop yet.
// Shown for the owner to add ("Add" sends push `provider.upsert`); never created by themselves.
// Providers themselves reach clients through sync pull (service_provider is a synced table).
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSyncClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "unauthorized" }, { status: 401 });
  const { data: aircraft } = await supabase.from("aircraft").select("id").eq("id", id).maybeSingle();
  if (!aircraft) return NextResponse.json({ error: "Aircraft not found.", code: "not_found" }, { status: 404 });

  const entries: ProposalEntry[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase.from("log_entry")
      .select("id, signature_name, mechanic_cert_number, entry_date, trust, replaced_by_entry_id")
      .eq("aircraft_id", id).not("signature_name", "is", null).order("id").range(start, start + 999);
    if (error) return NextResponse.json({ error: error.message, code: "failed" }, { status: 500 });
    entries.push(...((data ?? []) as ProposalEntry[]));
    if (!data || data.length < 1000) break;
  }
  const { data: providers } = await supabase.from("service_provider").select("name, cert_number").eq("aircraft_id", id);
  return NextResponse.json(providerProposals(entries, providers ?? []), { headers: { "Cache-Control": "private, no-store" } });
}

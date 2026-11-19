import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { computeStatus } from "@/lib/due/engine";
import { loadDueInput } from "@/lib/due/load";

// GET /api/aircraft/{id}/visits?horizonMonths=24 → { suggested: VisitView[], planned: VisitView[] } (09 §4.5).
// Status uses 12 months and 2 suggestions; Plan ahead 24 months and up to 6 (09 §3.5 step 10).
// Booking, editing, cancelling and completing go through the push mutations (lib/writes/visits.ts).
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSyncClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "unauthorized" }, { status: 401 });

  const raw = Number(new URL(req.url).searchParams.get("horizonMonths") ?? 12);
  const horizonMonths = Number.isInteger(raw) ? Math.min(24, Math.max(1, raw)) : 12;
  try {
    const loaded = await loadDueInput(supabase, id, user.id);
    if (!loaded) return NextResponse.json({ error: "Aircraft not found.", code: "not_found" }, { status: 404 });
    const { visits } = computeStatus(loaded.input, loaded.today, { horizonMonths, limit: horizonMonths > 12 ? 6 : 2 });
    return NextResponse.json(visits, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "We could not work out the visits right now. Try again.", code: "visits_failed" }, { status: 500 });
  }
}

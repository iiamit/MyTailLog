import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { createLink } from "@/lib/mechanicLink";

// POST /api/aircraft/{id}/visits/{visitId}/send (09 §4.5; 14-decisions.md D12): online only.
// { recipientLabel, providerId?, expiresInDays: 7|30|90 } → { url, expiresAt, mailto }, a mechanic link of kind visit.
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string; visitId: string }> }) {
  const { id, visitId } = await params;
  const supabase = await createSyncClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const r = await createLink(supabase, { aircraftId: id, userId: user.id, kind: "visit", visitId, body });
  if ("error" in r) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  return NextResponse.json({ id: r.id, url: r.url, expiresAt: r.expiresAt, mailto: r.mailto });
}

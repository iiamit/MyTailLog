import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { buildMapModel, isIsoDate, LANES, type MapLogbookType } from "@/lib/mapModel";
import { loadDueInput } from "@/lib/due/load";

// GET /api/aircraft/{id}/map?from&to&logbooks=engine,prop → MapModel (09 §4.6, 10 §2).
// Reads through RLS as the caller, so viewers get the map and strangers a 404.
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSyncClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "unauthorized" }, { status: 401 });

  const q = new URL(req.url).searchParams;
  const from = q.get("from") ?? undefined;
  const to = q.get("to") ?? undefined;
  if ((from && !isIsoDate(from)) || (to && !isIsoDate(to)) || (from && to && from > to)) {
    return NextResponse.json({ error: "Dates must be YYYY-MM-DD, from before to.", code: "invalid" }, { status: 400 });
  }
  const only = q.get("logbooks")?.split(",").filter(Boolean) as MapLogbookType[] | undefined;
  if (only?.some((b) => !LANES.includes(b))) {
    return NextResponse.json({ error: `Logbooks are ${LANES.join(", ")}.`, code: "invalid" }, { status: 400 });
  }

  let loaded;
  try {
    loaded = await loadDueInput(supabase, id, user.id);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  if (!loaded) return NextResponse.json({ error: "Aircraft not found.", code: "not_found" }, { status: 404 });

  return NextResponse.json(buildMapModel(loaded.input, loaded.today, { from, to, only }), {
    headers: { "Cache-Control": "private, no-store" },
  });
}

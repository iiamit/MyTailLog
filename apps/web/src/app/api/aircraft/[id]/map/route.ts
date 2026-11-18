import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { buildMapModel, isIsoDate, todayIn, type MapEntry } from "@/lib/mapModel";
import type { LogbookType } from "@/lib/database.types";

// GET /api/aircraft/{id}/map?from&to&logbooks=engine,prop → MapModel (09 §4.6).
// Reads through RLS as the caller, so viewers get the map and strangers a 404.
// Phase 0 stub: lines and stops only (see lib/mapModel.ts).
export const runtime = "nodejs";

const BOOKS: LogbookType[] = ["airframe", "engine", "prop", "avionics"];

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
  const only = q.get("logbooks")?.split(",").filter(Boolean) as LogbookType[] | undefined;
  if (only?.some((b) => !BOOKS.includes(b))) {
    return NextResponse.json({ error: `Logbooks are ${BOOKS.join(", ")}.`, code: "invalid" }, { status: 400 });
  }

  const { data: aircraft } = await supabase.from("aircraft").select("id").eq("id", id).maybeSingle();
  if (!aircraft) return NextResponse.json({ error: "Aircraft not found.", code: "not_found" }, { status: 404 });

  const [{ data: logbooks, error: lbErr }, { data: profile }] = await Promise.all([
    supabase.from("logbook").select("id, type").eq("aircraft_id", id),
    supabase.from("profile").select("time_zone").eq("id", user.id).maybeSingle(),
  ]);
  if (lbErr) return NextResponse.json({ error: lbErr.message }, { status: 500 });

  // Supabase caps result sets; page through so old books are not cut off.
  const entries: MapEntry[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await supabase.from("log_entry")
      .select("id, logbook_id, page_id, entry_date, trust, replaced_by_entry_id, is_continuation")
      .eq("aircraft_id", id).order("id").range(start, start + 499);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    entries.push(...(data ?? []));
    if (!data || data.length < 500) break;
  }

  return NextResponse.json(
    buildMapModel({ logbooks: logbooks ?? [], entries, today: todayIn(profile?.time_zone), from, to, only }),
  );
}

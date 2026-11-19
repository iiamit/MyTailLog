import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { addMonths, computeStatus } from "@/lib/due/engine";
import { loadDueInput } from "@/lib/due/load";
import { planDate } from "@/lib/due/plan";
import { isIsoDate } from "@/lib/mapModel";
import { hit } from "@/lib/rateLimit";

// POST /api/aircraft/{id}/plan { date: "2027-03-01", hoursPerWeek?: 3 } → PlanResult (09 §4.4, 08 C-PLAN-01).
// Clients compute this locally while scrubbing (09 §3.12 item 5); this route serves server rendering and parity
// tests. Reads through RLS as the caller, so viewers can plan too. 30 per minute per user (09 §4.14).
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSyncClient(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "unauthorized" }, { status: 401 });
  const wait = hit(`plan:${user.id}`, 30, 60_000);
  if (wait) return NextResponse.json({ error: "Too many requests. Try again in a minute.", code: "rate_limited", retryAfter: wait }, { status: 429, headers: { "Retry-After": String(wait) } });

  const body = (await req.json().catch(() => null)) as { date?: unknown; hoursPerWeek?: unknown } | null;
  const date = typeof body?.date === "string" ? body.date : "";
  if (!isIsoDate(date)) return NextResponse.json({ error: "Give the date as YYYY-MM-DD.", code: "invalid" }, { status: 400 });
  const hpw = body?.hoursPerWeek;
  if (hpw != null && (typeof hpw !== "number" || hpw < 0 || hpw > 60 || Math.round(hpw * 2) !== hpw * 2))
    return NextResponse.json({ error: "Hours a week is 0 to 60, in half hours.", code: "invalid" }, { status: 400 });

  try {
    const loaded = await loadDueInput(supabase, id, user.id);
    if (!loaded) return NextResponse.json({ error: "Aircraft not found.", code: "not_found" }, { status: 404 });
    // D5: the plan covers today to 24 months.
    if (date < loaded.today || date > addMonths(loaded.today, 24))
      return NextResponse.json({ error: "Pick a date between today and 24 months from now.", code: "invalid" }, { status: 400 });
    const status = computeStatus(loaded.input, loaded.today, { horizonMonths: 24, limit: 6 });
    return NextResponse.json(planDate(status, date, (hpw as number | undefined) ?? null), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "We could not work out the plan right now. Try again.", code: "plan_failed" }, { status: 500 });
  }
}

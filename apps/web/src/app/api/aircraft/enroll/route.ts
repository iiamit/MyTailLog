import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createSyncClient } from "@/lib/supabase/sync";
import * as aircraft from "@/lib/writes/aircraft";

// Enrollment for the native app (CONTRACT §3 C3 `aircraft.enroll`, online).
// Same lib/writes function the web's server action calls. Body: JSON with the
// enrollment form's field names (`tail_number`, `make`, … — see
// pickEnrollFields) plus an optional client `id` as the idempotency key.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createSyncClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Aircraft details are missing." }, { status: 400 });
  const aircraftId = typeof body.id === "string" && body.id ? body.id : randomUUID();

  const r = await aircraft.enroll(supabase, { aircraftId, userId: user.id }, body);
  if (r.status !== "ok") {
    return NextResponse.json({ error: r.status === "error" ? r.message : "Try again." }, { status: r.status === "error" ? r.httpStatus ?? 500 : 409 });
  }
  return NextResponse.json({ ok: true, aircraft: r.row });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lookupRegistration } from "@/lib/faa/registry";

export const runtime = "nodejs";

// Look up an aircraft registration by tail number from the FAA registry, to
// prefill enrollment / aircraft details. Requires a signed-in user (this fetches
// an external site server-side; don't make it an open proxy).
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const tail = new URL(req.url).searchParams.get("tail")?.trim();
  if (!tail) return NextResponse.json({ error: "Tail number required." }, { status: 400 });

  const record = await lookupRegistration(tail);
  if (!record) {
    return NextResponse.json(
      { error: "No FAA registration found for that tail number." },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, record });
}

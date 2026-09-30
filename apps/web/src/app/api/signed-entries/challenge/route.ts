import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { issueSigningChallenge } from "@/lib/entry-signing-challenge";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const db = await createSyncClient(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const result = await issueSigningChallenge(db, user, await req.json().catch(() => null));
  return NextResponse.json(result, { status: "error" in result ? 400 : 200, headers: { "Cache-Control": "no-store" } });
}

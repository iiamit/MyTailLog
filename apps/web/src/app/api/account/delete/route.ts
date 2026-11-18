import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { createServiceClient } from "@/lib/supabase/service";
import { removeBlobs } from "@/lib/storage";
import { deleteAccount, parseDeletionRequest } from "@/lib/accountDeletion";

// POST /api/account/delete  { "confirm": "DELETE" }
// Deletes the caller's account and everything they own (App Store 5.1.1(v)).
// Online only. The user id comes from the caller's own session (bearer token or
// cookie); the service client is used only after that check.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const supabase = await createSyncClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "unauthorized" }, { status: 401 });

  // JSON only: a cross-site form can't send it without a CORS preflight.
  const isJson = req.headers.get("content-type")?.toLowerCase().startsWith("application/json");
  const parsed = parseDeletionRequest(isJson ? await req.json().catch(() => null) : null);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error, code: parsed.code }, { status: parsed.status });

  const result = await deleteAccount(createServiceClient(), user.id, removeBlobs);
  if ("error" in result) return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
  return NextResponse.json(result);
}

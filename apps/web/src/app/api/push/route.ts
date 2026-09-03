import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";

// The device half of push notifications (migration 0059).
//
//   POST   /api/push  { token, platform }  → remember this device
//   DELETE /api/push  { token }            → forget it (sign-out, or the owner
//                                            turning notifications off)
//
// Bearer (the native app) or cookie (a browser), like every other route the
// phone calls. Registering goes through register_device_token(), a SECURITY
// DEFINER function, because a phone signed into a second account has to be able
// to take its token off the first — see 0059 for why RLS alone cannot.
export const runtime = "nodejs";

const PLATFORMS = new Set(["ios"]);

async function tokenFrom(req: Request): Promise<{ token: string; platform: string } | null> {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  // An APNs token is 64 hex characters today, but Apple has changed its length
  // before; bound it rather than pin it.
  if (!token || token.length > 200) return null;
  const platform = typeof body?.platform === "string" ? body.platform : "ios";
  return { token, platform };
}

export async function POST(req: Request) {
  const supabase = await createSyncClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const input = await tokenFrom(req);
  if (!input) return NextResponse.json({ error: "Device token missing." }, { status: 400 });
  if (!PLATFORMS.has(input.platform)) {
    return NextResponse.json({ error: "Unsupported device." }, { status: 400 });
  }

  const { error } = await supabase.rpc("register_device_token", {
    p_token: input.token,
    p_platform: input.platform,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const supabase = await createSyncClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const input = await tokenFrom(req);
  if (!input) return NextResponse.json({ error: "Device token missing." }, { status: 400 });

  // RLS scopes the delete to this user's own rows; a token that is not theirs
  // simply matches nothing, which is the right answer either way.
  const { error } = await supabase
    .from("device_token")
    .delete()
    .eq("token", input.token);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

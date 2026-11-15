import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { isHeardAbout } from "@/lib/signupSource";

/**
 * The owner's one-tap "How did you hear about MyTailLog?" answer (or
 * "dismissed"). Web (cookie session) and the native apps (bearer token) both
 * call this; RLS plus the 0066 column grant limit it to the caller's own row.
 */
export async function POST(request: Request) {
  const supabase = await createSyncClient(request);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const answer = ((await request.json().catch(() => ({}))) as { answer?: unknown }).answer;
  if (!isHeardAbout(answer)) return NextResponse.json({ error: "Unknown answer." }, { status: 400 });

  const { error } = await supabase.from("profile").update({ heard_about: answer }).eq("id", user.id);
  return error
    ? NextResponse.json({ error: "Could not save your answer." }, { status: 500 })
    : new NextResponse(null, { status: 204 });
}

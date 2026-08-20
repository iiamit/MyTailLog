import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

type EventName = "summary_shared" | "summary_exported";
const EVENTS: EventName[] = ["summary_shared", "summary_exported"];

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const event = String((await request.json().catch(() => ({})) as { event?: string }).event ?? "");
  if (!EVENTS.includes(event as EventName)) return NextResponse.json({ error: "Invalid event." }, { status: 400 });

  const { error } = await createServiceClient().from("growth_event").upsert({ user_id: user.id, event: event as EventName });
  return error
    ? NextResponse.json({ error: "Could not record event." }, { status: 500 })
    : new NextResponse(null, { status: 204 });
}

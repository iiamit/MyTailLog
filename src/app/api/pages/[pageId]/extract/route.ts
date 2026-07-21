import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractPage } from "@/lib/extraction/pipeline";
import { prepareAi, runWithAiContext, logAiUsage } from "@/lib/extraction/aiContext";

// The vision call plus adaptive thinking can take a while; give it headroom.
// Node runtime is required (Buffer, the Anthropic SDK) — not Edge.
export const runtime = "nodejs";
// maxDuration is a Vercel-only hint. Self-hosted on Cloud Run / Firebase App
// Hosting it's ignored — the Cloud Run request timeout applies (default 300s),
// which comfortably covers extraction. On Vercel Hobby this is capped to 60.
export const maxDuration = 300;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ pageId: string }> },
) {
  const { pageId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // RLS scopes this to the owner; a page on someone else's aircraft returns no row.
  const { data: page } = await supabase
    .from("page")
    .select("id, aircraft_id, logbook_id, storage_path")
    .eq("id", pageId)
    .single();

  if (!page) {
    return NextResponse.json({ error: "Page not found." }, { status: 404 });
  }

  // Gate the PAID extraction on edit access — a read-only viewer can see the page
  // but must not be able to spend an AI call (the extracted rows would no-op under
  // RLS anyway). Check before prepareAi / the model call.
  const { data: canEdit } = await supabase.rpc("can_edit_aircraft", { target_aircraft: page.aircraft_id });
  if (!canEdit) {
    return NextResponse.json({ error: "You don't have edit access to this aircraft." }, { status: 403 });
  }

  const gate = await prepareAi(supabase, user.id);
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  try {
    const result = await runWithAiContext(
      {
        apiKey: gate.apiKey,
        onUsage: (u) => logAiUsage(user.id, "extract", u, gate.ownKey),
      },
      () => extractPage(supabase, page),
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

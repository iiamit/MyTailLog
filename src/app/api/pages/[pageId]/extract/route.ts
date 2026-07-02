import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractionConfigured } from "@/lib/extraction/anthropic";
import { extractPage } from "@/lib/extraction/pipeline";

// The vision call plus adaptive thinking can take a while; give it headroom.
// Node runtime is required (Buffer, the Anthropic SDK) — not Edge.
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ pageId: string }> },
) {
  const { pageId } = await params;

  if (!extractionConfigured()) {
    return NextResponse.json(
      { error: "Extraction isn't configured. Set ANTHROPIC_API_KEY (see README Costs)." },
      { status: 501 },
    );
  }

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

  try {
    const result = await extractPage(supabase, page);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

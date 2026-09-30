import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { issueEntryPrintToken } from "@/lib/entry-print-token";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ entryId: string }> }) {
  const { entryId } = await params;
  const db = await createSyncClient(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data } = await db.from("log_entry").select("id").eq("id", entryId).not("authored_signed_at", "is", null).maybeSingle();
  if (!data) return NextResponse.json({ error: "Signed entry not found" }, { status: 404 });
  const url = new URL(`/print/entry/${entryId}`, req.url);
  url.searchParams.set("token", issueEntryPrintToken(entryId, user.id));
  return NextResponse.json({ url: url.toString() }, { headers: { "Cache-Control": "no-store" } });
}

import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";

export async function POST(req: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const db = await createSyncClient(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to review this document." }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (body?.approve !== true || typeof body.base !== "string" || !Number.isFinite(Date.parse(body.base))) {
    return NextResponse.json({ error: "Confirm the document reading and its version." }, { status: 400 });
  }
  const { error } = await db.rpc("confirm_scanned_document", { p_page: pageId, p_base: body.base });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "40001" ? 409 : 400 });
  return NextResponse.json({ ok: true });
}

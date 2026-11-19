import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { createBatch } from "@/lib/writes/pages";

// POST /api/aircraft/{id}/batches { id?, logbookId, source, expectedPages, isHandwritten } → { batchId }
// (09 §4.8). Online path of the `batch.create` mutation; same write function.
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSyncClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in.", code: "not_signed_in" }, { status: 401 });
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const r = await createBatch(supabase, { aircraftId: id, userId: user.id }, {
    id: typeof b.id === "string" && b.id ? b.id : crypto.randomUUID(),
    logbookId: String(b.logbookId ?? ""),
    source: String(b.source ?? ""),
    expectedPages: Number(b.expectedPages),
    isHandwritten: b.isHandwritten !== false,
  });
  if (r.status !== "ok") {
    const status = r.status === "error" ? r.httpStatus ?? 500 : 409;
    const message = r.status === "error" ? r.message : "Conflict.";
    return NextResponse.json({ error: message, code: status === 403 ? "viewer_read_only" : "invalid" }, { status });
  }
  return NextResponse.json({ batchId: (r.row as { id: string }).id });
}

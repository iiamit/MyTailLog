import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { validateEnvelope, validateMutation, type PushResult } from "@/lib/sync/mutations";
import { applyMutation, editChecker } from "@/lib/sync/push";

// POST /api/sync/push — the phone's offline write queue drains here.
//
// Body { mutations: Mutation[] } (≤ 100) → { results: PushResult[] }, one per
// mutation, same order (CONTRACT §2). Each mutation is validated at the
// boundary (shape, known type, the base rule), checked against
// can_edit_aircraft, and dispatched to its lib/writes function, which does the
// optimistic-concurrency compare and reads its own write back. Idempotent:
// inserts key on the mutation id; a retried update whose first attempt landed
// is recognised by value (see applyMutation) rather than reported as a conflict.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const supabase = await createSyncClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const envelope = validateEnvelope(await req.json().catch(() => null));
  if ("error" in envelope) return NextResponse.json({ error: envelope.error }, { status: 400 });

  const canEdit = editChecker(supabase);
  const results: PushResult[] = [];
  for (const raw of envelope.mutations) {
    const v = validateMutation(raw);
    if ("error" in v) {
      results.push({ id: v.id, status: "error", error: v.error });
      continue;
    }
    results.push(await applyMutation(supabase, user.id, canEdit, v.ok));
  }
  return NextResponse.json({ results });
}

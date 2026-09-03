import { NextResponse } from "next/server";
import { createSyncClient } from "@/lib/supabase/sync";
import { toLegacyResult, translateLegacy, type LegacyResult } from "@/lib/sync/mutations";
import { applyMutation, editChecker } from "@/lib/sync/push";

// ===========================================================================
// LEGACY drain target for the native app's offline action queue — kept for one
// release because phones in the field still POST the four original types here
// (reading | oil | squawk | mx_complete). Each is translated into its CONTRACT
// §3 mutation and applied by the same dispatch as POST /api/sync/push, so an old
// build and a new one write through the same lib/writes function.
//
// Response shape is unchanged: { results: [{ id, ok, error? }] }.
//
// `mx_complete` without `base` (every old build) applies last-writer-wins, as
// it always did; a new build that sends `base` gets the conflict check.
// ===========================================================================

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ACTIONS = 100;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: aircraftId } = await ctx.params;

  const supabase = await createSyncClient(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { actions?: unknown } | null;
  const actions = Array.isArray(body?.actions) ? (body.actions as Record<string, unknown>[]) : null;
  if (!actions) return NextResponse.json({ error: "Expected { actions: [...] }." }, { status: 400 });
  if (actions.length > MAX_ACTIONS) {
    return NextResponse.json({ error: `Too many actions (${actions.length} > ${MAX_ACTIONS}).` }, { status: 400 });
  }

  // Whole-batch refusal, as before: the old build treats a 403 as "not an
  // editor" and marks every queued action with that reason.
  const canEdit = editChecker(supabase);
  if (!(await canEdit(aircraftId))) {
    return NextResponse.json({ error: "You don't have permission to edit this aircraft." }, { status: 403 });
  }

  const results: LegacyResult[] = [];
  for (const a of actions) {
    const t = translateLegacy(aircraftId, a && typeof a === "object" ? a : {});
    if ("error" in t) {
      results.push({ id: t.id, ok: false, error: t.error });
      continue;
    }
    results.push(toLegacyResult(await applyMutation(supabase, user.id, canEdit, t.ok)));
  }

  return NextResponse.json({ results });
}

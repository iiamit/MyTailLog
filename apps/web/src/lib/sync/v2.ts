import type { Db } from "@/lib/writes";
import { validateEnvelope, validateMutation, type MutationType, type PushResult } from "@/lib/sync/mutations";
import { applyMutation, editChecker } from "@/lib/sync/push";
import { pullChanges, type PullPage } from "@/lib/sync/pull";

// Sync protocol v2 (09 §5; 13-build-plan.md §6): runs beside v1, which the
// Capacitor app keeps. Same change feed and the same write functions; v2 adds
//  - 410 `resync_required` when the cursor predates pruned history (5.4),
//  - machine `code`s on errors (09 §4: viewer_read_only, conflict, …),
//  - the viewer write rule (5.3: viewers may only report squawks),
//  - a push ledger (sync_mutation, 0086): a retried mutation that already
//    landed answers ok without running again, and a conflict stays recorded
//    until the device decides it (5.5).
// No next/* here so the protocol is unit-tested with a fake client.

export const VIEWER_READ_ONLY = "You don't have edit access to this aircraft.";

/**
 * The only writes a viewer's mutation may make (09 §5.3). `squawkPhoto.create`
 * and `reminder.snooze` join when those types exist in the catalogue.
 */
export const VIEWER_WRITES: ReadonlySet<MutationType> = new Set<MutationType>(["squawk.create"]);

export type Resolution = "keep_mine" | "keep_both" | "take_theirs" | "discard";
export type PushResultV2 = PushResult & { code?: string; replayed?: boolean };

type Ledger = { id: string; status: "ok" | "conflict" | "error"; resolved_at: string | null };

// ---------------------------------------------------------------------------
// Pull
// ---------------------------------------------------------------------------

export type PullV2 =
  | { status: 200; body: PullPage & { serverTime: string; minAppVersion: string | null } }
  | { status: 410 | 500; body: { error: string; code: string } };

/** `minSeqRetained` comes from sync_retention (service role). Cursor 0 is always served: it is the rebuild. */
export async function pullV2(supabase: Db, userId: string, cursor: number, limit: number, minSeqRetained: number, minAppVersion: string | null = null): Promise<PullV2> {
  if (cursor > 0 && cursor < minSeqRetained) {
    return { status: 410, body: { error: "This phone's copy is too old to update. Rebuilding it from the server.", code: "resync_required" } };
  }
  const page = await pullChanges(supabase, userId, cursor, limit);
  if ("error" in page) return { status: 500, body: { error: page.error, code: "server_error" } };
  return { status: 200, body: { ...page, serverTime: new Date().toISOString(), minAppVersion } };
}

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

/** One ledger row per answered mutation. Never fails the push: the ledger is bookkeeping. */
async function record(supabase: Db, userId: string, m: { id: string; type: string; aircraftId?: string; base?: string }, r: PushResultV2, prior: Ledger | undefined, resolution: Resolution | undefined) {
  const resolves = prior?.status === "conflict" && !prior.resolved_at && r.status === "ok";
  const { error } = await supabase.from("sync_mutation").upsert({
    user_id: userId, id: m.id, aircraft_id: m.aircraftId ?? null, type: m.type || "unknown", status: r.status,
    base: m.base ?? null, error: r.error?.slice(0, 1000) ?? null, code: r.code ?? null,
    ...(resolves ? { resolution: resolution ?? "keep_mine", resolved_at: new Date().toISOString() } : {}),
  }, { onConflict: "user_id,id" });
  if (error) console.error("sync_mutation ledger write failed", error.message);
}

export async function pushV2(supabase: Db, userId: string, body: unknown): Promise<{ status: 400; body: { error: string; code: string } } | { status: 200; body: { results: PushResultV2[] } }> {
  const envelope = validateEnvelope(body);
  if ("error" in envelope) return { status: 400, body: { error: envelope.error, code: "invalid" } };

  const ids = envelope.mutations.map((m) => (m && typeof m === "object" && typeof (m as { id?: unknown }).id === "string" ? (m as { id: string }).id : "")).filter(Boolean);
  const ledger = new Map<string, Ledger>();
  if (ids.length) {
    const { data } = await supabase.from("sync_mutation").select("id, status, resolved_at").eq("user_id", userId).in("id", ids);
    for (const row of (data ?? []) as Ledger[]) ledger.set(row.id, row);
  }

  const canEdit = editChecker(supabase);
  const results: PushResultV2[] = [];
  for (const raw of envelope.mutations) {
    const v = validateMutation(raw);
    if ("error" in v) {
      results.push({ id: v.id, status: "error", error: v.error, code: "invalid" });
      continue;
    }
    const m = v.ok;
    const prior = ledger.get(m.id);
    // Exact replay detection: this id already landed, so a lost response is not run twice.
    if (prior?.status === "ok") {
      results.push({ id: m.id, status: "ok", row: null, replayed: true });
      continue;
    }
    const resolution = (raw as { resolution?: unknown }).resolution === "keep_both" ? "keep_both" : undefined;
    let r: PushResultV2;
    if (!VIEWER_WRITES.has(m.type) && !(await canEdit(m.aircraftId))) {
      r = { id: m.id, status: "error", error: VIEWER_READ_ONLY, code: "viewer_read_only" };
    } else {
      // Access is settled above; the write function and RLS still check it (viewer squawks are inserts AS the viewer).
      const applied = await applyMutation(supabase, userId, async () => true, m);
      r = applied.status === "conflict" ? { ...applied, code: "conflict" } : applied.status === "error" ? { ...applied, code: "refused" } : applied;
    }
    await record(supabase, userId, m, r, prior, resolution);
    results.push(r);
  }
  return { status: 200, body: { results } };
}

// ---------------------------------------------------------------------------
// Conflict records (09 §5.5)
// ---------------------------------------------------------------------------

/** Conflicts the server answered that no device has decided yet. */
export async function openConflicts(supabase: Db, userId: string) {
  const { data, error } = await supabase.from("sync_mutation")
    .select("id, aircraft_id, type, base, created_at, updated_at")
    .eq("user_id", userId).eq("status", "conflict").is("resolved_at", null)
    .order("created_at", { ascending: true }).limit(500);
  if (error) return { error: error.message };
  return { conflicts: (data ?? []).map((c) => ({ mutationId: c.id, aircraftId: c.aircraft_id, type: c.type, base: c.base, at: c.updated_at })) };
}

/**
 * The device dropped its change ("Take theirs", or a discard after a delete).
 * "Keep mine" and "Keep both" are not reported here: they re-push the mutation
 * with the new base, and the push that lands closes the record.
 */
export async function resolveConflict(supabase: Db, userId: string, mutationId: string, resolution: unknown): Promise<{ status: 200 | 400 | 404; body: Record<string, unknown> }> {
  if (resolution !== "take_theirs" && resolution !== "discard") {
    return { status: 400, body: { error: "Resolution must be take_theirs or discard; keep yours by pushing the change again.", code: "invalid" } };
  }
  const { data, error } = await supabase.from("sync_mutation")
    .update({ resolution, resolved_at: new Date().toISOString() })
    .eq("user_id", userId).eq("id", mutationId).eq("status", "conflict").is("resolved_at", null)
    .select("id").maybeSingle();
  if (error) return { status: 400, body: { error: error.message, code: "invalid" } };
  if (!data) return { status: 404, body: { error: "No open conflict for that change.", code: "not_found" } };
  return { status: 200, body: { ok: true } };
}

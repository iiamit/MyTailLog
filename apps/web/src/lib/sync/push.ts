import { writes, type Db } from "@/lib/writes";
import { alreadyApplied, type Mutation, type PushResult } from "@/lib/sync/mutations";

// Apply one validated mutation: edit check, dispatch to the ONE write function,
// idempotency fallback. Shared by POST /api/sync/push and the legacy
// POST /api/aircraft/[id]/actions route, so old and new builds land on the same
// code. No type-specific branches here (CONTRACT §4) — a new type is one row in
// lib/writes/index.ts.

export type EditCheck = (aircraftId: string) => Promise<boolean>;

/** can_edit_aircraft, memoised per request — a batch is normally one aircraft. */
export function editChecker(supabase: Db): EditCheck {
  const cache = new Map<string, Promise<boolean>>();
  return async (aircraftId) => {
    let p = cache.get(aircraftId);
    if (!p) {
      p = Promise.resolve(supabase.rpc("can_edit_aircraft", { target_aircraft: aircraftId })).then(({ data }) => data === true);
      cache.set(aircraftId, p);
    }
    return p;
  };
}

export async function applyMutation(supabase: Db, userId: string, canEdit: EditCheck, m: Mutation): Promise<PushResult> {
  // The device only ever queues for aircraft it may edit — but it is the device
  // saying so. Same function RLS uses; a viewer's write would otherwise match
  // zero rows and look like success.
  if (!(await canEdit(m.aircraftId))) {
    return { id: m.id, status: "error", error: "You don't have permission to edit this aircraft." };
  }
  try {
    const r = await writes[m.type](supabase, { aircraftId: m.aircraftId, userId }, m.payload as never, m.base);
    if (r.status === "ok") return { id: m.id, status: "ok", row: r.row };
    if (r.status === "conflict") {
      // A retry of a write that already landed (lost response): the row holds
      // the phone's own values. Don't make the owner choose between twins.
      if (alreadyApplied(m.payload, r.row, m.type)) return { id: m.id, status: "ok", row: r.row };
      return { id: m.id, status: "conflict", row: r.row };
    }
    return { id: m.id, status: "error", error: r.message };
  } catch (e) {
    // One bad change must not discard the rest of the batch.
    return { id: m.id, status: "error", error: e instanceof Error ? e.message : String(e) };
  }
}

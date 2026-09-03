import { applyChanges, getByAircraft } from "./db";

// Optimistic mirror patches: after enqueue() the screen shows the edit at once;
// core sync's drain/pull reconciles with the server's row afterwards.
//
// ponytail: rides on applyChanges (INSERT OR REPLACE), which resets the row's
// seq to 0 until the next pull rewrites it. Only getRows' ORDER BY seq notices,
// and every screen here sorts its own rows. Ask core sync for a seq-preserving
// patchRow() if that ever matters.

export async function patchLocal<T extends { id: string; aircraft_id: string }>(
  table: string,
  aircraftId: string,
  id: string,
  patch: Partial<T>,
): Promise<T | null> {
  const rows = await getByAircraft<T>(table, aircraftId);
  const row = rows.find((r) => r.id === id);
  if (!row) return null;
  const next = { ...row, ...patch, updated_at: new Date().toISOString() };
  await applyChanges([{ table, op: "upsert", id, seq: 0, row: next }]);
  return next;
}

export async function patchLocalMany<T extends { id: string; aircraft_id: string }>(
  table: string,
  aircraftId: string,
  ids: string[],
  patch: Partial<T>,
): Promise<void> {
  const want = new Set(ids);
  const rows = (await getByAircraft<T>(table, aircraftId)).filter((r) => want.has(r.id));
  const updated_at = new Date().toISOString();
  await applyChanges(rows.map((r) => ({ table, op: "upsert" as const, id: r.id, seq: 0, row: { ...r, ...patch, updated_at } })));
}

export async function insertLocal<T extends { id: string }>(table: string, row: T): Promise<void> {
  await applyChanges([{ table, op: "upsert", id: row.id, seq: 0, row: row as Record<string, unknown> }]);
}

export async function deleteLocal(table: string, id: string): Promise<void> {
  await applyChanges([{ table, op: "delete", id, seq: 0 }]);
}

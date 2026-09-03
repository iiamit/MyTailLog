import type { SyncChange } from "./types";

// The pull feed's apply rules and the queue's schema upgrades, kept free of any
// Capacitor import so they can be unit-tested off-device (apps/mobile has no
// runner of its own, so the web suite imports this directly — see
// apps/web/test/mobile-sync-apply.test.ts).

/**
 * Turn pulled changes into SQLite statements: upserts replace, deletes remove.
 *
 * Split out from `applyChanges` so the cascade rule below can be tested without
 * a device.
 */
export function changeStatements(changes: SyncChange[]): { statement: string; values: unknown[] }[] {
  const set: { statement: string; values: unknown[] }[] = [];
  for (const c of changes) {
    if (c.op !== "delete") {
      set.push({
        statement: "INSERT OR REPLACE INTO records (table_name,id,data,seq) VALUES (?,?,?,?)",
        values: [c.table, c.id, JSON.stringify(c.row), c.seq],
      });
      continue;
    }
    set.push({ statement: "DELETE FROM records WHERE table_name=? AND id=?", values: [c.table, c.id] });
    // Deleting an aircraft cascades on the server, but those child deletes are
    // announced against an aircraft nobody can read any more, so they never
    // reach us. Cascade locally instead of keeping orphaned pages and entries
    // for an aircraft that no longer exists.
    if (c.table === "aircraft") {
      set.push({
        statement: "DELETE FROM records WHERE json_extract(data,'$.aircraft_id') = ?",
        values: [c.id],
      });
    }
  }
  return set;
}

/** Rebuild the read-only mirror without ever discarding queued offline work. */
export function resetStatements(): { statement: string; values: unknown[] }[] {
  return [
    { statement: "DELETE FROM records", values: [] },
    { statement: "DELETE FROM sync_state WHERE key='cursor'", values: [] },
  ];
}

// --- action_queue schema ----------------------------------------------------
//
// CREATE TABLE IF NOT EXISTS never adds a column to a table that already
// exists, so a device that installed v1 of the queue would keep the v1 shape
// forever. Each version step is a list of ALTERs applied once, in order,
// tracked by `queue_version` in sync_state. SQLite has no ADD COLUMN IF NOT
// EXISTS, so the runner tolerates "duplicate column" — a step that half-ran
// before a crash completes on the next launch.

export const QUEUE_VERSION = 2;

const QUEUE_UPGRADES: Record<number, string[]> = {
  // v1 → v2 (iOS parity): optimistic concurrency + conflict state + backoff.
  2: [
    "ALTER TABLE action_queue ADD COLUMN base TEXT",
    "ALTER TABLE action_queue ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'",
    "ALTER TABLE action_queue ADD COLUMN server_row TEXT",
    "ALTER TABLE action_queue ADD COLUMN retry_after TEXT",
  ],
};

/** Every ALTER needed to bring a queue at `from` up to QUEUE_VERSION, in order. */
export function queueUpgradeStatements(from: number): string[] {
  const out: string[] = [];
  for (let v = Math.max(1, Math.floor(from)) + 1; v <= QUEUE_VERSION; v++) out.push(...(QUEUE_UPGRADES[v] ?? []));
  return out;
}

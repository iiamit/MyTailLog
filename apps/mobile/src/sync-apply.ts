import type { SyncChange } from "./types";

// The pull feed's apply rules, kept free of any Capacitor import so they can be
// unit-tested off-device (apps/mobile has no runner of its own, so the web
// suite imports this directly — see apps/web/test/mobile-sync-apply.test.ts).

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

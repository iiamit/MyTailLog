import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from "@capacitor-community/sqlite";
import type { SyncChange } from "./sync";

// On-device mirror of the synced data. Schema-agnostic: every pulled row is
// stored as JSON in one `records` table keyed by (table_name, id), so the client
// never has to track the server's 14 table schemas — it just applies the feed.
// Reads use SQLite's json_extract to filter/sort. The sync cursor lives in
// `sync_state`, so a relaunch resumes incrementally and offline reads work.

const DB_NAME = "mytaillog";
const sqlite = new SQLiteConnection(CapacitorSQLite);
let db: SQLiteDBConnection | null = null;

export async function initDb(): Promise<void> {
  if (db) return;
  const consistent = await sqlite.checkConnectionsConsistency().catch(() => ({ result: false }));
  const already = (await sqlite.isConnection(DB_NAME, false)).result;
  db =
    consistent.result && already
      ? await sqlite.retrieveConnection(DB_NAME, false)
      : await sqlite.createConnection(DB_NAME, false, "no-encryption", 1, false);
  await db.open();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS records (
      table_name TEXT NOT NULL,
      id         TEXT NOT NULL,
      data       TEXT NOT NULL,
      seq        INTEGER NOT NULL,
      PRIMARY KEY (table_name, id)
    );
    CREATE INDEX IF NOT EXISTS records_table_idx ON records (table_name);
    CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY, value TEXT);
  `);
}

/** Apply a batch of pulled changes: upserts replace, deletes remove. */
export async function applyChanges(changes: SyncChange[]): Promise<void> {
  if (!db || changes.length === 0) return;
  const set = changes.map((c) =>
    c.op === "delete"
      ? { statement: "DELETE FROM records WHERE table_name=? AND id=?", values: [c.table, c.id] }
      : {
          statement: "INSERT OR REPLACE INTO records (table_name,id,data,seq) VALUES (?,?,?,?)",
          values: [c.table, c.id, JSON.stringify(c.row), c.seq],
        },
  );
  await db.executeSet(set);
}

export async function getCursor(): Promise<number> {
  if (!db) return 0;
  const res = await db.query("SELECT value FROM sync_state WHERE key='cursor'");
  const v = res.values?.[0]?.value;
  return v ? Number(v) : 0;
}

export async function setCursor(seq: number): Promise<void> {
  if (!db) return;
  await db.run("INSERT OR REPLACE INTO sync_state (key,value) VALUES ('cursor',?)", [String(seq)]);
}

export async function countByTable(): Promise<{ table_name: string; n: number }[]> {
  if (!db) return [];
  const res = await db.query("SELECT table_name, COUNT(*) AS n FROM records GROUP BY table_name ORDER BY n DESC");
  return (res.values ?? []) as { table_name: string; n: number }[];
}

/** Parsed rows for a table, e.g. all aircraft. */
export async function getRows<T = Record<string, unknown>>(table: string): Promise<T[]> {
  if (!db) return [];
  const res = await db.query("SELECT data FROM records WHERE table_name=? ORDER BY seq", [table]);
  return (res.values ?? []).map((r) => JSON.parse((r as { data: string }).data) as T);
}

import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from "@capacitor-community/sqlite";
import type { SyncChange } from "./sync";
import { changeStatements, resetStatements, signOutStatements, queueUpgradeStatements, QUEUE_VERSION } from "./sync-apply";

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
    CREATE TABLE IF NOT EXISTS capture_queue (
      id             TEXT PRIMARY KEY,
      aircraft_id    TEXT NOT NULL,
      logbook_id     TEXT NOT NULL,
      page_sequence  INTEGER,
      captured_at    TEXT,
      is_handwritten INTEGER NOT NULL DEFAULT 1,
      image          TEXT NOT NULL,
      thumbnail      TEXT
    );
    -- Offline writes waiting to reach the server (CONTRACT §2). \`payload\` is the
    -- JSON mutation payload; \`id\` is the client-generated UUID that also becomes
    -- the server row's key, so draining twice can't write twice. \`base\` is the
    -- row's updated_at as the phone last saw it (update/delete types). \`status\`:
    -- pending (waiting for signal or a retry), conflict (the server's row moved
    -- on — \`server_row\` holds it for the yours/theirs screen), failed (refused;
    -- \`error\` says why). \`retry_after\` gates retries after an online failure.
    -- Columns added after v1 also live in queueUpgradeStatements (sync-apply.ts).
    CREATE TABLE IF NOT EXISTS action_queue (
      id          TEXT PRIMARY KEY,
      aircraft_id TEXT NOT NULL,
      type        TEXT NOT NULL,
      label       TEXT NOT NULL,
      payload     TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      attempts    INTEGER NOT NULL DEFAULT 0,
      error       TEXT,
      base        TEXT,
      status      TEXT NOT NULL DEFAULT 'pending',
      server_row  TEXT,
      retry_after TEXT
    );
  `);
  await upgradeQueue();
}

/**
 * Bring an existing action_queue up to QUEUE_VERSION. CREATE TABLE IF NOT
 * EXISTS leaves a v1 table untouched, so each missing column is ALTERed in.
 * "duplicate column" means that step already ran (or the table was created at
 * this version) — fine either way.
 */
async function upgradeQueue(): Promise<void> {
  if (!db) return;
  const res = await db.query("SELECT value FROM sync_state WHERE key='queue_version'");
  const at = Number(res.values?.[0]?.value ?? 1);
  if (at >= QUEUE_VERSION) return;
  for (const stmt of queueUpgradeStatements(at)) {
    try {
      await db.execute(stmt);
    } catch (e) {
      if (!/duplicate column/i.test(e instanceof Error ? e.message : String(e))) throw e;
    }
  }
  await db.run("INSERT OR REPLACE INTO sync_state (key,value) VALUES ('queue_version',?)", [String(QUEUE_VERSION)]);
}

export type QueuedCapture = {
  id: string;
  aircraft_id: string;
  logbook_id: string;
  page_sequence: number | null;
  captured_at: string | null;
  is_handwritten: number;
  image: string; // base64 jpeg
  thumbnail: string | null; // base64 jpeg
};

export async function enqueueCapture(c: QueuedCapture): Promise<void> {
  if (!db) return;
  await db.run(
    "INSERT OR REPLACE INTO capture_queue (id,aircraft_id,logbook_id,page_sequence,captured_at,is_handwritten,image,thumbnail) VALUES (?,?,?,?,?,?,?,?)",
    [c.id, c.aircraft_id, c.logbook_id, c.page_sequence, c.captured_at, c.is_handwritten, c.image, c.thumbnail],
  );
}

export async function listCaptures(): Promise<QueuedCapture[]> {
  if (!db) return [];
  const res = await db.query("SELECT * FROM capture_queue ORDER BY captured_at");
  return (res.values ?? []) as QueuedCapture[];
}

export async function removeCapture(id: string): Promise<void> {
  if (!db) return;
  await db.run("DELETE FROM capture_queue WHERE id=?", [id]);
}

export async function captureCount(): Promise<number> {
  if (!db) return 0;
  const res = await db.query("SELECT COUNT(*) AS n FROM capture_queue");
  return Number((res.values?.[0] as { n: number } | undefined)?.n ?? 0);
}

export type ActionStatus = "pending" | "conflict" | "failed";

export type QueuedAction = {
  id: string;
  aircraft_id: string;
  type: string;
  /** Human wording for the pending list — "Tach 4141.6", "Oil +1 qt". */
  label: string;
  payload: string; // JSON
  created_at: string;
  attempts: number;
  error: string | null;
  /** ISO updated_at of the row being changed, as last seen (update/delete types). */
  base: string | null;
  status: ActionStatus;
  /** The server's current row, JSON, while status is 'conflict'. */
  server_row: string | null;
  /** Don't retry before this ISO time (backoff after an online failure). */
  retry_after: string | null;
};

export async function enqueueAction(
  a: Pick<QueuedAction, "id" | "aircraft_id" | "type" | "label" | "payload" | "created_at"> & { base?: string | null },
): Promise<void> {
  if (!db) return;
  await db.run(
    "INSERT OR REPLACE INTO action_queue (id,aircraft_id,type,label,payload,created_at,attempts,error,base,status,server_row,retry_after) VALUES (?,?,?,?,?,?,0,NULL,?,'pending',NULL,NULL)",
    [a.id, a.aircraft_id, a.type, a.label, a.payload, a.created_at, a.base ?? null],
  );
}

/** Oldest first — actions are applied in the order they were taken. */
export async function listActions(aircraftId?: string): Promise<QueuedAction[]> {
  if (!db) return [];
  const res = aircraftId
    ? await db.query("SELECT * FROM action_queue WHERE aircraft_id=? ORDER BY created_at", [aircraftId])
    : await db.query("SELECT * FROM action_queue ORDER BY created_at");
  return (res.values ?? []) as QueuedAction[];
}

/** What a drain may send now: pending, and past its backoff gate. */
export async function listDrainable(now = new Date().toISOString()): Promise<QueuedAction[]> {
  if (!db) return [];
  const res = await db.query(
    "SELECT * FROM action_queue WHERE status='pending' AND (retry_after IS NULL OR retry_after<=?) ORDER BY created_at",
    [now],
  );
  return (res.values ?? []) as QueuedAction[];
}

export async function removeAction(id: string): Promise<void> {
  if (!db) return;
  await db.run("DELETE FROM action_queue WHERE id=?", [id]);
}

/** The server refused it. Stays visible with the reason until the owner discards it. */
export async function markActionFailed(id: string, error: string): Promise<void> {
  if (!db) return;
  await db.run("UPDATE action_queue SET attempts=attempts+1, status='failed', error=? WHERE id=?", [error, id]);
}

/** Couldn't reach the server while online: count the try and gate the next one. */
export async function markActionRetry(id: string, error: string, retryAfter: string): Promise<void> {
  if (!db) return;
  await db.run("UPDATE action_queue SET attempts=attempts+1, error=?, retry_after=? WHERE id=?", [error, retryAfter, id]);
}

/** The row moved on since the phone saw it; park it with the server's version. */
export async function markActionConflict(id: string, serverRow: Record<string, unknown>): Promise<void> {
  if (!db) return;
  await db.run("UPDATE action_queue SET status='conflict', server_row=?, error=NULL WHERE id=?", [
    JSON.stringify(serverRow),
    id,
  ]);
}

/** "Keep mine": re-queue against the server's current version. */
export async function resubmitAction(id: string, base: string): Promise<void> {
  if (!db) return;
  await db.run(
    "UPDATE action_queue SET status='pending', base=?, server_row=NULL, error=NULL, attempts=0, retry_after=NULL WHERE id=?",
    [base, id],
  );
}

export async function actionCount(): Promise<number> {
  if (!db) return 0;
  const res = await db.query("SELECT COUNT(*) AS n FROM action_queue");
  return Number((res.values?.[0] as { n: number } | undefined)?.n ?? 0);
}

/** Apply a batch of pulled changes: upserts replace, deletes remove. */
export async function applyChanges(changes: SyncChange[]): Promise<void> {
  if (!db || changes.length === 0) return;
  await db.executeSet(changeStatements(changes));
}

/**
 * One-time self-heal for mirrors built before the deleted-aircraft fix.
 *
 * Every device that synced past a tombstone it was not allowed to read still
 * holds the deleted rows, and no amount of syncing will remove them: the feed
 * only ever moves forward. Bumping this constant wipes the mirror ONCE per
 * device so the next sync rebuilds it from the server.
 */
const MIRROR_VERSION = "2";

export async function healMirrorIfStale(): Promise<boolean> {
  if (!db) return false;
  const res = await db.query("SELECT value FROM sync_state WHERE key='mirror_version'");
  const at = res.values?.[0]?.value;
  if (at === MIRROR_VERSION) return false;
  await resetLocal();
  await db.run("INSERT OR REPLACE INTO sync_state (key,value) VALUES ('mirror_version',?)", [MIRROR_VERSION]);
  return true;
}

/**
 * Drop the local mirror and the sync cursor so the next sync rebuilds from the
 * server. Queued captures and actions are deliberately KEPT — those are writes
 * that have not reached the server yet, and wiping them would lose work.
 *
 * This is the escape hatch for a mirror that has drifted. It is needed because
 * the feed is strictly forward-only (`seq > cursor`): if a change was
 * unreadable at the moment a device passed it — as every deleted aircraft's
 * tombstone was before migration 0054 — that device can never learn of it by
 * syncing, because it will never ask for that range again.
 */
export async function resetLocal(): Promise<void> {
  if (!db) return;
  await db.executeSet(resetStatements());
}

/**
 * Sign-out wipe: the mirror, the cursor AND both queues. Unlike resetLocal()
 * this DOES discard unsent work, because the alternative is worse — the queued
 * writes belong to the account that is leaving and would be pushed with the
 * next account's token. Everything readable on this device is a copy of server
 * rows the signed-in account could see, so a shared iPad must not carry them
 * across a hand-off.
 */
export async function wipeForSignOut(): Promise<void> {
  if (!db) return;
  await db.executeSet(signOutStatements());
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

/** Rows of a table scoped to one aircraft (via json_extract on aircraft_id). */
export async function getByAircraft<T = Record<string, unknown>>(table: string, aircraftId: string): Promise<T[]> {
  if (!db) return [];
  const res = await db.query(
    "SELECT data FROM records WHERE table_name=? AND json_extract(data,'$.aircraft_id')=?",
    [table, aircraftId],
  );
  return (res.values ?? []).map((r) => JSON.parse((r as { data: string }).data) as T);
}

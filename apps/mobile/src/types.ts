// Mirror of the server's pull response (see src/lib/sync/changes.ts + the
// /api/sync/pull route). Lives here rather than in sync.ts so the pure apply
// rules can be imported without pulling in Capacitor or import.meta.env.
export type SyncChange =
  | { table: string; op: "upsert"; id: string; seq: number; row: Record<string, unknown> }
  | { table: string; op: "delete"; id: string; seq: number };

export type PullPage = { changes: SyncChange[]; nextCursor: number; hasMore: boolean };

// Minimal shapes of the rows we render (a subset of the server columns). These
// move to the shared package with the monorepo consolidation.

export type Aircraft = {
  id: string;
  tail_number: string;
  make: string | null;
  model: string | null;
};

export type Page = {
  id: string;
  aircraft_id: string;
  logbook_id: string;
  page_sequence: number | null;
  storage_path: string | null;
  thumbnail_path: string | null;
};

export type Logbook = {
  id: string;
  aircraft_id: string;
  type: string;
  title: string | null;
};

export type LogEntry = {
  id: string;
  aircraft_id: string;
  page_id: string | null;
  entry_date: string | null;
  hobbs: number | null;
  tach: number | null;
  description: string | null;
  work_performed: string | null;
  parts: string | null;
  signature_name: string | null;
  mechanic_cert_number: string | null;
  ad_refs: string[] | null;
  sb_refs: string[] | null;
};

// Minimal shapes of the rows we render (a subset of the server columns). These
// move to the shared package with the monorepo consolidation.

export type Aircraft = {
  id: string;
  tail_number: string;
  make: string | null;
  model: string | null;
};

export type LogEntry = {
  id: string;
  aircraft_id: string;
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

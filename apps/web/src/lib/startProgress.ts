// Guided-start progress, derived from data rather than a stored flag, so the
// flow can be skipped and resumed and the overview chip stays truthful. Mirrors
// owner_status_ready() in migration 0066 (the admin funnel's "status ready").

export type StartProgress = { hours: boolean; annual: boolean; done: number };

export function startProgress(
  aircraft: { enrollment_tach: number | null; enrollment_hobbs: number | null },
  readingCount: number,
  items: { kind: string; last_done_date: string | null }[],
): StartProgress {
  const hours = aircraft.enrollment_tach != null || aircraft.enrollment_hobbs != null || readingCount > 0;
  const annual = items.some((i) => i.kind === "annual" && !!i.last_done_date);
  return { hours, annual, done: (hours ? 1 : 0) + (annual ? 1 : 0) };
}

import { addMonths, BOOK_NAME, counts, isAnnual, linesOf, type MapEntryRow, type MapLogbookRow, type MapLogbookType } from "./mapModel";

// ===========================================================================
// Logbook gaps (09 §2.6, §3.8): detection, reconciliation with stored rows,
// and the "what the other books show" evidence. Pure; the server writes the
// result (lib/writes/gaps.ts). Only confirmed and signed entries count
// (09 §3.1): an unread or unconfirmed page never opens or closes a gap.
// Relative imports only: tests load this file outside Next.
// ===========================================================================

export const COVERAGE_GAP_MONTHS = 24;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;

export type GapSource = "coverage_rule" | "annual_chain" | "owner";
export type DetectedGap = { logbook_id: string; from_date: string; to_date: string; source: GapSource };
export type StoredGap = DetectedGap & { id: string; status: string };

/** 09 §3.8 rules 1–3, per line (volumes of a book are one line). */
export function detectGaps(input: { year: number | null | undefined; logbook: MapLogbookRow[]; log_entry: MapEntryRow[] }): DetectedGap[] {
  const out: DetectedGap[] = [];
  for (const line of linesOf(input.logbook)) {
    const ids = new Set(line.volumes.map((v) => v.id));
    const es = input.log_entry
      .filter((e) => ids.has(e.logbook_id) && counts(e) && !e.is_continuation && e.entry_date)
      .sort((a, b) => cmp(a.entry_date!, b.entry_date!) || cmp(a.id, b.id));
    if (!es.length) continue;
    const found: DetectedGap[] = [];
    // 1. Coverage: consecutive confirmed dates more than 24 months apart.
    for (let i = 1; i < es.length; i++) {
      const a = es[i - 1], b = es[i];
      if (addMonths(a.entry_date!, COVERAGE_GAP_MONTHS) < b.entry_date!)
        found.push({ logbook_id: a.logbook_id, from_date: a.entry_date!, to_date: b.entry_date!, source: "coverage_rule" });
    }
    // 2. Annual chain (airframe): consecutive confirmed annuals more than 13 months apart, not already covered.
    if (line.logbook === "airframe") {
      const annuals = [...new Set(es.filter(isAnnual).map((e) => e.entry_date!))];
      for (let i = 1; i < annuals.length; i++) {
        const [a, b] = [annuals[i - 1], annuals[i]];
        if (addMonths(a, 13) < b && !found.some((g) => g.from_date <= a && g.to_date >= b))
          found.push({ logbook_id: es.find((e) => e.entry_date === a)!.logbook_id, from_date: a, to_date: b, source: "annual_chain" });
      }
    }
    // 3. Before the first confirmed entry, when the aircraft is at least two years older.
    const first = es[0].entry_date!;
    if (input.year && input.year <= Number(first.slice(0, 4)) - 2)
      found.push({ logbook_id: es[0].logbook_id, from_date: `${input.year}-01-01`, to_date: first, source: "coverage_rule" });
    out.push(...found.sort((a, b) => cmp(a.from_date, b.from_date)));
  }
  return out;
}

/** Overlap of two spans, as a share of the shorter one. */
function overlapShare(a: { from_date: string; to_date: string }, b: { from_date: string; to_date: string }): number {
  const ov = Math.min(day(a.to_date), day(b.to_date)) - Math.max(day(a.from_date), day(b.from_date));
  const shorter = Math.min(day(a.to_date) - day(a.from_date), day(b.to_date) - day(b.from_date));
  return shorter > 0 ? ov / shorter : 0;
}

export type GapPlan = {
  insert: DetectedGap[];
  update: { id: string; from_date: string; to_date: string; status?: "open" | "filled" }[];
};

/**
 * 09 §2.6, §3.8 rule 4. A detected gap overlapping a stored row by ≥ 50 % of the shorter span moves that row
 * (status and note kept; a `filled` row that reappears opens again). Stored system gaps no detection matches any
 * more are `filled`. Owner-declared gaps and dismissed ones are never touched.
 */
export function reconcileGaps(stored: StoredGap[], detected: DetectedGap[], logbook: MapLogbookRow[]): GapPlan {
  const lineOf = new Map(linesOf(logbook).flatMap((l) => l.volumes.map((v) => [v.id, l.lineId] as const)));
  const sameLine = (a: string, b: string) => (lineOf.get(a) ?? a) === (lineOf.get(b) ?? b);
  const plan: GapPlan = { insert: [], update: [] };
  const matched = new Set<string>();
  for (const d of detected) {
    const row = stored
      .filter((s) => !matched.has(s.id) && s.source !== "owner" && sameLine(s.logbook_id, d.logbook_id) && overlapShare(s, d) >= 0.5)
      .sort((a, b) => overlapShare(b, d) - overlapShare(a, d) || cmp(a.id, b.id))[0];
    if (!row) { plan.insert.push(d); continue; }
    matched.add(row.id);
    const reopen = row.status === "filled";
    if (reopen || row.from_date !== d.from_date || row.to_date !== d.to_date)
      plan.update.push({ id: row.id, from_date: d.from_date, to_date: d.to_date, ...(reopen ? { status: "open" as const } : {}) });
  }
  for (const s of stored)
    if (!matched.has(s.id) && s.source !== "owner" && !["filled", "dismissed"].includes(s.status))
      plan.update.push({ id: s.id, from_date: s.from_date, to_date: s.to_date, status: "filled" });
  return plan;
}

// --- Evidence (09 §3.8, §4.7) ----------------------------------------------------

export type PageRef = { pageId: string; logbook: MapLogbookType; volume: string | null; pageNumber: number | null; label: string; entryId?: string };
export type GapEvidence = {
  gap: { id: string; logbook: MapLogbookType; from: string; to: string; status: string; note: string | null; source: string };
  otherBooks: { logbook: MapLogbookType; entries: number; annuals: number; tachFrom: number | null; tachTo: number | null; pageRange: string | null }[];
  hoursFlownApprox: number | null;
  unconfirmedPagesInGap: number;
  verdict: string;
  neighbourPages: { before: PageRef | null; after: PageRef | null };
};

export function gapEvidence(input: {
  gap: StoredGap & { note?: string | null };
  logbook: MapLogbookRow[];
  log_entry: MapEntryRow[];
  page: { id: string; logbook_id: string; page_sequence: number | null }[];
}): GapEvidence | null {
  const lines = linesOf(input.logbook);
  const line = lines.find((l) => l.volumes.some((v) => v.id === input.gap.logbook_id));
  if (!line) return null;
  const { from_date: a, to_date: b } = input.gap;
  const pages = new Map(input.page.map((p) => [p.id, p]));
  const inside = (e: MapEntryRow) => !!e.entry_date && e.entry_date > a && e.entry_date < b && !e.is_continuation;
  const booksOf = (l: (typeof lines)[number]) => new Set(l.volumes.map((v) => v.id));
  const confirmedIn = input.log_entry.filter((e) => counts(e) && inside(e));
  const pageNo = (pageId: string | null | undefined) => (pageId ? pages.get(pageId)?.page_sequence ?? null : null);

  const otherBooks = lines.filter((l) => l.lineId !== line.lineId).map((l) => {
    const ids = booksOf(l);
    const es = confirmedIn.filter((e) => ids.has(e.logbook_id));
    const tachs = es.map((e) => e.tach).filter((t): t is number => t != null);
    const nums = es.map((e) => pageNo(e.page_id)).filter((n): n is number => n != null);
    const lo = Math.min(...nums), hi = Math.max(...nums);
    return {
      logbook: l.logbook, entries: es.length, annuals: es.filter(isAnnual).length,
      tachFrom: tachs.length ? Math.min(...tachs) : null, tachTo: tachs.length ? Math.max(...tachs) : null,
      pageRange: nums.length ? (lo === hi ? `${l.name} p. ${lo}` : `${l.name} p. ${lo} to ${hi}`) : null,
    };
  });

  const tachs = confirmedIn.map((e) => e.tach).filter((t): t is number => t != null);
  const hoursFlownApprox = tachs.length >= 2 ? Math.round((Math.max(...tachs) - Math.min(...tachs)) / 10) * 10 : null;
  const own = booksOf(line);
  const unconfirmedPagesInGap = new Set(input.log_entry.filter((e) => own.has(e.logbook_id) && e.trust === "ai_read" && inside(e) && e.page_id).map((e) => e.page_id)).size;
  const verdict = otherBooks.some((o) => o.annuals > 0)
    ? `The aircraft flew and was inspected. The ${BOOK_NAME[line.logbook].toLowerCase()} pages for those years are what is missing.`
    : `The other books show ${otherBooks.reduce((n, o) => n + o.entries, 0)} entries in those years.`;

  const ownConfirmed = input.log_entry.filter((e) => own.has(e.logbook_id) && counts(e) && e.entry_date && e.page_id)
    .sort((x, y) => cmp(x.entry_date!, y.entry_date!) || (pageNo(x.page_id) ?? 0) - (pageNo(y.page_id) ?? 0));
  const ref = (e: MapEntryRow | undefined): PageRef | null => {
    if (!e?.page_id) return null;
    const n = pageNo(e.page_id);
    return { pageId: e.page_id, logbook: line.logbook, volume: null, pageNumber: n, label: n != null ? `${line.name} p. ${n}` : line.name, entryId: e.id };
  };
  return {
    gap: { id: input.gap.id, logbook: line.logbook, from: a, to: b, status: input.gap.status, note: input.gap.note ?? null, source: input.gap.source },
    otherBooks, hoursFlownApprox, unconfirmedPagesInGap, verdict,
    neighbourPages: {
      before: ref(ownConfirmed.filter((e) => e.entry_date! <= a).at(-1)),
      after: ref(ownConfirmed.find((e) => e.entry_date! >= b)),
    },
  };
}

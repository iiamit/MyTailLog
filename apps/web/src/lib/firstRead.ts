import { BOOK_NAME, counts, linesOf, majorLabel, type MapEntryRow, type MapInput, type MapLogbookType } from "./mapModel";
import { gapEvidence, type PageRef, type StoredGap } from "./gaps";
import { adNumbersMatch, cleanAdNumber } from "./faa/adNumber";

// ===========================================================================
// First read (08 §3.7 C-BOOKS-06, 09 §4.7, W-BOOKS-09): what one logbook revealed, computed on
// read from confirmed and signed entries only (09 §3.1). Ready when the book has at least 10 pages,
// every page is read and none waits for review. Findings, at most 5, in the order 08 gives:
// gaps, ADs mentioned but not tracked, recurring repairs, big changes, breaks in the annual chain.
// shortcut: recurring repairs need the one AI call 08 §3.7 describes, which is not built; they are
// left out and `aiPartial` is true, so the page shows "Recurring repairs will be added when
// reading resumes." Add the AI pass (counting toward the allowance) to fill them.
// Relative imports only: tests load this file outside Next.
// ===========================================================================

export type FindingKind = "gap" | "recurring_repair" | "big_change" | "annual_chain" | "untracked_ad";
export type Finding = { kind: FindingKind; text: string; citations: PageRef[] };
export type FirstRead = {
  logbookId: string;
  ready: boolean;
  pages: number;
  /** Beyond 09 §4.7, for the "not ready" states of W-BOOKS-09 and 07 F04. */
  pagesToReview: number;
  pagesBeingRead: number;
  from: string | null;
  to: string | null;
  findings: Finding[];
  nextBook: { logbook: MapLogbookType; reason: string } | null;
  aiPartial: boolean;
};

export const FIRST_READ_MIN_PAGES = 10;
const MAX_FINDINGS = 5;
const AD_IN_TEXT = /\bA\.?D\.?\s*#?\s*-?\s*(\d{2,4}-\d{2}-\d{2,3})\b/gi;
const ENGINE_OVERHAUL = /\b(engine|motor)\b[^.]{0,40}\boverhaul/i;
const year = (d: string) => d.slice(0, 4);

export function firstRead(input: MapInput, logbookId: string): FirstRead | null {
  const lines = linesOf(input.logbook ?? []);
  const line = lines.find((l) => l.books.has(logbookId));
  if (!line) return null;

  const pages = (input.page ?? []).filter((p) => line.books.has(p.logbook_id));
  const pageNo = new Map(pages.map((p) => [p.id, p.page_sequence]));
  const entries = (input.log_entry ?? []).filter((e) => line.books.has(e.logbook_id));
  const waiting = new Set(entries.filter((e) => e.trust === "ai_read" && !e.replaced_by_entry_id && e.page_id).map((e) => e.page_id));
  const pagesBeingRead = pages.filter((p) => p.extraction_status !== "extracted" && p.extraction_status !== "failed").length;
  const pagesToReview = pages.filter((p) => waiting.has(p.id)).length;
  const ready = pages.length >= FIRST_READ_MIN_PAGES && pagesBeingRead === 0 && pagesToReview === 0;

  const confirmed = entries
    .filter((e) => counts(e) && !e.is_continuation && e.entry_date)
    .sort((a, b) => (a.entry_date! < b.entry_date! ? -1 : a.entry_date! > b.entry_date! ? 1 : 0));
  const ref = (e: MapEntryRow): PageRef | null => {
    if (!e.page_id) return null;
    const vol = line.volumes.length > 1 ? line.volumes.find((v) => v.id === e.logbook_id)?.label ?? null : null;
    const n = pageNo.get(e.page_id) ?? null;
    return { pageId: e.page_id, logbook: line.logbook, volume: vol, pageNumber: n, label: `${line.name}${vol ? ` ${vol},` : ""}${n != null ? ` p. ${n}` : ""}`, entryId: e.id };
  };
  const cite = (es: MapEntryRow[]) => es.map(ref).filter((r): r is PageRef => !!r).slice(0, 3);

  const findings: Finding[] = [];
  if (ready) {
    const gaps = (input.logbook_gap ?? []).filter((g) => line.books.has(g.logbook_id) && g.status === "open");
    const gapFinding = (g: (typeof gaps)[number]): Finding => {
      const ev = gapEvidence({ gap: { ...g, source: (g.source ?? "coverage_rule") as StoredGap["source"] }, logbook: input.logbook ?? [], log_entry: entries, page: pages });
      const n = ev?.neighbourPages;
      return g.source === "annual_chain"
        ? { kind: "annual_chain", text: `No annual recorded between ${year(g.from_date)} and ${year(g.to_date)}.`, citations: [n?.before, n?.after].filter((r): r is PageRef => !!r) }
        : { kind: "gap", text: `No pages, ${year(g.from_date)} to ${year(g.to_date)}.`, citations: [n?.before, n?.after].filter((r): r is PageRef => !!r) };
    };
    findings.push(...gaps.filter((g) => g.source !== "annual_chain").map(gapFinding));

    // ADs the book mentions that no tracked AD matches.
    const tracked = (input.ad_compliance ?? []).map((a) => a.reference).filter((r): r is string => !!r).map(cleanAdNumber);
    const mentioned = new Map<string, MapEntryRow[]>();
    for (const e of confirmed)
      for (const m of (e.description ?? "").matchAll(AD_IN_TEXT)) {
        const n = cleanAdNumber(m[1]);
        if (tracked.some((t) => adNumbersMatch(t, n))) continue;
        mentioned.set(n, [...(mentioned.get(n) ?? []), e]);
      }
    for (const [n, es] of mentioned) findings.push({ kind: "untracked_ad", text: `AD ${n} is mentioned but not tracked.`, citations: cite(es) });

    for (const e of confirmed.filter((x) => majorLabel(x) || /\bSTC\b/.test(x.description ?? ""))) {
      const what = (e.description ?? majorLabel(e) ?? "").split(/(?<=\.)\s/)[0].replace(/\.$/, "").slice(0, 100);
      findings.push({ kind: "big_change", text: `${what}, ${year(e.entry_date!)}.`, citations: cite([e]) });
    }
    findings.push(...gaps.filter((g) => g.source === "annual_chain").map(gapFinding));
  }

  // Next: the engine book when this airframe book mentions an engine overhaul and the engine book is
  // empty; otherwise the main book with the fewest pages (08 §3.7).
  const pagesOf = (t: MapLogbookType) => {
    const ids = new Set(lines.filter((l) => l.logbook === t).flatMap((l) => [...l.books]));
    return (input.page ?? []).filter((p) => ids.has(p.logbook_id)).length;
  };
  let nextBook: FirstRead["nextBook"] = null;
  if (line.logbook === "airframe" && pagesOf("engine") === 0 && confirmed.some((e) => ENGINE_OVERHAUL.test(e.description ?? "")))
    nextBook = { logbook: "engine", reason: "The airframe book mentions an engine overhaul, but the hours since it and the oil changes live in the engine book." };
  else {
    const other = (["airframe", "engine", "prop"] as MapLogbookType[]).filter((t) => t !== line.logbook)
      .sort((a, b) => pagesOf(a) - pagesOf(b))[0];
    nextBook = { logbook: other, reason: pagesOf(other) === 0 ? `No ${BOOK_NAME[other].toLowerCase()} pages are in yet.` : `The ${BOOK_NAME[other].toLowerCase()} book has the fewest pages in so far.` };
  }

  return {
    logbookId, ready, pages: pages.length, pagesToReview, pagesBeingRead,
    from: confirmed[0]?.entry_date ?? null, to: confirmed.at(-1)?.entry_date ?? null,
    findings: findings.slice(0, MAX_FINDINGS), nextBook, aiPartial: ready,
  };
}

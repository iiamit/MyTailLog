// ===========================================================================
// Duplicate detection.
//
// Re-uploading / re-capturing / re-extracting the same physical page produces
// duplicate PAGES (and therefore duplicate ENTRIES). A two-up spread split can
// also leave the same entry on two different pages. These are pure heuristics
// over the already-loaded rows — advisory only; the user confirms every delete.
//
// Approach: entry duplicates are the fundamental signal, gated HARD on date and
// tach/hobbs — those identify the event. Recurring maintenance repeats verbatim
// across dates, so matching text alone never counts; a differing date or meter
// rules out a duplicate outright. Page duplicates are two pages that look like the
// same scan (high OCR-text overlap, or every entry on one duplicated on the
// other). The page listing subsumes the entry listing, so the caller filters
// entry clusters that a page cluster already covers (see filterEntryClusters).
//
// ponytail: O(n^2) per logbook. Fine for a personal logbook (hundreds–a few
// thousand entries); bucket by date first if one logbook ever dwarfs that.
// ===========================================================================

export type DupEntry = {
  id: string;
  page_id: string | null;
  logbook_id: string;
  entry_date: string | null;
  tach: number | null;
  hobbs: number | null;
  text: string; // description + work_performed, raw
  owner_confirmed: boolean;
  created_at: string;
};

export type DupPage = {
  id: string;
  logbook_id: string;
  ocr_text: string | null;
  created_at: string;
  entryIds: string[];
};

export type Cluster = { ids: string[]; keepId: string };

// Tuning knobs (calibration) — deliberately exposed. Extraction/OCR drift is
// real, so these are thresholds, not equality. Loosen if dupes slip through;
// tighten if unrelated entries get grouped.
export const ENTRY_TEXT_SIM = 0.5; // min token overlap AFTER date/meter agree
export const PAGE_TEXT_SIM = 0.7; // min OCR-text overlap for two pages to be dupes
const METER_EPS = 0.05; // tach/hobbs within this are "the same reading"

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((t) => t.length >= 3),
  );
}

/** Jaccard similarity of two token sets. Two empty sets → 0, not 1: a pair of
 *  contentless entries carries no evidence that they're the same event. */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

// Date and tach/hobbs are the IDENTITY of a logged event. Recurring maintenance
// (oil changes, annuals) reads verbatim the same on every occurrence, so text is
// never sufficient on its own — a differing date or meter means different events.
const closeMeter = (x: number | null, y: number | null) =>
  x != null && y != null && Math.abs(x - y) <= METER_EPS;

function datesConflict(a: DupEntry, b: DupEntry): boolean {
  return !!a.entry_date && !!b.entry_date && a.entry_date !== b.entry_date;
}
function metersConflict(a: DupEntry, b: DupEntry): boolean {
  if (a.tach != null && b.tach != null && Math.abs(a.tach - b.tach) > METER_EPS) return true;
  if (a.hobbs != null && b.hobbs != null && Math.abs(a.hobbs - b.hobbs) > METER_EPS) return true;
  return false;
}
// A shared, matching anchor must exist — a real equal date, or an equal meter.
function sharedAnchor(a: DupEntry, b: DupEntry): boolean {
  return (
    (!!a.entry_date && a.entry_date === b.entry_date) ||
    closeMeter(a.tach, b.tach) ||
    closeMeter(a.hobbs, b.hobbs)
  );
}

function entriesDuplicate(a: DupEntry, ta: Set<string>, b: DupEntry, tb: Set<string>): boolean {
  // Hard gate on date/tach: any disagreement, or the absence of a shared anchor,
  // rules out a duplicate no matter how identical the text is.
  if (datesConflict(a, b) || metersConflict(a, b) || !sharedAnchor(a, b)) return false;
  // Same coordinates — confirm the work text agrees so two distinct items logged
  // at the same date+meter (e.g. an oil change and a tire swap) aren't merged.
  return jaccard(ta, tb) >= ENTRY_TEXT_SIM;
}

// --- Union-find over an index space -----------------------------------------
class DSU {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  union(a: number, b: number): void {
    this.parent[this.find(a)] = this.find(b);
  }
}

function clustersFrom<T extends { id: string }>(
  items: T[],
  dsu: DSU,
  keepOf: (members: T[]) => string,
): Cluster[] {
  const groups = new Map<number, T[]>();
  for (let i = 0; i < items.length; i++) {
    const root = dsu.find(i);
    (groups.get(root) ?? groups.set(root, []).get(root)!).push(items[i]);
  }
  const out: Cluster[] = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    out.push({ ids: members.map((m) => m.id), keepId: keepOf(members) });
  }
  return out;
}

/** Keep the confirmed entry if any, else the earliest captured (the original). */
function keepEntry(members: DupEntry[]): string {
  return [...members].sort(
    (a, b) =>
      Number(b.owner_confirmed) - Number(a.owner_confirmed) ||
      a.created_at.localeCompare(b.created_at),
  )[0].id;
}

/** Cluster entries that look like the same logged event. Only ever groups
 *  entries within the same logbook (a dup can't span logbooks). */
export function findEntryDuplicates(entries: DupEntry[]): Cluster[] {
  const clusters: Cluster[] = [];
  const byLogbook = new Map<string, DupEntry[]>();
  for (const e of entries) {
    (byLogbook.get(e.logbook_id) ?? byLogbook.set(e.logbook_id, []).get(e.logbook_id)!).push(e);
  }
  for (const group of byLogbook.values()) {
    const toks = group.map((e) => tokens(e.text));
    const dsu = new DSU(group.length);
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (entriesDuplicate(group[i], toks[i], group[j], toks[j])) dsu.union(i, j);
      }
    }
    clusters.push(...clustersFrom(group, dsu, keepEntry));
  }
  return clusters;
}

/** Cluster pages that look like the same scan: high OCR-text overlap, or every
 *  entry on one page duplicated on the other (via the entry clusters). */
export function findPageDuplicates(pages: DupPage[], entryClusters: Cluster[]): Cluster[] {
  // entryId → cluster index, so two pages sharing whole clusters are detectable.
  const clusterOf = new Map<string, number>();
  entryClusters.forEach((c, ci) => c.ids.forEach((id) => clusterOf.set(id, ci)));
  const entrySignature = (p: DupPage): Set<number> => {
    const s = new Set<number>();
    for (const id of p.entryIds) {
      const ci = clusterOf.get(id);
      if (ci != null) s.add(ci);
    }
    return s;
  };

  const clusters: Cluster[] = [];
  const byLogbook = new Map<string, DupPage[]>();
  for (const p of pages) {
    (byLogbook.get(p.logbook_id) ?? byLogbook.set(p.logbook_id, []).get(p.logbook_id)!).push(p);
  }
  for (const group of byLogbook.values()) {
    const ocr = group.map((p) => (p.ocr_text ? tokens(p.ocr_text) : new Set<string>()));
    const sig = group.map(entrySignature);
    const dsu = new DSU(group.length);
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const textDup = jaccard(ocr[i], ocr[j]) >= PAGE_TEXT_SIM;
        // Every entry on each page falls in a shared duplicate cluster, and both
        // pages actually have entries — the same set of events on two pages.
        const bothHaveEntries = sig[i].size > 0 && sig[i].size === group[i].entryIds.length &&
          sig[j].size > 0 && sig[j].size === group[j].entryIds.length;
        const entryDup =
          bothHaveEntries &&
          sig[i].size === sig[j].size &&
          [...sig[i]].every((ci) => sig[j].has(ci));
        if (textDup || entryDup) dsu.union(i, j);
      }
    }
    clusters.push(
      ...clustersFrom(group, dsu, (members) =>
        // Keep the earliest scan (the original); re-uploads came later.
        [...members].sort((a, b) => a.created_at.localeCompare(b.created_at))[0].id,
      ),
    );
  }
  return clusters;
}

/** Drop entry clusters already covered by a page cluster: any entry on a page
 *  that a page cluster will delete is handled there. Shrinks each cluster to the
 *  entries still on surviving pages; clusters below 2 survivors are dropped. */
export function filterEntryClusters(
  entryClusters: Cluster[],
  pageClusters: Cluster[],
  pageOfEntry: Map<string, string | null>,
): Cluster[] {
  const doomedPages = new Set<string>();
  for (const pc of pageClusters) {
    for (const pid of pc.ids) if (pid !== pc.keepId) doomedPages.add(pid);
  }
  if (doomedPages.size === 0) return entryClusters;
  const out: Cluster[] = [];
  for (const c of entryClusters) {
    const survivors = c.ids.filter((id) => {
      const pid = pageOfEntry.get(id);
      return !(pid && doomedPages.has(pid));
    });
    if (survivors.length < 2) continue;
    const keepId = survivors.includes(c.keepId) ? c.keepId : survivors[0];
    out.push({ ids: survivors, keepId });
  }
  return out;
}

// --- self-check (run: npx tsx src/lib/duplicates.ts) ------------------------
if (process.argv[1] && process.argv[1].endsWith("duplicates.ts")) {
  const assert = (c: boolean, m: string) => {
    if (!c) throw new Error("FAIL: " + m);
  };
  const e = (o: Partial<DupEntry> & { id: string }): DupEntry => ({
    page_id: null, logbook_id: "L", entry_date: null, tach: null, hobbs: null,
    text: "", owner_confirmed: false, created_at: "2024-01-01T00:00:00Z", ...o,
  });

  // Re-uploaded page: identical entry text → duplicate, keep the confirmed one.
  let ec = findEntryDuplicates([
    e({ id: "a", entry_date: "2024-03-01", tach: 1200.5, text: "Oil change and filter, ground run good", owner_confirmed: true, created_at: "t1" }),
    e({ id: "b", entry_date: "2024-03-01", tach: 1200.5, text: "Oil change and filter, ground run good", created_at: "t2" }),
  ]);
  assert(ec.length === 1 && ec[0].ids.length === 2 && ec[0].keepId === "a", "identical entries cluster, keep confirmed");

  // Recurring maintenance: verbatim-same text on DIFFERENT dates → NOT dupes.
  assert(
    findEntryDuplicates([
      e({ id: "a", entry_date: "2023-03-01", tach: 1100.0, text: "Oil change and filter, ground run good" }),
      e({ id: "b", entry_date: "2024-03-01", tach: 1200.5, text: "Oil change and filter, ground run good" }),
    ]).length === 0,
    "identical text on different date+tach → not dupes",
  );
  // Same date but different tach, identical text → NOT dupes (different events).
  assert(
    findEntryDuplicates([
      e({ id: "a", entry_date: "2024-03-01", tach: 1200.5, text: "Oil change and filter, ground run good" }),
      e({ id: "b", entry_date: "2024-03-01", tach: 1250.0, text: "Oil change and filter, ground run good" }),
    ]).length === 0,
    "identical text, same date but different tach → not dupes",
  );

  // Same date+meter but different work → NOT duplicates (two items same visit).
  assert(
    findEntryDuplicates([
      e({ id: "a", entry_date: "2024-03-01", tach: 1200.5, text: "replaced left magneto" }),
      e({ id: "b", entry_date: "2024-03-01", tach: 1200.5, text: "annual inspection completed airworthy" }),
    ]).length === 0,
    "same date+meter, different work → not dupes",
  );

  // Contentless entries (no text/date/meter) must NOT be flagged.
  assert(findEntryDuplicates([e({ id: "a" }), e({ id: "b" })]).length === 0, "contentless entries never cluster");

  // Different logbooks never merge even with identical content.
  assert(
    findEntryDuplicates([
      e({ id: "a", logbook_id: "L1", text: "oil change and filter replaced" }),
      e({ id: "b", logbook_id: "L2", text: "oil change and filter replaced" }),
    ]).length === 0,
    "cross-logbook entries never cluster",
  );

  // Two pages whose entries are all duplicates → duplicate pages; entry cluster
  // then filtered out (covered by the page cluster).
  const entries = [
    e({ id: "a", page_id: "p1", entry_date: "2024-03-01", tach: 1200.5, text: "oil change and filter, ground run good", created_at: "t1" }),
    e({ id: "b", page_id: "p2", entry_date: "2024-03-01", tach: 1200.5, text: "oil change and filter, ground run good", created_at: "t2" }),
  ];
  ec = findEntryDuplicates(entries);
  const pc = findPageDuplicates(
    [
      { id: "p1", logbook_id: "L", ocr_text: null, created_at: "t1", entryIds: ["a"] },
      { id: "p2", logbook_id: "L", ocr_text: null, created_at: "t2", entryIds: ["b"] },
    ],
    ec,
  );
  assert(pc.length === 1 && pc[0].keepId === "p1", "all-entries-dup pages cluster, keep earliest");
  const pageOf = new Map(entries.map((x) => [x.id, x.page_id]));
  assert(filterEntryClusters(ec, pc, pageOf).length === 0, "entry cluster covered by page cluster is filtered out");

  console.log("ok");
}

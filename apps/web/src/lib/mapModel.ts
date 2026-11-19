import { createHash } from "node:crypto";
import { computeStatus, type DueInput, type ItemCompletionRow, type LogEntryRow, type Trust } from "./due/engine";

// ===========================================================================
// MapModel (09 §3.7, §4.6; 10-line-map.md §2): the line map of an aircraft's
// life, derived from synced rows. Pure (no I/O, no clock), so the route, the
// fixture generator (packages/shared/scripts/build-map-fixtures.ts) and the
// Kotlin port (apps/core/domain/.../map/MapModel.kt) share one set of rules.
// Change one, change both and regenerate the fixtures.
//
// The unconfirmed gate (09 §3.1): ai_read entries draw dotted stops and join
// interchanges, but never place a ring, a visit or an era — rings come from
// the due engine, which only counts confirmed and signed entries.
// Relative imports only: the fixture generator runs this file outside Next.
// ===========================================================================

export type MapLogbookType = "airframe" | "engine" | "prop" | "avionics";

// --- Input: database rows (snake_case, as stored) ---------------------------

export type MapLogbookRow = { id: string; type: string; component_ref?: string | null; title?: string | null };
export type MapEntryRow = LogEntryRow & {
  is_continuation?: boolean;
  mechanic_cert_number?: string | null;
  entry_kind?: string | null;
  description?: string | null;
};
export type MapPageRow = { id: string; logbook_id: string; page_sequence: number | null; extraction_status?: string; landing_date?: string | null };
export type MapGapRow = { id: string; logbook_id: string; from_date: string; to_date: string; status: string; source?: string; note?: string | null };
export type MapSquawkRow = {
  id: string; description: string; severity: string | null; status: string;
  reported_at?: string | null; resolved_at?: string | null; resolved_log_entry_id?: string | null;
};
export type MapAircraftRow = DueInput["aircraft"] & { year?: number | null };

/** Every row the map reads: the due engine's rows (for rings) plus gaps, pages and squawk dates. */
export type MapInput = Omit<DueInput, "aircraft" | "logbook" | "log_entry" | "page" | "squawk"> & {
  aircraft: MapAircraftRow;
  logbook?: MapLogbookRow[];
  log_entry?: MapEntryRow[];
  page?: MapPageRow[];
  squawk?: MapSquawkRow[];
  logbook_gap?: MapGapRow[];
};

export type MapOptions = {
  from?: string;
  to?: string;
  /** Only these book types (query `logbooks=engine,prop`); all when absent. */
  only?: MapLogbookType[];
};

// --- Output: API shapes (camelCase, 09 §4.6, 10 §2) --------------------------

export type MapLine = {
  /** The line's id: its first volume's logbook id. Every element names its line by this. */
  lineId: string;
  logbook: MapLogbookType;
  logbookId: string;
  name: string;
  volumes: { id: string; label: string; from: string | null; to: string | null }[];
};
export type MapStop = {
  id: string; lineId: string; logbook: MapLogbookType; date: string; entryIds: string[]; trust: Trust;
  pageIds: string[]; label: string | null; major: boolean;
};
export type MapInterchange = { id: string; date: string; stopIds: string[]; lineIds: string[]; trust: Trust; label: string | null };
export type MapGap = {
  id: string; lineId: string; logbook: MapLogbookType; from: string; to: string;
  status: "open" | "asked_previous_owner" | "no_pages_exist"; unconfirmedPages: number;
};
export type MapEra = { lineId: string; logbook: MapLogbookType; from: string; to: string | null; label: string; anchorEntryId: string | null };
export type MapSquawk = { id: string; date: string; open: boolean; line: MapLogbookType; lineId: string };
export type MapRing = {
  itemKey: string; line: string; lineId: string; date: string; dateKind: "calendar" | "projected";
  status: "overdue" | "due_soon" | "current"; label: string; kind: string;
};
export type MapVisit = { id: string | null; suggestionKey: string | null; state: "suggested" | "planned" | "in_shop"; weekOf: string; itemKeys: string[]; label: string };
export type MapModel = {
  today: string;
  range: { from: string; to: string; scaleBreak: string | null };
  lines: MapLine[];
  stops: MapStop[];
  interchanges: MapInterchange[];
  gaps: MapGap[];
  eras: MapEra[];
  squawks: MapSquawk[];
  rings: MapRing[];
  visits: MapVisit[];
  undatedEntries: number;
};

// --- Helpers -----------------------------------------------------------------

/** Lane order; the Other book is never a line (14-decisions.md M1). */
export const LANES: MapLogbookType[] = ["airframe", "engine", "prop", "avionics"];
export const BOOK_NAME: Record<MapLogbookType, string> = { airframe: "Airframe", engine: "Engine", prop: "Propeller", avionics: "Avionics" };
const TRUST_RANK: Record<Trust, number> = { ai_read: 0, confirmed: 1, signed: 2 };
const lowest = (ts: Trust[]) => ts.reduce<Trust>((low, t) => (TRUST_RANK[t] < TRUST_RANK[low] ? t : low), "signed");
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const BEING_READ = new Set(["queued", "processing", "waiting_allowance"]);
/** Dismissed and filled gaps are not drawn (09 §3.7). */
const DRAWN_GAPS = ["open", "asked_previous_owner", "no_pages_exist"];

export const isIsoDate = (s: string) => DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const sha16 = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 16);

/** Stable stop id: sha1(logbookId + '|' + date), first 16 hex (09 §4.6). */
export const stopId = (logbookId: string, date: string) => sha16(`${logbookId}|${date}`);
/** Interchange id: sha1 of the sorted stop ids joined by '|', first 16 hex. */
export const interchangeId = (stopIds: string[]) => sha16([...stopIds].sort().join("|"));

/** Calendar date in the owner's IANA zone (14-decisions.md K4); UTC when unknown or invalid. */
export function todayIn(timeZone: string | null | undefined, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || "UTC" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Same day of month, `months` later (negative goes back), clamped to month end. */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

/** Entries that count for anything derived (09 §3.1). */
export const counts = (e: { trust: Trust; replaced_by_entry_id?: string | null }) => e.trust !== "ai_read" && !e.replaced_by_entry_id;

/** Certificate numbers compared without spaces, punctuation or case ("A&P 3105582 IA" = "a&p3105582ia"). */
export const normCert = (c: string | null | undefined) => (c ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const KIND_LABEL: Record<string, string> = {
  engine_overhaul: "Engine overhaul", prop_overhaul: "Propeller overhaul", overhaul: "Overhaul",
  major_repair: "Major repair", major_alteration: "Major alteration", form_337: "Major alteration",
  install: "Installation", installation: "Installation", engine_replacement: "Engine replaced",
  prop_replacement: "Propeller replaced",
};
const MAJOR_TEXT = /\b(overhaul(ed)?|form 337|major (repair|alteration))\b/i;
/** Major kind of an entry (10 §2), or null. `entry_kind` first, then the words of older rows. */
export function majorLabel(e: MapEntryRow): string | null {
  if (e.entry_kind && KIND_LABEL[e.entry_kind]) return KIND_LABEL[e.entry_kind];
  return MAJOR_TEXT.test(e.description ?? "") ? "Major work" : null;
}
export const isAnnual = (e: { entry_kind?: string | null; description?: string | null }) =>
  e.entry_kind === "annual" || /\bannual\b/i.test(e.description ?? "");

/** Thousands separators without locale data, so the Kotlin port prints the same ("1,234"). */
export const thousands = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

type Line = MapLine & { books: Set<string> };

/** Books grouped into lines: one per (type, component_ref); volumes of a book share its line (10 §1). */
export function linesOf(logbooks: MapLogbookRow[], only?: MapLogbookType[]): Line[] {
  const out: Line[] = [];
  for (const type of LANES) {
    if (only && !only.includes(type)) continue;
    const books = logbooks.filter((b) => b.type === type);
    const refs = [...new Set(books.map((b) => b.component_ref ?? ""))].sort(cmp);
    for (const ref of refs) {
      const vols = books.filter((b) => (b.component_ref ?? "") === ref).sort((a, b) => cmp(a.id, b.id));
      const name = refs.length > 1 ? `${BOOK_NAME[type]} ${refs.indexOf(ref) + 1}` : BOOK_NAME[type];
      out.push({
        lineId: vols[0].id, logbook: type, logbookId: vols[0].id, name, books: new Set(vols.map((v) => v.id)),
        volumes: vols.map((v, i) => ({ id: v.id, label: v.title ?? (vols.length > 1 ? `Vol. ${i + 1}` : name), from: null, to: null })),
      });
    }
  }
  return out;
}

// --- Derivation ----------------------------------------------------------------

export function buildMapModel(input: MapInput, today: string, opts: MapOptions = {}): MapModel {
  const lines = linesOf(input.logbook ?? [], opts.only);
  const lineOfBook = new Map(lines.flatMap((l) => [...l.books].map((b) => [b, l] as const)));
  const firstLine = (type: string) => lines.find((l) => l.logbook === type) ?? lines.find((l) => l.logbook === "airframe") ?? lines[0];
  const pages = new Map((input.page ?? []).map((p) => [p.id, p]));

  // Drawable entries (09 §3.7): not replaced, not a continuation fragment, not on a page still being read.
  const drawable = (input.log_entry ?? []).filter((e) => {
    const page = e.page_id ? pages.get(e.page_id) : undefined;
    return lineOfBook.has(e.logbook_id) && !e.replaced_by_entry_id && !e.is_continuation && !BEING_READ.has(page?.extraction_status ?? "");
  });
  const dateOf = (e: MapEntryRow) => e.entry_date ?? (e.page_id ? pages.get(e.page_id)?.landing_date ?? null : null);
  const undatedEntries = drawable.filter((e) => !dateOf(e)).length;

  // Volumes span their dated entries.
  for (const l of lines)
    for (const v of l.volumes) {
      const ds = drawable.filter((e) => e.logbook_id === v.id).map(dateOf).filter((d): d is string => !!d).sort(cmp);
      v.from = ds[0] ?? null;
      v.to = ds[ds.length - 1] ?? null;
    }

  // --- Stops: one per (line, date) ---
  const groups = new Map<string, MapEntryRow[]>();
  for (const e of drawable) {
    const d = dateOf(e);
    if (!d) continue;
    const key = `${lineOfBook.get(e.logbook_id)!.lineId}|${d}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const firstDate = new Map<string, string>();
  for (const key of groups.keys()) {
    const [lineId, d] = key.split("|");
    if (!firstDate.has(lineId) || d < firstDate.get(lineId)!) firstDate.set(lineId, d);
  }
  const laneIndex = new Map(lines.map((l, i) => [l.lineId, i]));
  const allStops: (MapStop & { entries: MapEntryRow[] })[] = [...groups].map(([key, es]) => {
    const [lineId, date] = key.split("|");
    const line = lines[laneIndex.get(lineId)!];
    const major = es.map(majorLabel).find((m) => m) ?? null;
    const first = firstDate.get(lineId) === date;
    return {
      id: stopId(lineId, date), lineId, logbook: line.logbook, date,
      entryIds: es.map((e) => e.id).sort(cmp), trust: lowest(es.map((e) => e.trust)),
      pageIds: [...new Set(es.map((e) => e.page_id).filter((p): p is string => !!p))].sort(cmp),
      label: major ?? (first ? "First entry" : null), major: !!major || first, entries: es,
    };
  });
  allStops.sort((a, b) => laneIndex.get(a.lineId)! - laneIndex.get(b.lineId)! || cmp(a.date, b.date));

  const drawnGap = (g: MapGapRow) => lineOfBook.has(g.logbook_id) && DRAWN_GAPS.includes(g.status);
  const from = opts.from ?? [...allStops.map((s) => s.date), ...(input.logbook_gap ?? []).filter(drawnGap).map((g) => g.from_date), today].sort(cmp)[0];
  const to = opts.to ?? addMonths(today, 12);
  const inRange = (d: string) => d >= from && d <= to;
  const overlaps = (a: string, b: string) => a <= to && b >= from;

  // --- Interchanges (09 §3.7): same date, ≥ 2 lines, a shared certificate or tach within 0.5 h ---
  const byDate = new Map<string, typeof allStops>();
  for (const s of allStops) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
  const interchanges: MapInterchange[] = [];
  for (const [date, ss] of byDate) {
    if (ss.length < 2) continue;
    const parent = ss.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < ss.length; i++)
      for (let j = i + 1; j < ss.length; j++)
        if (ss[i].entries.some((a) => ss[j].entries.some((b) => sameVisit(a, b)))) parent[find(j)] = find(i);
    const comps = new Map<number, typeof allStops>();
    ss.forEach((s, i) => comps.set(find(i), [...(comps.get(find(i)) ?? []), s]));
    for (const c of comps.values()) {
      if (c.length < 2) continue;
      const annual = c.some((s) => s.entries.some(isAnnual));
      interchanges.push({
        id: interchangeId(c.map((s) => s.id)), date, stopIds: c.map((s) => s.id), lineIds: c.map((s) => s.lineId),
        trust: lowest(c.map((s) => s.trust)), label: annual ? "Annual" : null,
      });
    }
  }
  interchanges.sort((a, b) => cmp(a.date, b.date) || cmp(a.id, b.id));

  // --- Gaps (09 §3.7): owner-visible statuses only; unconfirmed pages of the book inside the span ---
  const gaps: MapGap[] = [];
  for (const g of input.logbook_gap ?? []) {
    const line = lineOfBook.get(g.logbook_id);
    if (!line || !drawnGap(g) || !overlaps(g.from_date, g.to_date)) continue;
    const pagesIn = new Set(drawable.filter((e) => line.books.has(e.logbook_id) && e.trust === "ai_read" && e.page_id
      && (dateOf(e) ?? "") > g.from_date && (dateOf(e) ?? "") < g.to_date).map((e) => e.page_id));
    gaps.push({ id: g.id, lineId: line.lineId, logbook: line.logbook, from: g.from_date, to: g.to_date, status: g.status as MapGap["status"], unconfirmedPages: pagesIn.size });
  }
  gaps.sort((a, b) => laneIndex.get(a.lineId)! - laneIndex.get(b.lineId)! || cmp(a.from, b.from));

  // --- Due engine: rings and the current tach for era labels (confirmed data only) ---
  const status = computeStatus(input as DueInput, today);

  // --- Eras (09 §3.7): from each confirmed overhaul to the next, the latest to today ---
  const entryById = new Map((input.log_entry ?? []).map((e) => [e.id, e]));
  const eras: MapEra[] = [];
  for (const [type, kind] of [["engine", "engine_tbo"], ["prop", "prop_overhaul"]] as const) {
    const itemIds = new Set((input.maintenance_item ?? []).filter((m) => m.kind === kind).map((m) => m.id));
    const anchors: { date: string; tach: number | null; entryId: string | null; lineId: string | null }[] = [];
    const counted = (c: ItemCompletionRow) => {
      const e = c.log_entry_id ? entryById.get(c.log_entry_id) : undefined;
      return !c.log_entry_id || (!!e && counts(e));
    };
    for (const c of input.item_completion ?? []) {
      if (!c.maintenance_item_id || !itemIds.has(c.maintenance_item_id) || !counted(c)) continue;
      const e = c.log_entry_id ? entryById.get(c.log_entry_id) : undefined;
      anchors.push({ date: c.done_date, tach: c.done_hours ?? e?.tach ?? null, entryId: c.log_entry_id, lineId: e ? lineOfBook.get(e.logbook_id)?.lineId ?? null : null });
    }
    for (const e of input.log_entry ?? [])
      if (e.entry_kind === `${type}_overhaul` && counts(e) && e.entry_date && !anchors.some((a) => a.date === e.entry_date))
        anchors.push({ date: e.entry_date, tach: e.tach ?? null, entryId: e.id, lineId: lineOfBook.get(e.logbook_id)?.lineId ?? null });
    anchors.sort((a, b) => cmp(a.date, b.date));
    const deduped = anchors.filter((a, i) => i === 0 || a.date !== anchors[i - 1].date);
    deduped.forEach((a, i) => {
      const line = (a.lineId && lines.find((l) => l.lineId === a.lineId && l.logbook === type)) || lines.find((l) => l.logbook === type);
      if (!line) return;
      const next = deduped[i + 1];
      const endTach = next ? next.tach : status.meters.tach.stitched;
      const hours = a.tach != null && endTach != null ? endTach - a.tach : null;
      const label = next
        ? hours != null ? `${thousands(hours)} h, ${a.date.slice(0, 4)} to ${next.date.slice(0, 4)}` : `${a.date.slice(0, 4)} to ${next.date.slice(0, 4)}`
        : hours != null ? `${thousands(hours)} h since overhaul` : `Since overhaul, ${a.date.slice(0, 4)}`;
      if (overlaps(a.date, next?.date ?? today))
        eras.push({ lineId: line.lineId, logbook: type, from: a.date, to: next?.date ?? null, label, anchorEntryId: a.entryId });
    });
  }

  // --- Squawks (09 §3.7): open at reported, resolved at resolved, on the clearing entry's line else airframe ---
  const squawks: MapSquawk[] = [];
  for (const s of input.squawk ?? []) {
    const open = s.status !== "resolved";
    const date = (open ? s.reported_at : s.resolved_at)?.slice(0, 10);
    const clearing = s.resolved_log_entry_id ? entryById.get(s.resolved_log_entry_id) : undefined;
    const line = (clearing && lineOfBook.get(clearing.logbook_id)) || lines.find((l) => l.logbook === "airframe") || lines[0];
    if (!date || !line || !inRange(date)) continue;
    squawks.push({ id: s.id, date, open, line: line.logbook, lineId: line.lineId });
  }
  squawks.sort((a, b) => cmp(a.date, b.date) || cmp(a.id, b.id));

  // --- Rings (09 §3.4 rules over the map's range): dated items on their book's line ---
  const rings: MapRing[] = [];
  if (status.situation !== "setup")
    for (const i of status.items) {
      if (i.source === "document" || !i.line || !i.firstDate || i.status === "no_record") continue;
      const date = i.status === "overdue" ? today : i.firstDate;
      const line = firstLine(i.line);
      if (!line || !inRange(date)) continue;
      rings.push({
        itemKey: i.key, line: i.line, lineId: line.lineId, date, dateKind: i.first === "hours" ? "projected" : "calendar",
        status: i.status, label: i.label, kind: i.kind,
      });
    }
  rings.sort((a, b) => cmp(a.date, b.date) || cmp(a.itemKey, b.itemKey));

  // --- Visits: planned and in-shop visits in range (suggested visits arrive with phase 4) ---
  const visits: MapVisit[] = (input.planned_visit ?? [])
    .filter((v) => (v.status === "planned" || v.status === "in_shop") && inRange(v.week_of))
    .map((v) => ({
      id: v.id, suggestionKey: null, state: v.status as "planned" | "in_shop", weekOf: v.week_of,
      itemKeys: (input.planned_visit_item ?? []).filter((x) => x.visit_id === v.id).map((x) => x.item_key).sort(cmp),
      label: v.status === "in_shop" ? "In the shop" : "Planned",
    }))
    .sort((a, b) => cmp(a.weekOf, b.weekOf) || cmp(a.id ?? "", b.id ?? ""));

  // Long histories get the piecewise scale with a break at today − 12 months (10 §4).
  const scaleBreak = from <= addMonths(today, -60) ? addMonths(today, -12) : null;

  return {
    today,
    range: { from, to, scaleBreak },
    lines: lines.map((l) => ({ lineId: l.lineId, logbook: l.logbook, logbookId: l.logbookId, name: l.name, volumes: l.volumes })),
    stops: allStops.filter((s) => inRange(s.date)).map((s) => ({
      id: s.id, lineId: s.lineId, logbook: s.logbook, date: s.date, entryIds: s.entryIds, trust: s.trust, pageIds: s.pageIds, label: s.label, major: s.major,
    })),
    interchanges: interchanges.filter((x) => inRange(x.date)),
    gaps,
    eras,
    squawks,
    rings,
    visits,
    undatedEntries,
  };
}

/** Two entries on different books record one visit (09 §3.7). */
function sameVisit(a: MapEntryRow, b: MapEntryRow): boolean {
  const ca = normCert(a.mechanic_cert_number);
  if (ca && ca === normCert(b.mechanic_cert_number)) return true;
  return a.tach != null && b.tach != null && Math.abs(a.tach - b.tach) <= 0.5 + 1e-9;
}

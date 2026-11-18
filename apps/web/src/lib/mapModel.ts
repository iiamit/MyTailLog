import { createHash } from "node:crypto";
import type { LogbookType, TrustLevel } from "@/lib/database.types";

// MapModel (09 §3.7, §4.6; 10-line-map.md §2): the line map of an aircraft's
// life, derived from synced rows. Pure, so the route, the record room and the
// phone fixtures share one implementation.
//
// shortcut: phase 0 stub — lines, stops (one per book and date) and undated
// counts only. Interchanges, gaps, eras, squawks, rings, visits and volumes are
// returned empty; phase 2 (13 §4) derives them here.

export type MapLogbook = { id: string; type: LogbookType };
export type MapEntry = {
  id: string;
  logbook_id: string;
  page_id: string | null;
  entry_date: string | null;
  trust: TrustLevel;
  replaced_by_entry_id: string | null;
  is_continuation: boolean;
};

export type MapStop = {
  id: string;
  logbook: LogbookType;
  date: string;
  entryIds: string[];
  trust: TrustLevel;
  pageIds: string[];
  label: string | null;
  major: boolean;
};

export type MapModel = {
  range: { from: string; to: string; scaleBreak: string | null };
  lines: { logbook: LogbookType; logbookId: string; volumes: { id: string; label: string; from: string; to: string }[] }[];
  stops: MapStop[];
  interchanges: { id: string; date: string; stopIds: string[]; trust: TrustLevel; label: string | null }[];
  gaps: { id: string; logbook: LogbookType; from: string; to: string; status: string; unconfirmedPages: number }[];
  eras: { logbook: LogbookType; from: string; to: string | null; label: string; anchorEntryId: string }[];
  squawks: { id: string; date: string; open: boolean; line: string }[];
  rings: unknown[];
  visits: unknown[];
  undatedEntries: number;
};

// Lane order; the Other book is never a line (14-decisions.md M1).
const LANES: LogbookType[] = ["airframe", "engine", "prop", "avionics"];
const TRUST_RANK: Record<TrustLevel, number> = { ai_read: 0, confirmed: 1, signed: 2 };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const isIsoDate = (s: string) => DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** Stable stop id: sha1(logbookId + '|' + date), first 16 hex (09 §4.6). */
export const stopId = (logbookId: string, date: string) =>
  createHash("sha1").update(`${logbookId}|${date}`).digest("hex").slice(0, 16);

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

export function buildMapModel(input: {
  logbooks: MapLogbook[];
  entries: MapEntry[];
  today: string;
  from?: string;
  to?: string;
  /** Only these book types (query `logbooks=engine,prop`); all when absent. */
  only?: LogbookType[];
}): MapModel {
  const books = LANES.flatMap((type) =>
    input.logbooks.filter((b) => b.type === type && (!input.only || input.only.includes(type))),
  );
  const bookById = new Map(books.map((b) => [b.id, b]));

  // Replaced owner notes and continuation fragments are never drawn (09 §3.7).
  const drawable = input.entries.filter(
    (e) => bookById.has(e.logbook_id) && !e.replaced_by_entry_id && !e.is_continuation,
  );
  const undatedEntries = drawable.filter((e) => !e.entry_date).length;

  const groups = new Map<string, MapEntry[]>();
  for (const e of drawable) {
    if (!e.entry_date) continue;
    const key = `${e.logbook_id}|${e.entry_date}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }

  // `major` from what phase 0 knows: the first stop of each book (10 §2).
  const firstDate = new Map<string, string>();
  for (const [key] of groups) {
    const [bookId, date] = key.split("|");
    if (!firstDate.has(bookId) || date < firstDate.get(bookId)!) firstDate.set(bookId, date);
  }

  const allStops: MapStop[] = [...groups].map(([key, es]) => {
    const [bookId, date] = key.split("|");
    const trust = es.reduce<TrustLevel>((low, e) => (TRUST_RANK[e.trust] < TRUST_RANK[low] ? e.trust : low), "signed");
    return {
      id: stopId(bookId, date),
      logbook: bookById.get(bookId)!.type,
      date,
      entryIds: es.map((e) => e.id).sort(),
      trust,
      pageIds: [...new Set(es.map((e) => e.page_id).filter((p): p is string => !!p))].sort(),
      label: null,
      major: firstDate.get(bookId) === date,
    };
  });

  const from = input.from ?? allStops.reduce((min, s) => (s.date < min ? s.date : min), input.today);
  const to = input.to ?? addMonths(input.today, 12);
  const stops = allStops
    .filter((s) => s.date >= from && s.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || LANES.indexOf(a.logbook) - LANES.indexOf(b.logbook));

  return {
    range: { from, to, scaleBreak: addMonths(input.today, -12) },
    lines: books.map((b) => ({ logbook: b.type, logbookId: b.id, volumes: [] })),
    stops,
    interchanges: [],
    gaps: [],
    eras: [],
    squawks: [],
    rings: [],
    visits: [],
    undatedEntries,
  };
}

import type { Trust } from "@/lib/due/engine";
import { CONFIDENCE_THRESHOLD, isEntryClean } from "@/lib/extraction/schema";

// Pure rules for the Logbooks screens (04 W-BOOKS-*, 10-line-map.md §9–§10, 11 §4): URL parameters, the map's
// keyboard model, mark names, the review desk's field order and keyboard flow, Review all's sorting. No I/O, so
// test/books-v2.test.ts covers every branch an owner hits from the keyboard.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const BOOK_TYPES = ["airframe", "engine", "prop", "avionics"] as const;
export type BookType = (typeof BOOK_TYPES)[number];
export const BOOK_NAME: Record<string, string> = { airframe: "Airframe", engine: "Engine", prop: "Propeller", avionics: "Avionics", other: "Other" };

/** "Sep 14, 2005" */
export const fmtDay = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}, ${d.slice(0, 4)}`;
/** "September 14, 2005" (accessible names spell the month). */
export const fmtLongDay = (d: string) => `${LONG_MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}, ${d.slice(0, 4)}`;
/** "Sep 2005" */
export const fmtMonth = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
/** "Feb 3" */
export const fmtMonDay = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;

const DAY = 86_400_000;
const dayNum = (d: string) => Date.parse(`${d}T00:00:00Z`) / DAY;
const isoOf = (n: number) => new Date(Math.round(n) * DAY).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => isoOf(dayNum(d) + n);
export function addYears(d: string, n: number): string {
  const y = Number(d.slice(0, 4)) + n;
  const md = d.slice(5) === "02-29" ? "02-28" : d.slice(5);
  return `${String(y).padStart(4, "0")}-${md}`;
}

// --- Map URL parameters (04 W-BOOKS-01, 03 §10) ----------------------------------------------------------

export type MapParams = { stop?: string; visit?: string; gap?: string; book?: BookType; from?: string; to?: string; q?: string };

/** "2005" → 2005-01-01 (or -12-31 at the end), "2005-03" → the month's first or last day, ISO dates as given. */
export function normaliseBound(v: string | undefined, end: boolean): string | undefined {
  if (!v) return undefined;
  if (/^\d{4}$/.test(v)) return end ? `${v}-12-31` : `${v}-01-01`;
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) {
    if (!end) return `${v}-01`;
    const [y, m] = v.split("-").map(Number);
    return `${v}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : undefined;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export function parseMapParams(sp: Record<string, string | string[] | undefined>): MapParams {
  const book = one(sp.book);
  const out: MapParams = {
    stop: one(sp.stop), visit: one(sp.visit), gap: one(sp.gap), q: one(sp.q)?.trim().slice(0, 200) || undefined,
    book: BOOK_TYPES.includes(book as BookType) ? (book as BookType) : undefined,
    from: normaliseBound(one(sp.from), false), to: normaliseBound(one(sp.to), true),
  };
  if (out.from && out.to && out.from > out.to) [out.from, out.to] = [out.to, out.from];
  if (!out.from || !out.to) {
    delete out.from;
    delete out.to;
  }
  return out;
}

/**
 * The zoom window the map draws (W-BOOKS-03): below one year snaps to one year around its middle; a window as wide
 * as the life (or wider) clears the zoom.
 */
export function zoomWindow(p: { from?: string; to?: string }, life: { from: string; to: string }): { from: string; to: string } | null {
  if (!p.from || !p.to) return null;
  let { from, to } = p;
  if (dayNum(to) - dayNum(from) < 365) {
    const mid = (dayNum(from) + dayNum(to)) / 2;
    from = isoOf(mid - 182);
    to = isoOf(mid + 183);
  }
  if (from <= life.from && to >= life.to) return null;
  return { from, to };
}

/** Zoom in (factor < 1) or out around a date, as a window; null means back to the whole life. */
export function zoomAround(center: string, cur: { from: string; to: string }, factor: number, life: { from: string; to: string }) {
  const half = ((dayNum(cur.to) - dayNum(cur.from)) * factor) / 2;
  const c = dayNum(center);
  return zoomWindow({ from: isoOf(c - half), to: isoOf(c + half) }, life);
}

/** A query string from params with a patch applied; undefined/empty values drop out. */
export function withParams(params: MapParams, patch: Partial<Record<keyof MapParams, string | undefined>>): string {
  const merged: Record<string, string | undefined> = { ...params, ...patch };
  const q = new URLSearchParams();
  for (const k of ["book", "from", "to", "q", "stop", "visit", "gap"]) if (merged[k]) q.set(k, merged[k]!);
  const s = q.toString();
  return s ? `?${s}` : "";
}

// --- The map's keyboard model (10 §10, 02 §4.4) ------------------------------------------------------------

export type Mark = { key: string; lines: string[]; t: number; date: string; name: string };

/** The next mark for a key press, or null when the key does nothing. `line` is the line the focus travels on. */
export function navigate(
  marks: Mark[],
  lineOrder: string[],
  cur: { key: string; line: string } | null,
  key: string,
): { key: string; line: string } | null {
  const on = (line: string) => marks.filter((m) => m.lines.includes(line)).sort((a, b) => a.t - b.t || a.date.localeCompare(b.date));
  if (!cur) {
    // Tab in: the most recent stop on the first line that has marks.
    for (const line of lineOrder) {
      const ms = on(line).filter((m) => m.key.startsWith("stop:"));
      if (ms.length) return { key: ms[ms.length - 1].key, line };
    }
    const any = lineOrder.find((l) => on(l).length);
    return any ? { key: on(any)[0].key, line: any } : null;
  }
  const row = on(cur.line);
  const i = row.findIndex((m) => m.key === cur.key);
  const here = row[i];
  if (!here) return null;
  const stay = (m: Mark | undefined) => (m ? { key: m.key, line: cur.line } : null);
  switch (key) {
    case "ArrowRight": return stay(row[i + 1]);
    case "ArrowLeft": return stay(row[i - 1]);
    case "Home": return stay(row[0]);
    case "End": return stay(row[row.length - 1]);
    case "PageDown": {
      const target = addYears(here.date, 1);
      const fwd = row.find((m, j) => j > i && m.date >= target) ?? row[row.length - 1];
      return fwd === here ? null : stay(fwd);
    }
    case "PageUp": {
      const target = addYears(here.date, -1);
      const back = [...row.slice(0, i)].reverse().find((m) => m.date <= target) ?? row[0];
      return back === here ? null : stay(back);
    }
    case "ArrowUp":
    case "ArrowDown": {
      const step = key === "ArrowUp" ? -1 : 1;
      for (let l = lineOrder.indexOf(cur.line) + step; l >= 0 && l < lineOrder.length; l += step) {
        const other = on(lineOrder[l]);
        if (!other.length) continue;
        const near = other.reduce((a, b) => (Math.abs(b.t - here.t) < Math.abs(a.t - here.t) ? b : a));
        return { key: near.key, line: lineOrder[l] };
      }
      return null;
    }
  }
  return null;
}

const TRUST_NAME: Record<Trust, string> = { ai_read: "read by AI, not yet confirmed", confirmed: "confirmed by you", signed: "signed by a mechanic" };

/** "Annual inspection, August 22, 2011, Airframe and Engine, confirmed by you, page 41" (10 §10). */
export function markName(p: { title: string | null; date: string; books: string[]; trust?: Trust; page?: number | null; count?: number }): string {
  const books = p.books.map((b) => BOOK_NAME[b] ?? b);
  const bookText = books.length > 1 ? `${books.slice(0, -1).join(", ")} and ${books[books.length - 1]}` : books[0] ?? "";
  return [
    p.title, fmtLongDay(p.date), bookText, p.count && p.count > 1 ? `${p.count} entries` : null,
    p.trust ? TRUST_NAME[p.trust] : null, p.page != null ? `page ${p.page}` : null,
  ].filter(Boolean).join(", ");
}

/** An entry's title: its kind, else its first words (W-BOOKS-10). */
export function entryTitle(e: { entry_kind?: string | null; description?: string | null; work_performed?: string | null }): string {
  const KIND: Record<string, string> = {
    annual: "Annual inspection", "100_hour": "100-hour inspection", oil_change: "Oil change", overhaul: "Overhaul",
    major_repair: "Major repair", major_alteration: "Major alteration", install: "Installation", installation: "Installation",
    ad_compliance: "AD compliance", repair: "Repair", engine_replacement: "Engine replaced", prop_replacement: "Propeller replaced",
  };
  if (e.entry_kind && KIND[e.entry_kind]) return KIND[e.entry_kind];
  const text = (e.description || e.work_performed || "").replace(/\s+/g, " ").trim();
  if (!text) return "Logbook entry";
  const first = text.split(/(?<=[.;])\s/)[0];
  return clip(first.replace(/[.;]$/, ""), 60);
}

export function clip(s: string, n: number): string {
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1).lastIndexOf(" ");
  return `${s.slice(0, cut > n / 2 ? cut : n - 1)}…`;
}

// --- Review desk: fields, doubt, order (04 W-BOOKS-07, 09 §3.9.2) -------------------------------------------

export const DESK_FIELDS = [
  "entry_date", "tach", "hobbs", "airframe", "description", "work_performed", "parts",
  "signature_name", "mechanic_cert_number", "ad_refs", "sb_refs", "logbook_id",
] as const;
export type DeskField = (typeof DESK_FIELDS)[number];
export const FIELD_LABEL: Record<DeskField, string> = {
  entry_date: "Date", tach: "Tach", hobbs: "Hobbs", airframe: "Airframe", description: "What was done",
  work_performed: "Work performed", parts: "Parts", signature_name: "Signed by", mechanic_cert_number: "Certificate",
  ad_refs: "ADs", sb_refs: "SBs", logbook_id: "Book",
};
export const NUMERIC: DeskField[] = ["tach", "hobbs", "airframe"];
export const PAPER: DeskField[] = ["description", "work_performed", "parts"];

export type DeskEntryInput = {
  updated_at?: string;
  id: string; logbook_id: string; entry_date: string | null; tach: number | null; hobbs: number | null; airframe: number | null;
  description: string | null; work_performed: string | null; parts: string | null; signature_name: string | null;
  mechanic_cert_number: string | null; ad_refs: string[] | null; sb_refs: string[] | null;
  confidence: number | null; field_confidence: Record<string, number> | null; owner_confirmed: boolean;
  is_continuation?: boolean;
};
/** Entries of the same logbook around this page, for the plausibility checks. */
export type Neighbour = { id: string; entry_date: string | null; tach: number | null; hobbs: number | null; page: number | null };

export type FieldInfo = { field: DeskField; doubt: string | null; confidence: number | null; plausibility: boolean };

const fmt1 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Each field with its doubt in words, ordered by doubt (09 §3.9.2): plausibility failures first, then ascending
 * confidence. The reasons cite the neighbour they were checked against.
 * shortcut: meter resets between entries are not considered and alternatives (schema N+1) are not read yet;
 * add both when the extractor returns `alt` and the desk loads meter_reset.
 */
export function deskFields(
  e: DeskEntryInput,
  ctx: { samePage: Neighbour[]; sameBook: Neighbour[]; today: string; aircraftYear: number | null },
): FieldInfo[] {
  const conf = (f: DeskField) => (typeof e.field_confidence?.[f] === "number" ? e.field_confidence[f] : null);
  const plaus = new Map<DeskField, string>();
  const dated = (xs: Neighbour[]) => xs.filter((x) => x.id !== e.id && x.entry_date).sort((a, b) => a.entry_date!.localeCompare(b.entry_date!));
  const cite = (n: Neighbour) => `${fmtDay(n.entry_date!)}${n.page != null ? ` on p. ${n.page}` : ""}`;
  if (e.entry_date) {
    const prevBook = dated(ctx.sameBook).filter((x) => x.entry_date! < e.entry_date!).at(-1);
    for (const m of ["tach", "hobbs"] as const) {
      const v = e[m];
      if (v == null || !prevBook || prevBook[m] == null) continue;
      if (v < prevBook[m]! - 0.1) plaus.set(m, `Lower than the entry before it: ${fmt1(prevBook[m]!)} on ${cite(prevBook)}.`);
      else if (m === "tach" && v - prevBook.tach! > 300 && dayNum(e.entry_date) - dayNum(prevBook.entry_date!) < 365)
        plaus.set(m, `${fmt1(v - prevBook.tach!)} hours after the entry before it (${fmt1(prevBook.tach!)} on ${cite(prevBook)}), in under a year.`);
    }
    // samePage is in written order (entry_index): the entry above and below it on the paper.
    const me = ctx.samePage.findIndex((x) => x.id === e.id);
    const above = ctx.samePage.slice(0, Math.max(me, 0)).filter((x) => x.entry_date).at(-1);
    const below = me >= 0 ? ctx.samePage.slice(me + 1).find((x) => x.entry_date) : undefined;
    if (e.entry_date > ctx.today) plaus.set("entry_date", "This date is in the future.");
    else if (ctx.aircraftYear && Number(e.entry_date.slice(0, 4)) < ctx.aircraftYear)
      plaus.set("entry_date", `This date is before the aircraft was built (${ctx.aircraftYear}).`);
    else if (above && e.entry_date < addDays(above.entry_date!, -31))
      plaus.set("entry_date", `Earlier than the entry above it on this page (${fmtDay(above.entry_date!)}).`);
    else if (below && e.entry_date > addDays(below.entry_date!, 31))
      plaus.set("entry_date", `Later than the entry below it on this page (${fmtDay(below.entry_date!)}).`);
  }
  const infos: FieldInfo[] = DESK_FIELDS.map((field) => {
    const c = conf(field);
    const p = plaus.get(field) ?? null;
    const low = c != null && c < CONFIDENCE_THRESHOLD;
    return {
      field, confidence: c, plausibility: !!p,
      doubt: p ?? (low ? `The reader was ${Math.round(c! * 100)}% sure of this. Check it against the page.` : null),
    };
  });
  const rank = (f: FieldInfo) => (f.plausibility ? 0 : f.doubt ? 1 : 2);
  return infos
    .map((f, i) => ({ f, i }))
    .sort((a, b) => rank(a.f) - rank(b.f) || (rank(a.f) === 1 ? a.f.confidence! - b.f.confidence! : 0) || a.i - b.i)
    .map((x) => x.f);
}

/** Whether a page can be confirmed in one press from Review all (04 W-BOOKS-08 "Read cleanly"). */
export const pageIsClean = (es: DeskEntryInput[]) => es.length > 0 && es.every((e) => e.owner_confirmed || isEntryClean(e));

// --- Review desk keyboard flow (11 §4, 02 §6.7) --------------------------------------------------------------

export type Outcome = "pending" | "accepted" | "edited" | "absent";
export type DeskEntry = {
  base?: string;
  id: string;
  isNew?: boolean;
  confirmed: boolean;
  fields: FieldInfo[];
  values: Record<DeskField, string>;
  original: Record<DeskField, string>;
  outcome: Record<DeskField, Outcome>;
};
export type DeskState = { entries: DeskEntry[]; entry: number; field: number; editing: boolean; notice: string | null };

export function valuesOf(e: Partial<DeskEntryInput>): Record<DeskField, string> {
  const s = (v: unknown) => (v == null ? "" : Array.isArray(v) ? v.join(", ") : String(v));
  return Object.fromEntries(DESK_FIELDS.map((f) => [f, s(e[f as keyof DeskEntryInput])])) as Record<DeskField, string>;
}

export function deskEntry(e: DeskEntryInput, fields: FieldInfo[]): DeskEntry {
  const values = valuesOf(e);
  return {
    ...(e.updated_at ? { base: e.updated_at } : {}),
    id: e.id, confirmed: e.owner_confirmed, fields, values, original: { ...values },
    outcome: Object.fromEntries(DESK_FIELDS.map((f) => [f, "pending"])) as Record<DeskField, Outcome>,
  };
}

/** Unsure = doubtful and not yet decided. Clear fields count as accepted unless edited. */
export const isUnsure = (e: DeskEntry, f: FieldInfo) => !e.confirmed && !!f.doubt && e.outcome[f.field] === "pending";
export const fieldState = (e: DeskEntry, f: FieldInfo): "Clear" | "Unsure" | "Accepted" | "Edited" | "Not on this page" => {
  const o = e.outcome[f.field];
  return o === "accepted" ? "Accepted" : o === "edited" ? "Edited" : o === "absent" ? "Not on this page" : isUnsure(e, f) ? "Unsure" : "Clear";
};

export type DeskAction =
  | { type: "next" } | { type: "prev" } | { type: "accept" } | { type: "edit" } | { type: "absent" }
  | { type: "commit"; value: string } | { type: "cancel" } | { type: "select"; entry: number; field?: number }
  | { type: "undo"; entry: number; field: DeskField } | { type: "notice"; text: string | null }
  | { type: "entryConfirmed"; entry: number; base?: string; id?: string } | { type: "add"; entry: DeskEntry } | { type: "remove"; entry: number };

/** Next field across entries (the desk walks the page as one list), staying put at the end. */
function step(s: DeskState, dir: 1 | -1): DeskState {
  let { entry, field } = s;
  field += dir;
  while (entry >= 0 && entry < s.entries.length && (field < 0 || field >= s.entries[entry].fields.length)) {
    entry += dir;
    if (entry < 0 || entry >= s.entries.length) return s;
    field = dir === 1 ? 0 : s.entries[entry].fields.length - 1;
  }
  return { ...s, entry, field, editing: false };
}

function decide(s: DeskState, outcome: Outcome, value?: string): DeskState {
  const e = s.entries[s.entry];
  const f = e?.fields[s.field];
  if (!e || !f) return s;
  const v = value ?? (outcome === "absent" ? "" : e.values[f.field]);
  const changed = v !== e.original[f.field];
  const final: Outcome = outcome === "edited" && !changed ? "accepted" : outcome;
  const next: DeskEntry = { ...e, values: { ...e.values, [f.field]: v }, outcome: { ...e.outcome, [f.field]: final } };
  const entries = s.entries.map((x, i) => (i === s.entry ? next : x));
  return step({ ...s, entries, editing: false, notice: null }, 1);
}

export function deskReducer(s: DeskState, a: DeskAction): DeskState {
  switch (a.type) {
    case "next": return step(s, 1);
    case "prev": return step(s, -1);
    case "accept": return decide(s, "accepted");
    case "absent": return decide(s, "absent");
    case "edit": return s.entries[s.entry]?.fields[s.field] ? { ...s, editing: true } : s;
    case "commit": return decide(s, "edited", a.value);
    case "cancel": return { ...s, editing: false };
    case "select": return { ...s, entry: a.entry, field: a.field ?? 0, editing: false };
    case "notice": return { ...s, notice: a.text };
    case "undo": {
      const entries = s.entries.map((e, i) =>
        i === a.entry ? { ...e, values: { ...e.values, [a.field]: e.original[a.field] }, outcome: { ...e.outcome, [a.field]: "pending" as Outcome } } : e);
      return { ...s, entries };
    }
    case "entryConfirmed": {
      const entries = s.entries.map((e, i) => (i === a.entry ? { ...e, ...(a.id ? { id: a.id } : {}), ...(a.base ? { base: a.base } : {}), confirmed: true, isNew: false, original: { ...e.values } } : e));
      return { ...s, entries };
    }
    case "add": return { ...s, entries: [...s.entries, a.entry], entry: s.entries.length, field: 0, editing: false };
    case "remove": {
      const entries = s.entries.filter((_, i) => i !== a.entry);
      return { ...s, entries, entry: Math.min(s.entry, Math.max(0, entries.length - 1)), field: 0, editing: false };
    }
  }
}

/** The first unsure field, from `from` onward (wrapping), as its position. */
export function firstUnsure(s: DeskState, only?: number): { entry: number; field: number } | null {
  for (let i = 0; i < s.entries.length; i++) {
    if (only != null && i !== only) continue;
    const e = s.entries[i];
    const j = e.fields.findIndex((f) => isUnsure(e, f));
    if (j >= 0) return { entry: i, field: j };
  }
  return null;
}

const NUM_RE = /^-?\d+(\.\d+)?$/;
/** The fields an entry's save sends (entry.update): every changed field, typed for pickEntryFields. */
export function patchOf(e: DeskEntry): Record<string, unknown> | { error: string } {
  const out: Record<string, unknown> = {};
  for (const f of DESK_FIELDS) {
    if (e.values[f] === e.original[f] && !e.isNew) continue;
    const v = e.values[f].trim();
    if (f === "logbook_id") { if (v) out[f] = v; continue; }
    if (NUMERIC.includes(f)) {
      if (v && !NUM_RE.test(v.replace(/,/g, ""))) return { error: `${FIELD_LABEL[f]} must be a number.` };
      out[f] = v ? Number(v.replace(/,/g, "")) : null;
    } else if (f === "ad_refs" || f === "sb_refs") out[f] = v ? v.split(",").map((x) => x.trim()).filter(Boolean) : [];
    else if (f === "entry_date") {
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { error: "Write the date as YYYY-MM-DD." };
      out[f] = v || null;
    } else out[f] = v || null;
  }
  return out;
}

export type ConfirmPlan =
  | { blocked: { entry: number; field: number; message: string } }
  | { error: string }
  | { writes: { id: string; isNew: boolean; fields: Record<string, unknown> | null; base?: string }[] };

/**
 * What "Confirm page and next" (or Ctrl+Enter for one entry) sends. Blocked while a field is unsure: focus moves to
 * it with "1 field to check on entry 2 first." Unchanged entries are confirmed (entry.confirm); changed ones are
 * saved (entry.update, which confirms); entries already confirmed and unchanged are skipped.
 */
export function confirmPlan(s: DeskState, only?: number): ConfirmPlan {
  const u = firstUnsure(s, only);
  if (u) {
    const e = s.entries[u.entry];
    const n = e.fields.filter((f) => isUnsure(e, f)).length;
    return { blocked: { ...u, message: `${n === 1 ? "1 field" : `${n} fields`} to check on entry ${u.entry + 1} first.` } };
  }
  const writes: { id: string; isNew: boolean; fields: Record<string, unknown> | null; base?: string }[] = [];
  for (const [i, e] of s.entries.entries()) {
    if (only != null && i !== only) continue;
    const changed = e.isNew || DESK_FIELDS.some((f) => e.values[f] !== e.original[f]);
    if (e.confirmed && !changed) continue;
    if (!changed) { writes.push({ id: e.id, isNew: false, fields: null, ...(e.base ? { base: e.base } : {}) }); continue; }
    const p = patchOf(e);
    if ("error" in p) return { error: `Entry ${i + 1}: ${p.error}` };
    writes.push({ id: e.id, isNew: !!e.isNew, fields: p, ...(e.base ? { base: e.base } : {}) });
  }
  return { writes };
}

/** "Entries 1 and 3 are accepted" for the desk footer. */
export function acceptedLine(s: DeskState): string {
  const done = s.entries.map((e, i) => (e.confirmed || !e.fields.some((f) => isUnsure(e, f)) ? i + 1 : 0)).filter(Boolean);
  if (!done.length) return "No entry is ready yet.";
  if (done.length === s.entries.length) return s.entries.length === 1 ? "The entry is ready to confirm." : `All ${done.length} entries are ready to confirm.`;
  const list = done.length === 1 ? `${done[0]}` : `${done.slice(0, -1).join(", ")} and ${done[done.length - 1]}`;
  return `${done.length === 1 ? "Entry" : "Entries"} ${list} ${done.length === 1 ? "is" : "are"} ready.`;
}

// --- Page order for "Confirm page and next" -----------------------------------------------------------------

export type WaitingPage = { id: string; logbook: string; sequence: number | null; created_at: string };

/** Waiting pages in desk order: same book by page_sequence, then the other books in book order (W-BOOKS-07). */
export function nextWaiting(pages: WaitingPage[], currentId: string, currentBook: string): string | null {
  const order = ["airframe", "engine", "prop", "avionics", "other"];
  const others = pages.filter((p) => p.id !== currentId);
  const key = (p: WaitingPage) => [p.logbook === currentBook ? -1 : order.indexOf(p.logbook), p.sequence ?? Number.MAX_SAFE_INTEGER, p.created_at] as const;
  others.sort((a, b) => {
    const ka = key(a), kb = key(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2].localeCompare(kb[2]);
  });
  return others[0]?.id ?? null;
}

/** The first doubt on a page in words, for Review all: "Tach on entry 2: lower than the entry before it". */
export function pageDoubt(entries: { fields: FieldInfo[]; confirmed: boolean }[]): string | null {
  for (const [i, e] of entries.entries()) {
    if (e.confirmed) continue;
    const f = e.fields.find((x) => x.doubt);
    if (f) return `${FIELD_LABEL[f.field]} on entry ${i + 1}: ${f.doubt!.charAt(0).toLowerCase()}${f.doubt!.slice(1)}`;
  }
  return null;
}

// --- List view (W-BOOKS-12) -------------------------------------------------------------------------------------

export type ListEntry = { id: string; entry_date: string | null; text: string };

/** Search covers every text field; terms are ANDed, case-insensitive. */
export function matches(text: string, q: string | undefined): boolean {
  if (!q) return true;
  const hay = text.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((t) => hay.includes(t));
}

/** Year groups, newest first, "Undated" last. */
export function groupByYear<T extends { entry_date: string | null }>(rows: T[]): { year: string; rows: T[] }[] {
  const sorted = [...rows].sort((a, b) => (b.entry_date ?? "").localeCompare(a.entry_date ?? ""));
  const groups = new Map<string, T[]>();
  for (const r of sorted) {
    const y = r.entry_date?.slice(0, 4) ?? "Undated";
    groups.set(y, [...(groups.get(y) ?? []), r]);
  }
  return [...groups].map(([year, rows]) => ({ year, rows })).sort((a, b) => (a.year === "Undated" ? 1 : b.year === "Undated" ? -1 : b.year.localeCompare(a.year)));
}

/** Split text around search terms for <b> highlighting. */
export function highlight(text: string, q: string | undefined): { text: string; hit: boolean }[] {
  const words = (q ?? "").split(/\s+/).filter((t) => t.length > 1).slice(0, 10);
  if (!words.length) return [{ text, hit: false }];
  const lower = new Set(words.map((t) => t.toLowerCase()));
  // Terms are escaped literals in one alternation (capped at 10), so there is no backtracking risk.
  const escaped = words.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
  return text.split(new RegExp(`(${escaped.join("|")})`, "gi")).filter(Boolean).map((p) => ({ text: p, hit: lower.has(p.toLowerCase()) }));
}

// --- Page highlights (02 §6.1) ------------------------------------------------------------------------------------

export type Box = { x: number; y: number; w: number; h: number };

/** The union of boxes (an entry's region from its fields' boxes); null when none is usable. */
export function unionBox(boxes: (Box | null | undefined)[]): Box | null {
  const bs = boxes.filter((b): b is Box => !!b && b.w > 0 && b.h > 0);
  if (!bs.length) return null;
  const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y));
  return { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y };
}
export const entryBox = (e: { field_boxes: Record<string, Box | null> | null } | null | undefined) => unionBox(Object.values(e?.field_boxes ?? {}));

// --- Pages library books (W-BOOKS-05) -----------------------------------------------------------------------------

export type ShelfBook = { lineId: string; logbook: string; name: string; volumes: { id: string; from: string | null; to: string | null }[] };

/**
 * Every logbook the Pages library lists: the map's lines in lane order, then Other. Other is never a line (10 §1) but
 * holds A&P documents and loose pages, so it must still be reachable. Books of a type the map doesn't draw join Other.
 */
export function shelfBooks(lines: ShelfBook[], logbooks: { id: string; type: string }[]): ShelfBook[] {
  const onLine = new Set(lines.flatMap((l) => l.volumes.map((v) => v.id)));
  const rest = logbooks.filter((b) => !onLine.has(b.id)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const out = lines.map((l) => ({ lineId: l.lineId, logbook: l.logbook, name: l.name, volumes: l.volumes }));
  if (rest.length) out.push({ lineId: rest[0].id, logbook: "other", name: BOOK_NAME.other, volumes: rest.map((b) => ({ id: b.id, from: null, to: null })) });
  return out;
}

export type ReviewReceipt = { entryVersions: Record<string, string>; pageVersions: Record<string, string>; pageId: string; n: number };

/** The undo link uses exactly the versions returned by the confirmation transaction. */
export function parseReviewReceipt(value: string | undefined): ReviewReceipt | null {
  if (!value || value.length > 6000) return null;
  try {
    const r = JSON.parse(value) as ReviewReceipt;
    const versions = (v: unknown) => !!v && typeof v === "object" && !Array.isArray(v) && Object.entries(v).length <= 50 && Object.entries(v).every(([id, stamp]) => /^[0-9a-f-]{36}$/i.test(id) && typeof stamp === "string" && Number.isFinite(Date.parse(stamp)));
    return /^[0-9a-f-]{36}$/i.test(r.pageId) && versions(r.entryVersions) && versions(r.pageVersions) && Number.isInteger(r.n) ? r : null;
  } catch { return null; }
}

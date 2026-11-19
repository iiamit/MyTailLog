/**
 * View rules for the v2 Status screens (04 W-STATUS-01/04, 02 §5.8, 12 §4). Pure: the server engine
 * (lib/due/engine.ts) decides what is due; this file only words and groups it.
 */
import {
  addDays, addMonths, daysBetween, endOfMonthAfter, fmtAbout, fmtDate, CALENDAR_MONTH_KINDS,
  type DueItem, type DueStatus, type MeterName, type Rate, type Trust,
} from "@/lib/due/engine";

export type Filter = "all" | "overdue" | "due_soon" | "current" | "no_record";
export const FILTERS: Filter[] = ["all", "overdue", "due_soon", "current", "no_record"];
export const parseFilter = (v: string | string[] | undefined): Filter =>
  FILTERS.includes(v as Filter) ? (v as Filter) : "all";

/** Status words (12 §7 status.*). */
export const STATUS_WORD: Record<DueStatus, string> = {
  overdue: "Overdue", due_soon: "Due soon", current: "Current", no_record: "No record",
};
export const TRUST_WORD: Record<Trust, string> = {
  ai_read: "Read by AI", confirmed: "Confirmed by you", signed: "Signed by a mechanic",
};
export const FILTER_LABEL: Record<Filter, string> = { all: "All", ...STATUS_WORD };

export type GroupKey = "overdue" | "next60" | "year" | "further" | "no_record";
export const GROUP_LABEL: Record<GroupKey, string> = {
  overdue: "Overdue", next60: "Next 60 days", year: "Within a year", further: "Further out", no_record: "No record",
};
/** Groups under the one "Later" toggle row (W-STATUS-01). */
export const LATER: GroupKey[] = ["year", "further", "no_record"];

/** Horizon group from the item's first limit (W-STATUS-01 "Groups"). */
export function groupOf(item: DueItem, today: string): GroupKey {
  if (item.status === "overdue") return "overdue";
  if (item.status === "no_record") return "no_record";
  const days = item.calendar?.daysLeft;
  const projected = item.hours?.projectedDate ? daysBetween(today, item.hours.projectedDate) : null;
  if ((days != null && days <= 60) || (item.hours && item.hours.remaining <= 25) || (projected != null && projected <= 60)) return "next60";
  const first = item.firstDate ? daysBetween(today, item.firstDate) : null;
  return first != null && first <= 365 ? "year" : "further";
}

export function groupItems(items: DueItem[], today: string, filter: Filter): { key: GroupKey; items: DueItem[] }[] {
  const order: GroupKey[] = ["overdue", "next60", "year", "further", "no_record"];
  const shown = filter === "all" ? items : items.filter((i) => i.status === filter);
  return order
    .map((key) => ({ key, items: shown.filter((i) => groupOf(i, today) === key) }))
    .filter((g) => g.items.length > 0);
}

export function filterCounts(items: DueItem[]): Record<Filter, number> {
  const n = (s: DueStatus) => items.filter((i) => i.status === s).length;
  return { all: items.length, overdue: n("overdue"), due_soon: n("due_soon"), current: n("current"), no_record: n("no_record") };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const fmtHours = (h: number) => `${(Math.round(h * 10) / 10).toFixed(1)} h`;
/** "4,222.1" (12 §5). */
export const fmtMeter = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** The "Left" cell (W-STATUS-01): "lapsed 7 days ago", "43 days", "9.7 h", "2.3 h over". */
export function leftText(item: DueItem): string {
  if (item.status === "no_record" || !item.first) return "";
  const cal = item.calendar;
  const hrs = item.hours;
  if (item.status === "overdue") {
    if (cal && cal.daysLeft < 0) return cal.daysLeft === -1 ? "lapsed 1 day ago" : `lapsed ${-cal.daysLeft} days ago`;
    if (hrs && hrs.remaining <= 0) return `${fmtHours(-hrs.remaining)} over`;
  }
  if (item.first === "hours" && hrs) return fmtHours(hrs.remaining);
  if (cal) return plural(cal.daysLeft, "day");
  return "";
}

const BASIS_NOTE: Partial<Record<Rate["basis"], string>> = {
  trailing_90_hobbs: "from hobbs", trailing_365: "from the past year", owner_estimate: "from your estimate",
};

/** The hours-limit cell: "tach 4,222.1" over "about Dec 12" (12 §4 Both limits). */
export function hoursCell(item: DueItem, today: string): { limit: string; note: string | null } | null {
  const h = item.hours;
  if (!h) return null;
  const limit = `${h.meter} ${fmtMeter(h.dueAt)}`;
  if (h.remaining <= 0) return { limit, note: null };
  if (h.projectionBasis === "none" || !h.projectedDate) return { limit, note: `${fmtHours(h.remaining)} left, no recent flying to date it` };
  const basis = BASIS_NOTE[h.projectionBasis];
  return { limit, note: `about ${fmtAbout(h.projectedDate, today)}${basis ? `, ${basis}` : ""}` };
}

/** The calendar-limit cell; calendar-month items say so (12 §4). */
export function calendarCell(item: DueItem): { limit: string; note: string | null } | null {
  const c = item.calendar;
  if (!c) return null;
  if (!c.calendarMonthRule) return { limit: fmtDate(c.dueDate), note: null };
  const month = new Date(`${c.dueDate}T00:00:00Z`).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  return { limit: fmtDate(c.dueDate), note: `end of ${month}` };
}

/** Which limit carries the FirstBadge: only when the item has both. */
export const firstBadge = (item: DueItem): "calendar" | "hours" | null =>
  item.calendar && item.hours ? item.first : null;

/** Row action (W-STATUS-01 "Action"), or null when the row has none. */
export function rowAction(item: DueItem, aircraftId: string): { label: string; href: string } | null {
  const detail = `/aircraft/${aircraftId}/status/item/${item.key}?panel=done`;
  if (item.source === "maintenance") return { label: item.kind === "vor" ? "Log a VOR check" : "Mark done", href: detail };
  if (item.source === "ad") return { label: "Record", href: detail };
  return item.calendar ? { label: "Renewed", href: detail } : { label: "Add the date", href: `/aircraft/${aircraftId}/documents` };
}

/** Board action on item detail (03 §4). */
export function primaryAction(item: DueItem): string {
  if (item.source === "ad") return "Record compliance";
  if (item.source === "document") return "Renewed";
  return item.kind === "vor" ? "Log a VOR check" : "Mark done";
}

/** "Hours become dates at {rate phrase}." (W-STATUS-01 footnote). Null when there is no rate to name. */
export function ratePhrase(rate: Rate): string | null {
  const h = (Math.round(rate.hoursPerWeek * 10) / 10).toString();
  switch (rate.basis) {
    case "trailing_90": return `your recent flying, about ${h} hours a week`;
    case "trailing_90_hobbs": return `your recent hobbs time, about ${h} hours a week`;
    case "trailing_365": return `your flying over the past year, about ${h} hours a week`;
    case "owner_estimate": return `your estimate of ${h} hours a week`;
    default: return null;
  }
}

/** "Airframe p. 58" → { book: "Airframe", page: "58" }. */
export function splitPageLabel(label: string | null): { book: string; page: string } | null {
  const m = label ? /^(.*) p\. (.+)$/.exec(label) : null;
  return m ? { book: m[1], page: m[2] } : null;
}

/** Why a row has no page on the mat (W-STATUS-01 "Row without a page"). */
export function noPageReason(item: DueItem): { text: string; documents?: boolean } {
  if (item.source === "document") return { text: `This comes from the ${item.label} in Documents.`, documents: true };
  if (item.lastDone?.date && !item.lastDone.entryId)
    return { text: `You marked it done on ${fmtDate(item.lastDone.date)}; the page will replace your note when it is scanned.` };
  return { text: "No record of this item has been found." };
}

/** Plain words for screen readers and the ring's accessible name (10 §10). */
export function itemSummary(item: DueItem): string {
  const due = item.firstDate ? `${item.first === "hours" ? "due about" : "due"} ${fmtDate(item.firstDate)}` : "no due date";
  return [item.label, due, leftText(item), STATUS_WORD[item.status], item.line ? BOOK[item.line] ?? item.line : null].filter(Boolean).join(", ");
}

export const BOOK: Record<string, string> = { airframe: "Airframe", engine: "Engine", prop: "Propeller", avionics: "Avionics", other: "Other" };
export const LINE_TOKEN: Record<string, string> = {
  airframe: "var(--color-line-airframe)", engine: "var(--color-line-engine)", prop: "var(--color-line-propeller)",
  avionics: "var(--color-line-avionics)", other: "var(--color-line-other)",
};

// --- Line ahead geometry (10 §5, §7, §8.3) ----------------------------------

export const LA = { width: 680, height: 226, nameCol: 84, todayX: 110, horizonX: 672, laneTop: 40, laneGap: 45, tickY: 222 };
const LANE_ORDER = ["airframe", "engine", "prop", "avionics"];
const CHAR_W = 7; // shortcut: average glyph width of type.map-label at 13 units; measure text if labels start colliding.

export type RingInput = { key: string; line: string; date: string; status: DueStatus; label: string; projected: boolean; left: string };
export type PlacedRing = RingInput & { x: number; y: number; laneY: number; labelX: number | null; labelY: number | null; anchor: "start" | "end" };

/** Lanes in fixed order, only for books that exist or carry a ring (10 §5). */
export function lanesFor(books: string[], ringLines: string[]): string[] {
  const have = new Set([...books, ...ringLines]);
  const lanes = LANE_ORDER.filter((l) => have.has(l));
  return lanes.length ? lanes : LANE_ORDER;
}

export function xFor(date: string, from: string, to: string): number {
  const span = Math.max(1, daysBetween(from, to));
  const d = Math.min(Math.max(daysBetween(from, date), 0), span);
  return LA.todayX + ((LA.horizonX - LA.todayX) * d) / span;
}

/** Ring label: "Oil change, 9.7 h", "Annual ≈ Mar 28", "VOR check, lapsed 7 days ago". */
export function ringLabel(item: DueItem, today: string): string {
  if (item.status === "overdue") return `${item.label}, ${leftText(item)}`;
  if (item.first === "hours" && item.hours?.projectedDate) return `${item.label} ≈ ${fmtAbout(item.hours.projectedDate, today)}`;
  return `${item.label}, ${fmtAbout(item.firstDate ?? today, today)}`;
}

const PRIORITY: Record<DueStatus, number> = { overdue: 0, due_soon: 1, current: 2, no_record: 3 };

/**
 * Places rings on their lanes and greedily places labels above, then below, the lane (10 §7). Rings closer
 * than 14 units on one lane alternate ±8 units; a label that fits nowhere is dropped and counted in `more`.
 */
export type LaBox = [number, number, number, number];

/** Where each visit cap's label sits on the line ahead, so ring labels keep clear of it. */
export function capBoxes(caps: { date: string; lines: string[]; label: string }[], lanes: string[], from: string, to: string): LaBox[] {
  return caps.flatMap((c) => {
    const ys = c.lines.filter((l) => lanes.includes(l)).map((l) => LA.laneTop + lanes.indexOf(l) * LA.laneGap);
    if (!ys.length) return [];
    const x = xFor(c.date, from, to);
    const y1 = Math.min(...ys) - 10;
    const w = c.label.length * CHAR_W;
    // Only the label: a ring label may cross the cap's thin outline, but two labels must never overprint.
    return [[x - w / 2, y1 - 17, x + w / 2, y1 - 3]] as LaBox[];
  });
}

export function layoutLineAhead(
  rings: RingInput[],
  lanes: string[],
  from: string,
  to: string,
  obstacles: LaBox[] = [],
): { rings: PlacedRing[]; more: number } {
  const laneY = (line: string) => LA.laneTop + lanes.indexOf(line) * LA.laneGap;
  const placed: PlacedRing[] = [];
  const lastX = new Map<string, { x: number; flip: number }>();
  for (const r of [...rings].filter((r) => lanes.includes(r.line)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) {
    const x = xFor(r.date, from, to);
    const ly = laneY(r.line);
    const prev = lastX.get(r.line);
    let y = ly;
    let flip = 0;
    if (prev && x - prev.x < 14) { flip = prev.flip === 1 ? -1 : 1; y = ly + 8 * flip; }
    lastX.set(r.line, { x, flip });
    placed.push({ ...r, x, y, laneY: ly, labelX: null, labelY: null, anchor: "start" });
  }

  type Box = LaBox;
  const boxes: Box[] = [...obstacles, ...placed.map((p): Box => [p.x - 10, p.y - 10, p.x + 10, p.y + 10])];
  boxes.push([LA.todayX - 1, 0, LA.todayX + 1, LA.height]); // today line
  boxes.push([0, LA.tickY - 12, LA.width, LA.height]); // axis
  const hits = (b: Box) => boxes.some((o) => b[0] < o[2] + 3 && b[2] + 3 > o[0] && b[1] < o[3] + 3 && b[3] + 3 > o[1]);
  let more = 0;
  for (const p of [...placed].sort((a, b) => PRIORITY[a.status] - PRIORITY[b.status] || a.x - b.x)) {
    const w = Math.min(p.label.length, 32) * CHAR_W;
    let done = false;
    for (const dy of [-19, 26]) {
      const baseline = p.laneY + dy;
      for (const anchor of ["start", "end"] as const) {
        const x0 = anchor === "start" ? p.x + 8 : p.x - 8 - w;
        const box: Box = [x0, baseline - 11, x0 + w, baseline + 3];
        if (box[0] < LA.nameCol || box[2] > LA.width || hits(box)) continue;
        boxes.push(box);
        p.labelX = anchor === "start" ? p.x + 8 : p.x - 8;
        p.labelY = baseline;
        p.anchor = anchor;
        done = true;
        break;
      }
      if (done) break;
    }
    if (!done) more++;
  }
  return { rings: placed, more };
}

/** Month ticks every two months; the first is "Today", the last carries its year (02 §4.5). */
export function monthTicks(from: string, to: string): { x: number; label: string; anchor: "start" | "middle" | "end" }[] {
  const ticks: { x: number; label: string; anchor: "start" | "middle" | "end" }[] = [{ x: LA.todayX, label: "Today", anchor: "middle" }];
  const [y, m] = from.split("-").map(Number);
  for (let i = 2; ; i += 2) {
    const d = new Date(Date.UTC(y, m - 1 + i, 1)).toISOString().slice(0, 10);
    if (d > to) break;
    const x = xFor(d, from, to);
    if (x - ticks[ticks.length - 1].x < 40) continue;
    ticks.push({ x, label: new Date(`${d}T00:00:00Z`).toLocaleString("en-US", { month: "short", timeZone: "UTC" }), anchor: "middle" });
  }
  // The horizon tick names its month and year, right-aligned; a two-month tick crowding it gives way.
  while (ticks.length > 1 && LA.horizonX - ticks[ticks.length - 1].x < 76) ticks.pop();
  const end = new Date(`${to}T00:00:00Z`);
  ticks.push({ x: LA.horizonX, label: `${end.toLocaleString("en-US", { month: "short", timeZone: "UTC" })} ${end.getUTCFullYear()}`, anchor: "end" });
  return ticks;
}

// --- Item detail history (W-STATUS-04 "Done before") -------------------------

export type HistoryInput = {
  id: string; date: string; hours: number | null; entryId: string | null; pageId: string | null;
  pageLabel: string | null; trust: Trust | null; signer: string | null;
};
export type HistoryRow = HistoryInput & { lateDays: number | null; after: number | null; sameTachAs: string | null };

/** Next due date from a completion date, per the item's rule (09 §3.2: VOR 30 days, calendar-month kinds). */
export function nextDueFrom(kind: string, date: string, intervalMonths: number | null): string | null {
  if (!intervalMonths) return null;
  if (kind === "vor") return addDays(date, 30);
  return CALENDAR_MONTH_KINDS.has(kind) ? endOfMonthAfter(date, intervalMonths) : addMonths(date, intervalMonths);
}

/** Newest first, with days late against the previous completion's due date, hours since it, and repeated tach readings. */
export function historyRows(rows: HistoryInput[], kind: string, intervalMonths: number | null): HistoryRow[] {
  const asc = [...rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.hours ?? 0) - (b.hours ?? 0)));
  const out = asc.map((r, i): HistoryRow => {
    const prev = i > 0 ? asc[i - 1] : null;
    const due = prev ? nextDueFrom(kind, prev.date, intervalMonths) : null;
    const late = due ? daysBetween(due, r.date) : null;
    return {
      ...r,
      lateDays: late != null && late > 0 ? late : null,
      after: prev?.hours != null && r.hours != null ? Math.round((r.hours - prev.hours) * 10) / 10 : null,
      sameTachAs: r.hours != null ? asc.slice(0, i).find((p) => p.hours === r.hours)?.date ?? null : null,
    };
  });
  return out.reverse();
}

/** Mark-done preview (W-STATUS-04 drawer): "Next due Dec 31, 2027" and/or "at tach 4,272.1". */
export function markDonePreview(
  kind: string, date: string | null, hours: number | null, meter: MeterName,
  intervalMonths: number | null, intervalHours: number | null,
): string | null {
  const parts: string[] = [];
  const d = date ? nextDueFrom(kind, date, intervalMonths) : null;
  if (d) parts.push(fmtDate(d));
  if (hours != null && intervalHours) parts.push(`at ${meter} ${fmtMeter(hours + intervalHours)}`);
  return parts.length ? `Next due ${parts.join(" or ")}${parts.length > 1 ? ", whichever first" : ""}.` : null;
}

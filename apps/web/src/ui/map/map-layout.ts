import type { MapModel, MapStop } from "../../lib/mapModel";

// ===========================================================================
// Map layout (10-line-map.md §4–§8, §11): MapModel + size + options →
// positioned primitives and placed labels, in viewBox units. Pure and
// deterministic, so the web components and the phones' Kotlin port
// (apps/core/domain/.../map/MapLayout.kt) draw the same positions; the shared
// fixtures (packages/shared/fixtures/map-layout*.json) pin both within 0.5 units.
// Change one, change both and regenerate.
//
// Every number is a viewBox unit. `renderedWidth` (default the viewBox width)
// gives k = rendered / viewBox; pixel rules (8 px stop merge, 14 px ring
// offset, 40 px tick spacing, 13 px labels) divide by k.
// ===========================================================================

export type MapSize = "routemap" | "spine" | "lineahead" | "lineahead-phone" | "phone";
export type LayoutOptions = {
  size: MapSize;
  renderedWidth?: number;
  /** RouteMap zoom (10 §4): linear over this range plus a 40-unit "→ today" stub. */
  zoom?: { from: string; to: string } | null;
  /** Plan ahead (10 §4): first 6 months at double scale. LineAhead only. */
  planAhead?: boolean;
  /** The window the screen covers (10 §1, §8.1). */
  window?: { from: string; to: string } | null;
  /** Earlier eras too (when one book is filtered, 10 §2). */
  allEras?: boolean;
};

export type Rect = { x: number; y: number; w: number; h: number };
export type Seg = { x1: number; y1: number; x2: number; y2: number };
export type Layout = {
  size: MapSize;
  width: number;
  height: number;
  fontSize: number;
  lanes: { lineId: string; logbook: string; name: string; c: number; nameX: number; nameY: number; anchor: Anchor }[];
  segments: (Seg & { lineId: string; kind: "solid" | "future" | "gap" | "no_pages"; gapId: string | null })[];
  stops: { id: string; lineId: string; x: number; y: number; r: number; dotted: boolean; major: boolean; count: number; ids: string[] }[];
  interchanges: (Rect & { id: string; dotted: boolean; dots: { x: number; y: number }[] })[];
  rings: { itemKey: string; lineId: string; x: number; y: number; r: number; status: string }[];
  visits: (Rect & { id: string; state: string })[];
  eras: (Rect & { lineId: string })[];
  squawks: { id: string; x: number; y: number; open: boolean }[];
  today: Seg | null;
  scaleBreak: Seg | null;
  window: Rect | null;
  ticks: { x: number; y: number; label: string; anchor: Anchor }[];
  labels: { for: string; text: string; x: number; y: number; anchor: Anchor }[];
  more: number;
};
type Anchor = "start" | "middle" | "end";

// --- Geometry per size (10 §8; values the spec does not give are marked "inferred") ---

type Geo = {
  width: number; vertical: boolean; nameW: number; laneGap: number; laneStart: number;
  // horizontal: time runs t0 → t1; vertical: computed in scaleFor
  t0: number; t1: number; brk: [number, number] | null; stub: [number, number] | null;
  ringR: number; capW: number; labelled: boolean;
};
const GEO: Record<MapSize, Geo> = {
  // 10 §8.2: 820 wide, name column 0–90, H 100–600, break 600–620, R 620–800. Lane 1 at y 48 (inferred).
  routemap: { width: 820, vertical: false, nameW: 90, laneGap: 80, laneStart: 48, t0: 100, t1: 800, brk: [600, 620], stub: null, ringR: 7, capW: 20, labelled: true },
  // 10 §4, §8.1: 1000 wide, H 790 : R 200 with a 10-unit break, 40 tall, lanes 8 apart, unlabelled.
  spine: { width: 1000, vertical: false, nameW: 0, laneGap: 8, laneStart: 0, t0: 0, t1: 1000, brk: [790, 800], stub: null, ringR: 3.5, capW: 8, labelled: false },
  // 10 §8.3: 680 × 226, lanes at y 40, 85, 130, 175, names 0–84, today at 110, horizon 672, ticks at 222.
  lineahead: { width: 680, vertical: false, nameW: 84, laneGap: 45, laneStart: 40, t0: 110, t1: 672, brk: null, stub: [88, 110], ringR: 7, capW: 20, labelled: true },
  // 10 §8.3 phone home: 354 × 168, lanes 36 apart; name column and today x inferred.
  "lineahead-phone": { width: 354, vertical: false, nameW: 44, laneGap: 36, laneStart: 30, t0: 60, t1: 346, brk: null, stub: [48, 60], ringR: 7, capW: 20, labelled: true },
  // 10 §8.4: columns at x 58 + 40i in 358; future 70, recent 110, break, history 8 per year; labels at x 208.
  phone: { width: 358, vertical: true, nameW: 0, laneGap: 40, laneStart: 58, t0: 32, t1: 0, brk: null, stub: null, ringR: 7, capW: 20, labelled: true },
};
const PHONE = { top: 32, future: 70, recent: 110, brk: 14, perYear: 8, labelX: 208, bottomPad: 24 };

// --- Dates ---

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayOf = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
const isoOf = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);
function addMonths(d: string, months: number): string {
  const [y, m, day] = d.split("-").map(Number);
  const idx = y * 12 + (m - 1) + months;
  const ny = Math.floor(idx / 12), nm = idx - ny * 12 + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}
const monYear = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const monDay = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;

const r1 = (x: number) => Math.round(x * 10) / 10;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// --- Scales: piecewise linear segments over day numbers ---

type Piece = { d0: number; d1: number; p0: number; p1: number };
function scaleFor(m: MapModel, geo: Geo, size: MapSize, o: LayoutOptions): Piece[] {
  const today = dayOf(m.today), to = dayOf(m.range.to);
  let from = dayOf(m.range.from);
  if (from >= to) from = to - 365;
  const B = m.range.scaleBreak ? dayOf(m.range.scaleBreak) : null;
  if (size === "lineahead" || size === "lineahead-phone") {
    const [s0, s1] = geo.stub!;
    const stub: Piece = { d0: today - 7, d1: today, p0: s0, p1: s1 };
    if (o.planAhead && size === "lineahead") {
      const six = dayOf(addMonths(m.today, 6));
      if (six < to) {
        const w1 = 2 * (six - today), w2 = to - six;
        const mid = s1 + ((geo.t1 - s1) * w1) / (w1 + w2);
        return [stub, { d0: today, d1: six, p0: s1, p1: mid }, { d0: six, d1: to, p0: mid, p1: geo.t1 }];
      }
    }
    return [stub, { d0: today, d1: Math.max(to, today + 1), p0: s1, p1: geo.t1 }];
  }
  if (size === "phone") {
    const top = PHONE.top, now = top + PHONE.future, recentEnd = now + PHONE.recent;
    const fut: Piece = { d0: today, d1: Math.max(to, today + 1), p0: now, p1: top };
    if (B == null || from >= B) return [fut, { d0: Math.min(from, today - 1), d1: today, p0: recentEnd, p1: now }];
    const h0 = recentEnd + PHONE.brk;
    return [fut, { d0: B, d1: today, p0: recentEnd, p1: now }, { d0: from, d1: B, p0: h0 + ((B - from) / 365.25) * PHONE.perYear, p1: h0 }];
  }
  if (size === "routemap" && o.zoom) {
    const zf = dayOf(o.zoom.from), zt = Math.max(dayOf(o.zoom.to), dayOf(o.zoom.from) + 1);
    return [{ d0: zf, d1: zt, p0: geo.t0, p1: geo.t1 - 40 }, { d0: zt, d1: Math.max(today, zt + 1), p0: geo.t1 - 40, p1: geo.t1 }];
  }
  if (B != null && from < B && geo.brk) return [{ d0: from, d1: B, p0: geo.t0, p1: geo.brk[0] }, { d0: B, d1: to, p0: geo.brk[1], p1: geo.t1 }];
  return [{ d0: from, d1: to, p0: geo.t0, p1: geo.t1 }];
}
const lo = (ps: Piece[]) => Math.min(...ps.map((p) => p.d0));
const hi = (ps: Piece[]) => Math.max(...ps.map((p) => p.d1));
/** Position of a day; null outside the scale. On a shared boundary the later piece wins (the R side of a break). */
function posOf(ps: Piece[], d: number): number | null {
  if (d < lo(ps) - 1e-9 || d > hi(ps) + 1e-9) return null;
  let hit: Piece | null = null;
  for (const p of ps) if (d >= p.d0 - 1e-9 && d <= p.d1 + 1e-9 && (!hit || p.d0 >= hit.d0)) hit = p;
  if (!hit) return null;
  return hit.d1 === hit.d0 ? hit.p0 : hit.p0 + ((d - hit.d0) / (hit.d1 - hit.d0)) * (hit.p1 - hit.p0);
}
/** A span of days cut at piece boundaries (a break interrupts the line). */
function spanOf(ps: Piece[], a: number, b: number): [number, number][] {
  const out: [number, number][] = [];
  for (const p of ps) {
    const s = Math.max(a, p.d0), e = Math.min(b, p.d1);
    if (e - s <= 1e-9) continue;
    const f = (d: number) => (p.d1 === p.d0 ? p.p0 : p.p0 + ((d - p.d0) / (p.d1 - p.d0)) * (p.p1 - p.p0));
    out.push([f(s), f(e)]);
  }
  return out;
}

const INITIALS: Record<string, string> = { airframe: "Air", engine: "Eng", prop: "Prop", avionics: "Avi" };
function clip(s: string): string {
  if (s.length <= 32) return s;
  const cut = s.slice(0, 31).lastIndexOf(" ");
  return `${s.slice(0, cut > 0 ? cut : 31)}…`;
}

export function layoutMap(m: MapModel, o: LayoutOptions): Layout {
  const size = o.size;
  const geo = GEO[size];
  const k = (o.renderedWidth ?? geo.width) / geo.width;
  const fs = 13 / k, tfs = 12 / k;
  const ps = scaleFor(m, geo, size, o);
  const V = geo.vertical;
  const n = m.lines.length;
  const pos = (d: string) => posOf(ps, dayOf(d));
  const today = dayOf(m.today);

  // Cross-axis positions and the drawing's extent.
  const laneC = (i: number) => (size === "spine" ? 20 + (i - (n - 1) / 2) * geo.laneGap : geo.laneStart + i * geo.laneGap);
  const height = size === "routemap" ? n * 80 + 72
    : size === "spine" ? 40
    : size === "lineahead" ? 226
    : size === "lineahead-phone" ? 168
    : Math.max(...ps.map((p) => Math.max(p.p0, p.p1))) + PHONE.bottomPad;
  const tickY = size === "routemap" ? height - 10 : size === "lineahead" ? 222 : size === "lineahead-phone" ? 164 : 0;
  const pt = (t: number, c: number) => (V ? { x: r1(c), y: r1(t) } : { x: r1(t), y: r1(c) });
  const seg = (t1: number, c1: number, t2: number, c2: number): Seg => {
    const a = pt(t1, c1), b = pt(t2, c2);
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  };
  /** A rectangle spanning t1..t2 along time and c1..c2 across lanes. */
  const rect = (t1: number, t2: number, c1: number, c2: number): Rect => {
    const [ta, tb] = [Math.min(t1, t2), Math.max(t1, t2)], [ca, cb] = [Math.min(c1, c2), Math.max(c1, c2)];
    return V ? { x: r1(ca), y: r1(ta), w: r1(cb - ca), h: r1(tb - ta) } : { x: r1(ta), y: r1(ca), w: r1(tb - ta), h: r1(cb - ca) };
  };
  const laneOf = new Map(m.lines.map((l, i) => [l.lineId, i]));
  const isLineAhead = size === "lineahead" || size === "lineahead-phone";

  // --- Lanes and names ---
  const lanes = m.lines.map((l, i) => {
    const c = laneC(i);
    const suffix = l.name.match(/ (\d+)$/)?.[1];
    const name = V ? `${INITIALS[l.logbook]}${suffix ? ` ${suffix}` : ""}` : l.name;
    return V
      ? { lineId: l.lineId, logbook: l.logbook, name, c: r1(c), nameX: r1(c), nameY: 16, anchor: "middle" as Anchor }
      : { lineId: l.lineId, logbook: l.logbook, name, c: r1(c), nameX: 0, nameY: r1(c + 4), anchor: "start" as Anchor };
  });

  // --- Line segments: solid past (minus gaps), gaps, dotted future ---
  const drawnGaps = isLineAhead ? [] : m.gaps;
  const segments: Layout["segments"] = [];
  m.lines.forEach((l, i) => {
    const c = laneC(i);
    const own = m.stops.filter((s) => s.lineId === l.lineId).map((s) => dayOf(s.date));
    const gaps = drawnGaps.filter((g) => g.lineId === l.lineId).sort((a, b) => cmp(a.from, b.from));
    const starts = [...own, ...gaps.map((g) => dayOf(g.from)), ...l.volumes.filter((v) => v.from).map((v) => dayOf(v.from!))];
    const start = isLineAhead ? lo(ps) : Math.max(lo(ps), starts.length ? Math.min(...starts) : today);
    let cursor = start;
    const push = (a: number, b: number, kind: Layout["segments"][number]["kind"], gapId: string | null) => {
      for (const [p, q] of spanOf(ps, a, b)) segments.push({ lineId: l.lineId, kind, gapId, ...seg(p, c, q, c) });
    };
    for (const g of gaps) {
      const a = Math.max(dayOf(g.from), start), b = Math.min(dayOf(g.to), today);
      if (b <= a) continue;
      if (a > cursor) push(cursor, a, "solid", null);
      push(a, b, g.status === "no_pages_exist" ? "no_pages" : "gap", g.id);
      cursor = Math.max(cursor, b);
    }
    if (today > cursor) push(cursor, today, "solid", null);
    push(Math.max(today, start), hi(ps), "future", null);
  });

  // --- Interchanges (RouteMap, Spine, phone) ---
  const inCapsule = new Set<string>();
  const interchanges: Layout["interchanges"] = [];
  if (!isLineAhead)
    for (const x of m.interchanges) {
      const t = pos(x.date);
      const idx = x.lineIds.map((id) => laneOf.get(id)).filter((i): i is number => i != null);
      if (t == null || idx.length < 2) continue;
      x.stopIds.forEach((s) => inCapsule.add(s));
      const c1 = laneC(Math.min(...idx)), c2 = laneC(Math.max(...idx));
      const r = size === "spine"
        ? rect(t - geo.capW / 2, t + geo.capW / 2, (c1 + c2) / 2 - 12, (c1 + c2) / 2 + 12)
        : rect(t - geo.capW / 2, t + geo.capW / 2, c1 - 12, c2 + 12);
      interchanges.push({ id: x.id, ...r, dotted: x.trust === "ai_read", dots: size === "spine" ? [] : idx.map((i) => pt(t, laneC(i))) });
    }

  // --- Stops (RouteMap, phone): majors alone, routine stops closer than 8 px merged ---
  const stops: Layout["stops"] = [];
  const stopPos: { id: string; t: number; c: number; r: number; major: boolean; stop: MapStop }[] = [];
  if (size === "routemap" || size === "phone")
    m.lines.forEach((l, i) => {
      const c = laneC(i);
      const mine = m.stops.filter((s) => s.lineId === l.lineId && !inCapsule.has(s.id))
        .map((s) => ({ s, t: pos(s.date) })).filter((x): x is { s: MapStop; t: number } => x.t != null);
      let run: { s: MapStop; t: number }[] = [];
      const flush = () => {
        if (!run.length) return;
        const t = run.reduce((a, x) => a + x.t, 0) / run.length;
        const first = run[0].s;
        stops.push({ id: first.id, lineId: l.lineId, ...pt(t, c), r: run.length > 1 ? 7 : 5, dotted: run.some((x) => x.s.trust === "ai_read"), major: false, count: run.length, ids: run.map((x) => x.s.id) });
        run = [];
      };
      for (const x of mine) {
        if (x.s.major) {
          flush();
          stops.push({ id: x.s.id, lineId: l.lineId, ...pt(x.t, c), r: 9, dotted: x.s.trust === "ai_read", major: true, count: 1, ids: [x.s.id] });
          stopPos.push({ id: x.s.id, t: x.t, c, r: 9, major: true, stop: x.s });
          continue;
        }
        if (run.length && Math.abs(x.t - run[run.length - 1].t) * k >= 8) flush();
        run.push(x);
      }
      flush();
    });

  // --- Rings: offset ±8 across the lane when closer than 14 px (never merged) ---
  const rings: Layout["rings"] = [];
  m.lines.forEach((l, i) => {
    const c = laneC(i);
    const mine = m.rings.filter((r) => r.lineId === l.lineId)
      .map((r) => ({ r, t: pos(r.date) }))
      .filter((x): x is { r: (typeof m.rings)[number]; t: number } => x.t != null && (size !== "spine" || !m.range.scaleBreak || dayOf(x.r.date) >= dayOf(m.range.scaleBreak)))
      .sort((a, b) => a.t - b.t || cmp(a.r.itemKey, b.r.itemKey));
    let j = 0;
    mine.forEach((x, idx) => {
      j = idx > 0 && (x.t - mine[idx - 1].t) * k < 14 ? j + 1 : 0;
      const off = size === "spine" || j === 0 ? 0 : j % 2 === 1 ? -8 : 8;
      rings.push({ itemKey: x.r.itemKey, lineId: l.lineId, ...pt(x.t, c + off), r: geo.ringR, status: x.r.status });
    });
  });

  // --- Visit capsules (not on the Spine): span the lanes of their rings, else every lane ---
  const visits: Layout["visits"] = [];
  if (size !== "spine" && n)
    for (const v of m.visits) {
      const t = pos(v.weekOf);
      if (t == null) continue;
      const idx = [...new Set(m.rings.filter((r) => v.itemKeys.includes(r.itemKey)).map((r) => laneOf.get(r.lineId)).filter((i): i is number => i != null))];
      const use = idx.length ? idx : m.lines.map((_, i) => i);
      visits.push({ id: v.id ?? v.suggestionKey ?? "", state: v.state, ...rect(t - 10, t + 10, laneC(Math.min(...use)) - 12, laneC(Math.max(...use)) + 12) });
    }

  // --- Era bands (RouteMap, phone): latest per line unless allEras ---
  const eras: Layout["eras"] = [];
  if (size === "routemap" || size === "phone")
    for (const l of m.lines) {
      const mine = m.eras.filter((e) => e.lineId === l.lineId);
      for (const e of o.allEras ? mine : mine.filter((e) => e.to == null)) {
        const a = Math.max(dayOf(e.from), lo(ps)), b = Math.min(e.to ? dayOf(e.to) : today, hi(ps));
        if (b <= a) continue;
        const c = laneC(laneOf.get(l.lineId)!);
        for (const [p, q] of spanOf(ps, a, b)) eras.push({ lineId: l.lineId, ...rect(p, q, c - 10, c + 10) });
      }
    }

  // --- Squawk diamonds (RouteMap, Spine, phone) ---
  const squawks: Layout["squawks"] = [];
  if (!isLineAhead)
    for (const s of m.squawks) {
      const t = pos(s.date), i = laneOf.get(s.lineId);
      if (t != null && i != null) squawks.push({ id: s.id, ...pt(t, laneC(i)), open: s.open });
    }

  // --- Today, the break rule, the window ---
  const cs = m.lines.map((_, i) => laneC(i));
  const cMin = n ? Math.min(...cs) : size === "spine" ? 20 : geo.laneStart;
  const cMax = n ? Math.max(...cs) : cMin;
  const clampC = (c: number) => (size === "spine" ? Math.min(40, Math.max(0, c)) : c);
  const tToday = pos(m.today);
  const todaySeg = tToday == null ? null : seg(tToday, clampC(cMin - 12), tToday, clampC(cMax + 12));
  let scaleBreak: Seg | null = null;
  if (m.range.scaleBreak && !o.zoom && (size === "routemap" || size === "spine" || size === "phone")) {
    const b = dayOf(m.range.scaleBreak);
    if (b > lo(ps)) {
      const t = size === "phone" ? PHONE.top + PHONE.future + PHONE.recent + PHONE.brk / 2 : (geo.brk![0] + geo.brk![1]) / 2;
      scaleBreak = seg(t, clampC(cMin - 12), t, clampC(cMax + 12));
    }
  }
  let window: Rect | null = null;
  if (o.window) {
    const a = posOf(ps, Math.max(dayOf(o.window.from), lo(ps))), b = posOf(ps, Math.min(dayOf(o.window.to), hi(ps)));
    if (a != null && b != null) window = size === "spine" ? rect(a, b, 2, 38) : rect(a, b, cMin - 20, cMax + 20);
  }

  // --- Axis ticks, thinned to 40 px apart; "Today" always kept ---
  const ticks: Layout["ticks"] = [];
  if (size !== "spine") {
    const cand: { t: number; label: string; anchor: Anchor; today?: boolean }[] = [];
    const add = (d: string, label: string, anchor: Anchor = "middle") => {
      const t = pos(d);
      if (t != null) cand.push({ t, label, anchor });
    };
    if (tToday != null) cand.push({ t: tToday, label: "Today", anchor: "middle", today: true });
    if (isLineAhead) {
      for (let d = addMonths(`${m.today.slice(0, 7)}-01`, 1); dayOf(d) <= hi(ps); d = addMonths(d, 1))
        add(d, d.slice(5, 7) === "01" ? monYear(d) : MONTHS[Number(d.slice(5, 7)) - 1]);
    } else {
      const a = lo(ps), b = o.zoom ? dayOf(o.zoom.to) : m.range.scaleBreak && !o.zoom ? dayOf(m.range.scaleBreak) : hi(ps);
      const y0 = Number(isoOf(a).slice(0, 4)), y1 = Number(isoOf(b).slice(0, 4));
      const step = y1 - y0 >= 20 ? 10 : y1 - y0 >= 6 ? 5 : 1;
      for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
        const d = `${String(y).padStart(4, "0")}-01-01`;
        if (dayOf(d) >= a && dayOf(d) < b) add(d, String(y), size === "phone" ? "start" : "middle");
      }
      if (m.range.scaleBreak && !o.zoom && size !== "phone") add(m.range.scaleBreak, monYear(m.range.scaleBreak));
      if (size !== "phone" && !o.zoom) add(m.range.to, m.range.to.slice(0, 4), "end");
    }
    const minGap = (V ? 16 : 40) / k;
    const kept: typeof cand = [];
    for (const c of [...cand.filter((c) => c.today), ...cand.filter((c) => !c.today).sort((p, q) => p.t - q.t)])
      if (kept.every((x) => Math.abs(x.t - c.t) >= minGap)) kept.push(c);
    for (const c of kept.sort((p, q) => p.t - q.t))
      ticks.push(V ? { x: 0, y: r1(c.t + 4), label: c.label, anchor: "start" } : { x: r1(c.t), y: tickY, label: c.label, anchor: c.anchor });
  }

  // --- Labels (10 §7): greedy by priority, first candidate that collides with nothing ---
  const labels: Layout["labels"] = [];
  let more = 0;
  if (geo.labelled) {
    type Box = { x: number; y: number; w: number; h: number };
    const pad = 3;
    const obstacles: Box[] = [];
    const ob = (b: Box) => obstacles.push({ x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad });
    for (const s of stops) ob({ x: s.x - s.r, y: s.y - s.r, w: 2 * s.r, h: 2 * s.r });
    for (const r of rings) ob({ x: r.x - r.r, y: r.y - r.r, w: 2 * r.r, h: 2 * r.r });
    for (const c of [...interchanges, ...visits]) ob(c);
    if (!V) obstacles.push({ x: 0, y: tickY - tfs, w: geo.width, h: height });
    const hit = (b: Box) => obstacles.some((o2) => b.x < o2.x + o2.w && b.x + b.w > o2.x && b.y < o2.y + o2.h && b.y + b.h > o2.y);

    type Want = { key: string; text: string; prio: number; t: number; cTop: number; cBot: number; centred: boolean };
    const want: Want[] = [];
    const ringStatus = new Map(m.rings.map((r) => [r.itemKey, r]));
    const phoneHome = size === "lineahead-phone";
    for (const r of rings) {
      const mr = ringStatus.get(r.itemKey)!;
      if (phoneHome && mr.kind !== "annual") continue;
      const [t, c] = V ? [r.y, r.x] : [r.x, r.y];
      want.push({ key: `ring:${r.itemKey}`, text: clip(mr.label), prio: r.status === "overdue" ? 0 : r.status === "due_soon" ? 1 : 7, t, cTop: c - r.r, cBot: c + r.r, centred: false });
    }
    for (const v of visits) {
      const mv = m.visits.find((x) => (x.id ?? x.suggestionKey) === v.id)!;
      const text = mv.state === "in_shop" ? "In the shop" : `${mv.state === "planned" ? "Planned" : "Suggested"}, week of ${monDay(mv.weekOf)}`;
      const [t, c1, c2] = V ? [v.y + v.h / 2, v.x, v.x + v.w] : [v.x + v.w / 2, v.y, v.y + v.h];
      want.push({ key: `visit:${v.id}`, text, prio: 2, t, cTop: c1, cBot: c2, centred: false });
    }
    if (!phoneHome) {
      for (const x of interchanges) {
        const mx = m.interchanges.find((i) => i.id === x.id)!;
        const [t, c1, c2] = V ? [x.y + x.h / 2, x.x, x.x + x.w] : [x.x + x.w / 2, x.y, x.y + x.h];
        want.push({ key: `interchange:${x.id}`, text: clip(`${mx.label ?? "Visit"}, ${monYear(mx.date)}`), prio: 3, t, cTop: c1, cBot: c2, centred: false });
      }
      for (const s of stopPos) {
        const year = s.stop.date.slice(0, 4);
        want.push({ key: `stop:${s.id}`, text: clip(s.stop.label ? `${s.stop.label}, ${year}` : year), prio: 4, t: s.t, cTop: s.c - s.r, cBot: s.c + s.r, centred: false });
      }
      for (const g of segments.filter((sg) => sg.gapId)) {
        if (want.some((w) => w.key === `gap:${g.gapId}`)) continue;
        const mg = m.gaps.find((x) => x.id === g.gapId)!;
        const before = !m.stops.some((s) => s.lineId === mg.lineId && s.date <= mg.from);
        const text = mg.status === "no_pages_exist" ? "No pages exist (you marked this)"
          : before ? `No pages yet before ${mg.to.slice(0, 4)}` : `No pages, ${mg.from.slice(0, 4)} to ${mg.to.slice(0, 4)}`;
        const pieces = segments.filter((sg) => sg.gapId === g.gapId);
        const [t1, t2] = V ? [pieces[0].y1, pieces[pieces.length - 1].y2] : [pieces[0].x1, pieces[pieces.length - 1].x2];
        const c = V ? g.x1 : g.y1;
        want.push({ key: `gap:${g.gapId}`, text, prio: 5, t: (t1 + t2) / 2, cTop: c - 3, cBot: c + 3, centred: true });
      }
    }
    want.sort((a, b) => a.prio - b.prio || a.t - b.t || cmp(a.key, b.key));
    const textW = (s: string) => s.length * fs * 0.56;
    for (const w of want) {
      const tw = textW(w.text);
      const cands: { x: number; y: number; anchor: Anchor; box: Box }[] = [];
      if (V) {
        const y = w.t + 0.35 * fs;
        cands.push({ x: PHONE.labelX, y, anchor: "start", box: { x: PHONE.labelX, y: y - 0.8 * fs, w: tw, h: fs } });
      } else {
        const above = w.cTop - 8, below = w.cBot + 8 + 0.8 * fs;
        for (const y of [above, below]) {
          if (w.centred) cands.push({ x: w.t, y, anchor: "middle", box: { x: w.t - tw / 2, y: y - 0.8 * fs, w: tw, h: fs } });
          else {
            cands.push({ x: w.t + 8, y, anchor: "start", box: { x: w.t + 8, y: y - 0.8 * fs, w: tw, h: fs } });
            cands.push({ x: w.t - 8, y, anchor: "end", box: { x: w.t - 8 - tw, y: y - 0.8 * fs, w: tw, h: fs } });
          }
        }
      }
      const inside = (b: Box) => b.x >= geo.nameW && b.x + b.w <= geo.width && b.y >= 0 && b.y + b.h <= height;
      const ok = cands.find((c) => inside(c.box) && !hit(c.box));
      if (!ok) { more++; continue; }
      labels.push({ for: w.key, text: w.text, x: r1(ok.x), y: r1(ok.y), anchor: ok.anchor });
      obstacles.push({ x: ok.box.x - pad, y: ok.box.y - pad, w: ok.box.w + 2 * pad, h: ok.box.h + 2 * pad });
    }
  }

  return {
    size, width: geo.width, height: r1(height), fontSize: r1(fs), lanes, segments, stops, interchanges, rings, visits, eras, squawks,
    today: todaySeg, scaleBreak, window, ticks, labels, more,
  };
}

/** Days as dates, for callers mapping a pointer back to time (hover readout, Spine clicks). */
export function dateAt(m: MapModel, o: LayoutOptions, p: number): string | null {
  const ps = scaleFor(m, GEO[o.size], o.size, o);
  for (const x of ps) {
    const [a, b] = [Math.min(x.p0, x.p1), Math.max(x.p0, x.p1)];
    if (p >= a && p <= b && x.p1 !== x.p0) return isoOf(Math.round(x.d0 + ((p - x.p0) / (x.p1 - x.p0)) * (x.d1 - x.d0)));
  }
  return null;
}

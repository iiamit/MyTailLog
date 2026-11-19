"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MapModel } from "@/lib/mapModel";
import { dateAt, layoutMap, type Layout } from "@/ui/map/map-layout";
import { LINE_TOKEN } from "@/lib/v2/status";
import { BOOK_NAME, addYears, markName, navigate, withParams, zoomAround, zoomWindow, type Mark, type MapParams } from "@/lib/v2/books";

export type StopInfo = { title: string | null; page: number | null };

const RING = {
  overdue: { stroke: "var(--color-alarm)", fill: "var(--color-alarm)", word: "overdue" },
  due_soon: { stroke: "var(--color-alarm)", fill: "var(--color-leaf)", word: "due soon" },
  current: { stroke: "var(--color-ink)", fill: "var(--color-leaf)", word: "current" },
} as const;

/**
 * The RouteMap (02 §4.4, 10 §8.2): the whole life of the aircraft's books, laid out by map-layout.ts at the width the
 * leaf really has, so labels render at 13px and rings stay round. A composite widget with roving focus (10 §10):
 * arrows walk a line and hop lines, Home/End, Page Up/Down a year, Enter selects, Shift+Enter opens, + / − / 0 zoom,
 * L the list, Esc clears. Selection, zoom and the book filter live in the URL (replace), so reload restores them.
 * shortcut: no drag-on-axis range selection and no >2,000-stop canvas layer yet; ctrl-wheel and keys zoom instead.
 */
export function RouteMap({
  model,
  tail,
  base,
  aircraftPath,
  params,
  selected,
  stopInfo,
  ringNames,
  height,
}: {
  model: MapModel;
  tail: string;
  /** The map's own path, e.g. /aircraft/1/logbooks/map. */
  base: string;
  aircraftPath: string;
  params: MapParams;
  /** "stop:<stopId>" | "interchange:<id>" | "gap:<id>" */
  selected: string | null;
  stopInfo: Record<string, StopInfo>;
  ringNames: Record<string, string>;
  height?: "tall";
}) {
  const router = useRouter();
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [focus, setFocus] = useState<{ key: string; line: string } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [said, setSaid] = useState("");

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const life = { from: model.range.from, to: model.range.to };
  const zoom = zoomWindow(params, life);
  const opts = { size: "routemap" as const, renderedWidth: width ?? undefined, zoom, allEras: !!params.book };
  const L: Layout = useMemo(() => layoutMap(model, opts), [model, width, zoom?.from, zoom?.to, params.book]); // eslint-disable-line react-hooks/exhaustive-deps
  const k = (width ?? L.width) / L.width;

  const lineBook = new Map(model.lines.map((l) => [l.lineId, l.logbook]));
  const lineOrder = model.lines.map((l) => l.lineId);
  const stopById = new Map(model.stops.map((s) => [s.id, s]));

  // Every focusable mark with its time position and accessible name (10 §10).
  const marks: Mark[] = useMemo(() => {
    const out: Mark[] = [];
    for (const s of L.stops) {
      const ms = stopById.get(s.id)!;
      const info = stopInfo[s.id];
      out.push({
        key: `stop:${s.id}`, lines: [s.lineId], t: s.x, date: ms.date,
        name: markName({ title: s.count > 1 ? `${s.count} stops` : info?.title ?? ms.label, date: ms.date, books: [ms.logbook], trust: ms.trust, page: info?.page, count: s.count > 1 ? undefined : ms.entryIds.length }),
      });
    }
    for (const x of L.interchanges) {
      const mx = model.interchanges.find((i) => i.id === x.id)!;
      out.push({
        key: `interchange:${x.id}`, lines: mx.lineIds, t: x.x + x.w / 2, date: mx.date,
        name: `${markName({ title: mx.label ?? "One visit", date: mx.date, books: mx.lineIds.map((l) => lineBook.get(l) ?? ""), trust: mx.trust })}, one visit`,
      });
    }
    const seen = new Set<string>();
    for (const g of L.segments) {
      if (!g.gapId || seen.has(g.gapId)) continue;
      seen.add(g.gapId);
      const mg = model.gaps.find((x) => x.id === g.gapId)!;
      const pieces = L.segments.filter((p) => p.gapId === g.gapId);
      out.push({
        key: `gap:${g.gapId}`, lines: [g.lineId], t: (pieces[0].x1 + pieces[pieces.length - 1].x2) / 2, date: mg.from,
        name: `${mg.status === "no_pages_exist" ? "No pages exist" : "No pages"}, ${BOOK_NAME[mg.logbook]}, ${mg.from.slice(0, 4)} to ${mg.to.slice(0, 4)}${mg.status === "asked_previous_owner" ? ", asked the previous owner" : ""}`,
      });
    }
    for (const r of L.rings) {
      const mr = model.rings.find((x) => x.itemKey === r.itemKey)!;
      out.push({ key: `ring:${r.itemKey}`, lines: [r.lineId], t: r.x, date: mr.date, name: ringNames[r.itemKey] ?? `${mr.label}, ${RING[r.status as keyof typeof RING]?.word ?? ""}` });
    }
    return out;
  }, [L]); // eslint-disable-line react-hooks/exhaustive-deps
  const byKey = new Map(marks.map((m) => [m.key, m]));
  const entry = navigate(marks, lineOrder, null, "");
  const tabKey = selected && byKey.has(selected) ? selected : focus?.key ?? entry?.key ?? null;

  const go = (q: string, push = false) => (push ? router.push(`${base}${q}`) : router.replace(`${base}${q}`, { scroll: false }));
  const clear = { stop: undefined, visit: undefined, gap: undefined };
  function select(key: string | null) {
    if (!key) return go(withParams(params, clear));
    const [kind, id] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
    if (kind === "stop") go(withParams(params, { ...clear, stop: stopById.get(id)?.entryIds[0] }));
    else if (kind === "interchange") go(withParams(params, { ...clear, visit: id }));
    else if (kind === "gap") go(withParams(params, { ...clear, gap: id }));
    else if (kind === "ring") router.push(`${aircraftPath}/status/item/${encodeURIComponent(id)}`);
  }
  function open(key: string) {
    const [kind, id] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
    const m = byKey.get(key);
    if (kind === "stop") router.push(`${aircraftPath}/logbooks/entries/${stopById.get(id)?.entryIds[0]}`);
    else if (kind === "interchange" && m) go(withParams(params, { from: addYears(m.date, -1), to: addYears(m.date, 1), ...clear, visit: id }));
    else if (kind === "gap") {
      const g = model.gaps.find((x) => x.id === id);
      if (g) go(withParams(params, { from: g.from, to: g.to, ...clear, gap: id }));
    } else select(key);
  }
  function zoomBy(factor: number | null, center?: string) {
    if (factor == null) return go(withParams(params, { from: undefined, to: undefined }));
    const cur = zoom ?? life;
    const c = center ?? (byKey.get(tabKey ?? "")?.date ?? model.today);
    const w = zoomAround(c, cur, factor, life);
    go(withParams(params, { from: w?.from, to: w?.to }));
  }

  // Ctrl / Cmd + wheel zooms around the pointer; a plain wheel scrolls the leaf (no scroll-jacking, 02 §4.4).
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const d = dateAt(model, opts, ((e.clientX - r.left) / r.width) * L.width);
      if (d) zoomBy(e.deltaY > 0 ? 1.5 : 1 / 1.5, d);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  function onKey(e: React.KeyboardEvent) {
    const cur = focus && byKey.has(focus.key) ? focus : tabKey ? { key: tabKey, line: byKey.get(tabKey)!.lines[0] } : null;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(e.key)) {
      e.preventDefault();
      const next = navigate(marks, lineOrder, cur, e.key);
      if (!next) return;
      setFocus(next);
      const row = marks.filter((m) => m.lines.includes(next.line)).sort((a, b) => a.t - b.t);
      setSaid(`${byKey.get(next.key)!.name}. ${row.findIndex((m) => m.key === next.key) + 1} of ${row.length} on the ${model.lines.find((l) => l.lineId === next.line)?.name ?? ""} line.`);
      (wrap.current?.querySelector(`[data-key="${CSS.escape(next.key)}"]`) as SVGElement | null)?.focus();
    } else if (e.key === "Enter" && cur) {
      e.preventDefault();
      if (e.shiftKey) open(cur.key);
      else select(cur.key);
    } else if (e.key === " " && cur) {
      e.preventDefault();
      select(cur.key);
    } else if (e.key === "+" || e.key === "=") zoomBy(1 / 2);
    else if (e.key === "-" || e.key === "−") zoomBy(2);
    else if (e.key === "0") zoomBy(null);
    else if (e.key === "l" || e.key === "L") router.push(`${aircraftPath}/logbooks/list${withParams(params, { stop: cur?.key.startsWith("stop:") ? stopById.get(cur.key.slice(5))?.entryIds[0] : params.stop, visit: undefined, gap: undefined })}`);
    else if (e.key === "Escape") {
      if (selected) select(null);
      else (e.target as HTMLElement).blur();
    }
  }

  const dim = (lineId: string) => (params.book && lineBook.get(lineId) !== params.book ? 0.25 : 1);
  const sw = (v: string) => ({ strokeWidth: v, vectorEffect: "non-scaling-stroke" }) as React.CSSProperties;
  const markProps = (key: string) => ({
    "data-key": key,
    role: "button",
    tabIndex: key === tabKey ? 0 : -1,
    "aria-label": byKey.get(key)?.name,
    "aria-pressed": selected === key,
    onFocus: () => {
      const m = byKey.get(key);
      if (m && focus?.key !== key) setFocus({ key, line: focus && m.lines.includes(focus.line) ? focus.line : m.lines[0] });
      setHover(key);
    },
    onBlur: () => setHover(null),
    onMouseEnter: () => setHover(key),
    onMouseLeave: () => setHover(null),
    onClick: (e: React.MouseEvent) => (e.stopPropagation(), select(key)),
    onDoubleClick: (e: React.MouseEvent) => (e.stopPropagation(), open(key)),
    className: "cursor-pointer outline-none [&:focus-visible>.focus]:visible",
  });

  const selGap = selected?.startsWith("gap:") ? L.segments.filter((s) => s.gapId === selected.slice(4)) : [];
  const mg = selGap.length ? model.gaps.find((g) => g.id === selected!.slice(4)) : null;
  const top = 8, bottom = L.height - 26;
  const hov = hover ? byKey.get(hover) : null;
  const hovPos = hov ? { x: hov.t * k, y: (markY(L, hover!) ?? 0) * k } : null;
  const span = zoom ?? { from: model.range.from, to: model.range.to };

  return (
    <div className="relative">
      <div
        ref={wrap}
        role="group"
        aria-label={`Route map of ${tail}'s logbooks, ${span.from.slice(0, 4)} to ${span.to.slice(0, 4)}`}
        aria-describedby="route-map-help"
        onKeyDown={onKey}
        className="relative"
      >
        <svg
          viewBox={`0 0 ${L.width} ${L.height}`}
          className={`block w-full ${height === "tall" ? "" : ""}`}
          style={{ height: width ? L.height * k : undefined }}
          onClick={() => selected && select(null)}
        >
          {/* Selected gap: its years tinted across every line (W-BOOKS-04). */}
          {selGap.length > 0 && (
            <g aria-hidden>
              <rect x={selGap[0].x1} y={top} width={selGap[selGap.length - 1].x2 - selGap[0].x1} height={bottom - top} fill="var(--color-leaf-2)" />
              {mg && (
                <text x={(selGap[0].x1 + selGap[selGap.length - 1].x2) / 2} y={bottom - 4} textAnchor="middle" fill="var(--color-ink-2)" style={{ fontSize: L.fontSize, fontWeight: 600 }}>
                  Selected: {Math.max(1, Math.round((Date.parse(mg.to) - Date.parse(mg.from)) / 31_557_600_000))} years
                </text>
              )}
            </g>
          )}
          {L.eras.map((e, i) => (
            <rect key={`era${i}`} aria-hidden x={e.x} y={e.y} width={e.w} height={e.h} rx={4} fill={LINE_TOKEN[lineBook.get(e.lineId) ?? ""]} fillOpacity={0.08 * dim(e.lineId)} />
          ))}
          {L.lanes.map((l) => (
            <text key={l.lineId} aria-hidden x={l.nameX} y={l.nameY} fill={LINE_TOKEN[l.logbook]} opacity={dim(l.lineId)} style={{ fontSize: L.fontSize, fontWeight: 700 }}>
              {l.name}
            </text>
          ))}
          {L.segments.map((s, i) => (
            <line
              key={`seg${i}`}
              aria-hidden
              x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
              stroke={LINE_TOKEN[lineBook.get(s.lineId) ?? ""]}
              strokeOpacity={(s.kind === "no_pages" ? 0.6 : 1) * dim(s.lineId)}
              strokeLinecap={s.kind === "gap" || s.kind === "no_pages" ? "butt" : "round"}
              strokeDasharray={s.kind === "gap" ? "6 6" : s.kind === "future" ? "0.1 11" : undefined}
              style={sw(s.kind === "gap" ? "var(--map-gap-stroke)" : s.kind === "no_pages" ? "3px" : "var(--map-line-stroke)")}
            />
          ))}
          {/* Gaps are marks too: a 24px-tall hit area along the dashed stretch. */}
          {[...new Set(L.segments.filter((s) => s.gapId).map((s) => s.gapId!))].map((id) => {
            const ps = L.segments.filter((s) => s.gapId === id);
            const key = `gap:${id}`;
            const x1 = ps[0].x1, x2 = ps[ps.length - 1].x2, y = ps[0].y1;
            return (
              <g key={key} {...markProps(key)} opacity={dim(ps[0].lineId)}>
                <rect x={x1} y={y - 12} width={Math.max(4, x2 - x1)} height={24} fill="transparent" />
                <rect className="focus invisible" x={x1 - 3} y={y - 9} width={x2 - x1 + 6} height={18} rx={4} fill="none" stroke="var(--color-focus)" style={sw("2px")} />
                {selected === key && <rect x={x1 - 2} y={y - 6} width={x2 - x1 + 4} height={12} rx={3} fill="none" stroke="var(--color-board-ink)" style={sw("2px")} />}
              </g>
            );
          })}
          {L.scaleBreak && <line aria-hidden {...xy(L.scaleBreak)} stroke="var(--color-rule)" strokeDasharray="3 5" style={sw("1px")} />}
          {L.today && <line aria-hidden {...xy(L.today)} stroke="var(--color-ink)" style={sw("1.5px")} />}
          {L.squawks.map((q) => (
            <rect key={q.id} aria-hidden x={q.x - 4} y={q.y - 4} width={8} height={8} transform={`rotate(45 ${q.x} ${q.y})`} fill={q.open ? "var(--color-ink)" : "var(--color-leaf)"} stroke="var(--color-ink)" style={sw("1.5px")} />
          ))}
          {L.visits.map((v) => (
            <rect key={v.id} aria-hidden x={v.x} y={v.y} width={v.w} height={v.h} rx={10} fill="var(--color-leaf-2)" stroke={v.state === "in_shop" ? "var(--color-board-ink)" : "var(--color-ink)"} strokeDasharray={v.state === "suggested" ? "4 4" : undefined} style={sw(v.state === "in_shop" ? "3px" : "var(--map-cap-stroke)")} />
          ))}
          {L.interchanges.map((x) => {
            const key = `interchange:${x.id}`;
            const isSel = selected === key;
            return (
              <g key={key} {...markProps(key)}>
                <rect className="focus invisible" x={x.x - 5} y={x.y - 5} width={x.w + 10} height={x.h + 10} rx={14} fill="none" stroke="var(--color-focus)" style={sw("2px")} />
                <rect x={x.x} y={x.y} width={x.w} height={x.h} rx={10} fill="var(--color-leaf)" stroke="var(--color-ink)" strokeDasharray={x.dotted ? "2 2.5" : undefined} style={sw(isSel || hover === key ? "var(--map-cap-sel-stroke)" : "var(--map-cap-stroke)")} />
                {x.dots.map((d, i) => (
                  <circle key={i} cx={d.x} cy={d.y} r={2.5} fill="var(--color-ink)" />
                ))}
              </g>
            );
          })}
          {L.stops.map((s) => {
            const key = `stop:${s.id}`;
            const isSel = selected === key || (s.count > 1 && selected != null && s.ids.some((id) => selected === `stop:${id}`));
            return (
              <g key={key} {...markProps(key)} opacity={dim(s.lineId)}>
                <circle cx={s.x} cy={s.y} r={12} fill="transparent" />
                <circle className="focus invisible" cx={s.x} cy={s.y} r={s.r + 6} fill="none" stroke="var(--color-focus)" style={sw("2px")} />
                {isSel && <circle cx={s.x} cy={s.y} r={s.r + 4} fill="none" stroke="var(--color-board-ink)" style={sw("2px")} />}
                <circle cx={s.x} cy={s.y} r={hover === key ? s.r + 1 : s.r} fill="var(--color-leaf)" stroke="var(--color-ink)" strokeDasharray={s.dotted ? "2 2.5" : undefined} style={sw(isSel ? "3.5px" : "var(--map-stop-stroke)")} />
              </g>
            );
          })}
          {L.rings.map((r) => {
            const key = `ring:${r.itemKey}`;
            const st = RING[r.status as keyof typeof RING] ?? RING.current;
            return (
              <g key={key} {...markProps(key)} opacity={dim(r.lineId)}>
                <circle cx={r.x} cy={r.y} r={12} fill="transparent" />
                <circle className="focus invisible" cx={r.x} cy={r.y} r={r.r + 6} fill="none" stroke="var(--color-focus)" style={sw("2px")} />
                <circle cx={r.x} cy={r.y} r={r.r} fill={st.fill} stroke={st.stroke} style={sw("var(--map-ring-stroke)")} />
              </g>
            );
          })}
          {L.labels.map((l) => (
            <text
              key={l.for}
              aria-hidden
              x={l.x}
              y={l.y}
              textAnchor={l.anchor}
              fill={l.for.startsWith("gap:") ? "var(--color-ink-3)" : l.for.startsWith("ring:") && /overdue|due_soon/.test(L.rings.find((r) => `ring:${r.itemKey}` === l.for)?.status ?? "") ? "var(--color-alarm-text)" : "var(--color-ink-2)"}
              style={{ fontSize: L.fontSize, fontWeight: 600 }}
            >
              {l.text}
            </text>
          ))}
          {L.ticks.map((t) => (
            <text key={`${t.x}-${t.label}`} aria-hidden x={t.x} y={t.y} textAnchor={t.anchor} fill={t.label === "Today" ? "var(--color-ink)" : "var(--color-ink-3)"} style={{ fontSize: L.fontSize * (12 / 13), fontWeight: t.label === "Today" ? 600 : 500 }}>
              {t.label}
            </text>
          ))}
        </svg>
        {hov && hovPos && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-10 max-w-[260px] -translate-x-1/2 rounded-[3px] bg-ink px-2 py-1 text-[13px] leading-[1.35] font-semibold text-leaf"
            style={{ left: Math.min(Math.max(hovPos.x, 130), (width ?? 820) - 130), ...(hovPos.y < 60 ? { top: hovPos.y + 16 } : { bottom: `calc(100% - ${hovPos.y - 14}px)` }) }}
          >
            {hov.name}
          </div>
        )}
      </div>
      <p id="route-map-help" className="sr-only">
        Arrow keys move along a line and between lines, Page Up and Page Down jump a year, Enter selects, Shift Enter opens the entry, plus and minus zoom, L shows the list.
      </p>
      <p aria-live="polite" className="sr-only">
        {said}
      </p>
      {L.more > 0 && <p className="mt-1 text-caption text-ink-3">{L.more} more {L.more === 1 ? "label" : "labels"} did not fit: see the list.</p>}
    </div>
  );
}

const xy = (s: { x1: number; y1: number; x2: number; y2: number }) => ({ x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 });

/** The y of a mark, for placing its tooltip. */
function markY(L: Layout, key: string): number | null {
  const id = key.slice(key.indexOf(":") + 1);
  if (key.startsWith("stop:")) return L.stops.find((s) => s.id === id)?.y ?? null;
  if (key.startsWith("ring:")) return L.rings.find((r) => r.itemKey === id)?.y ?? null;
  if (key.startsWith("interchange:")) return L.interchanges.find((x) => x.id === id)?.y ?? null;
  if (key.startsWith("gap:")) return L.segments.find((s) => s.gapId === id)?.y1 ?? null;
  return null;
}

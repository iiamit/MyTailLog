"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MapModel } from "@/lib/mapModel";
import { dateAt, layoutMap } from "@/ui/map/map-layout";
import { LINE_TOKEN } from "@/lib/v2/status";
import { addYears, fmtMonth } from "@/lib/v2/books";

/**
 * The spine's strip (02 §4.2, 10 §8.1): every line thin, gaps, interchanges, rings ahead, squawks, today and the
 * window, drawn at its measured pixel width so rings stay round. Clicking a point before today opens the map at ±2
 * years around it; after today, Status. Display only for assistive tech: the spine's link carries the name.
 */
export function SpineStrip({
  model,
  window,
  mapHref,
  statusHref,
}: {
  model: MapModel;
  window?: { from: string; to: string } | null;
  mapHref: string;
  statusHref: string;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [hover, setHover] = useState<{ x: number; date: string } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const opts = { size: "spine" as const, renderedWidth: width ?? undefined, window };
  const L = useMemo(() => layoutMap(model, opts), [model, width, window?.from, window?.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const k = (width ?? L.width) / L.width;
  const book = new Map(model.lines.map((l) => [l.lineId, l.logbook]));
  const sw = (v: string) => ({ strokeWidth: v, vectorEffect: "non-scaling-stroke" }) as React.CSSProperties;
  const at = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return dateAt(model, opts, ((clientX - r.left) / r.width) * L.width);
  };

  return (
    <div
      ref={ref}
      aria-hidden
      className="relative h-10 cursor-pointer"
      onMouseMove={(e) => {
        const d = at(e.clientX);
        setHover(d ? { x: e.clientX - ref.current!.getBoundingClientRect().left, date: d } : null);
      }}
      onMouseLeave={() => setHover(null)}
      onClick={(e) => {
        e.preventDefault();
        const d = at(e.clientX);
        if (!d) return;
        if (d > model.today) router.push(statusHref);
        else router.push(`${mapHref}?from=${addYears(d, -2)}&to=${addYears(d, 2)}`);
      }}
    >
      {/* x scales by k, y not at all; marks compensate (rx = r / k) so they stay round at every width. */}
      <svg viewBox={`0 0 ${L.width} 40`} className="block h-10 w-full" preserveAspectRatio="none">
        {L.window && <rect x={L.window.x} y={L.window.y} width={L.window.w} height={L.window.h} rx={3 / k} ry={3} fill="var(--color-board-ink)" fillOpacity={0.12} stroke="var(--color-board-ink)" style={sw("1.5px")} />}
        {L.segments.map((s, i) => (
          <line
            key={i}
            x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
            stroke={LINE_TOKEN[book.get(s.lineId) ?? ""]}
            strokeOpacity={s.kind === "no_pages" ? 0.6 : 1}
            strokeLinecap={s.kind === "gap" || s.kind === "no_pages" ? "butt" : "round"}
            strokeDasharray={s.kind === "gap" ? "6 6" : s.kind === "future" ? "0.1 7" : undefined}
            style={sw(s.kind === "gap" ? "2px" : "var(--map-line-stroke-thin)")}
          />
        ))}
        {L.scaleBreak && <line x1={L.scaleBreak.x1} y1={L.scaleBreak.y1} x2={L.scaleBreak.x2} y2={L.scaleBreak.y2} stroke="var(--color-rule)" strokeDasharray="2 3" style={sw("1px")} />}
        {L.interchanges.map((x) => (
          <rect key={x.id} x={x.x} y={x.y} width={x.w} height={x.h} rx={4 / k} ry={4} fill="var(--color-leaf)" stroke="var(--color-ink)" strokeDasharray={x.dotted ? "2 2.5" : undefined} style={sw("1.5px")} />
        ))}
        {L.today && <line x1={L.today.x1} y1={0} x2={L.today.x2} y2={40} stroke="var(--color-ink)" style={sw("1.5px")} />}
        {L.rings.map((r) => (
          <ellipse
            key={r.itemKey}
            cx={r.x} cy={r.y} rx={3.5 / k} ry={3.5}
            fill={r.status === "overdue" ? "var(--color-alarm)" : "var(--color-leaf)"}
            stroke={r.status === "current" ? "var(--color-ink)" : "var(--color-alarm)"}
            style={sw("2px")}
          />
        ))}
      </svg>
      {hover && (
        <span className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded-[3px] bg-ink px-2 py-0.5 text-[13px] font-semibold whitespace-nowrap text-leaf" style={{ left: hover.x }}>
          {fmtMonth(hover.date)}
        </span>
      )}
    </div>
  );
}

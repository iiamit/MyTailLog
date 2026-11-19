import type { MapModel } from "@/lib/mapModel";
import { LINE_TOKEN } from "@/lib/v2/status";
import { layoutMap, type MapSize } from "@/ui/map/map-layout";

const RING: Record<string, { stroke: string; fill: string }> = {
  overdue: { stroke: "var(--color-alarm)", fill: "var(--color-alarm)" },
  due_soon: { stroke: "var(--color-alarm)", fill: "var(--color-leaf)" },
  current: { stroke: "var(--color-ink)", fill: "var(--color-leaf)" },
};
const sw = (w: string) => ({ strokeWidth: w, vectorEffect: "non-scaling-stroke" as const });

/**
 * A read-only RouteMap drawn on the server (W-SHARE-02's map tab): the same layout as the owner's map (map-layout.ts),
 * every stop a plain link to `stopHref`, no client routing into the owner's screens. Two drawings: the horizontal map,
 * and the phone's vertical one below 640px so labels stay at reading size (10 §8.4).
 */
export function StaticMap({ model, stopHref, selected, label }: { model: MapModel; stopHref?: (stopId: string) => string; selected?: string | null; label: string }) {
  return (
    <figure role="group" aria-label={label} className="m-0">
      <div className="max-[639px]:hidden"><Drawing model={model} size="routemap" stopHref={stopHref} selected={selected} /></div>
      <div className="min-[640px]:hidden"><Drawing model={model} size="phone" stopHref={stopHref} selected={selected} /></div>
    </figure>
  );
}

function Drawing({ model, size, stopHref, selected }: { model: MapModel; size: MapSize; stopHref?: (id: string) => string; selected?: string | null }) {
  const L = layoutMap(model, { size });
  const book = new Map(model.lines.map((l) => [l.lineId, l.logbook]));
  const stopById = new Map(model.stops.map((s) => [s.id, s]));
  const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return (
    <svg viewBox={`0 0 ${L.width} ${L.height}`} className="block h-auto w-full">
      {L.lanes.map((l) => (
        <text key={l.lineId} aria-hidden x={l.nameX} y={l.nameY} textAnchor={l.anchor} fill={LINE_TOKEN[l.logbook]} style={{ fontSize: L.fontSize, fontWeight: 700 }}>{l.name}</text>
      ))}
      {L.segments.map((s, i) => (
        <line
          key={i}
          aria-hidden
          x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
          stroke={LINE_TOKEN[book.get(s.lineId) ?? ""]}
          strokeOpacity={s.kind === "no_pages" ? 0.6 : 1}
          strokeLinecap={s.kind === "solid" ? "round" : "butt"}
          strokeDasharray={s.kind === "gap" ? "6 6" : s.kind === "future" ? "0.1 11" : undefined}
          style={sw(s.kind === "gap" ? "var(--map-gap-stroke)" : s.kind === "no_pages" ? "3px" : "var(--map-line-stroke)")}
        />
      ))}
      {L.scaleBreak && <line aria-hidden x1={L.scaleBreak.x1} y1={L.scaleBreak.y1} x2={L.scaleBreak.x2} y2={L.scaleBreak.y2} stroke="var(--color-rule)" strokeDasharray="3 5" style={sw("1px")} />}
      {L.today && <line aria-hidden x1={L.today.x1} y1={L.today.y1} x2={L.today.x2} y2={L.today.y2} stroke="var(--color-ink)" style={sw("1.5px")} />}
      {L.interchanges.map((x) => (
        <g key={x.id} aria-hidden>
          <rect x={x.x} y={x.y} width={x.w} height={x.h} rx={10} fill="var(--color-leaf)" stroke="var(--color-ink)" style={sw("var(--map-cap-stroke)")} />
          {x.dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={2.5} fill="var(--color-ink)" />)}
        </g>
      ))}
      {L.rings.map((r) => (
        <circle key={r.itemKey} aria-hidden cx={r.x} cy={r.y} r={r.r} fill={(RING[r.status] ?? RING.current).fill} stroke={(RING[r.status] ?? RING.current).stroke} style={sw("var(--map-ring-stroke)")} />
      ))}
      {L.stops.map((s) => {
        const ms = stopById.get(s.ids[0] ?? s.id);
        const isSel = selected != null && s.ids.includes(selected);
        return (
          <Stop key={s.id} href={stopHref?.(s.ids[0] ?? s.id)} label={`${ms?.label ?? "Entry"}, ${ms ? fmt(ms.date) : ""}${s.count > 1 ? `, ${s.count} stops` : ""}. Open it.`} current={isSel}>
            <circle cx={s.x} cy={s.y} r={12} fill="transparent" />
            {isSel && <circle cx={s.x} cy={s.y} r={s.r + 4} fill="none" stroke="var(--color-board-ink)" style={sw("2px")} />}
            <circle cx={s.x} cy={s.y} r={s.r} fill="var(--color-leaf)" stroke="var(--color-ink)" style={sw(isSel ? "3.5px" : "var(--map-stop-stroke)")} />
          </Stop>
        );
      })}
      {L.labels.filter((l) => !l.for.startsWith("visit:")).map((l) => (
        <text key={l.for} aria-hidden x={l.x} y={l.y} textAnchor={l.anchor} fill={l.for.startsWith("gap:") ? "var(--color-ink-3)" : "var(--color-ink-2)"} style={{ fontSize: L.fontSize, fontWeight: 500 }}>
          {l.text}
        </text>
      ))}
      {L.ticks.map((t) => (
        <text key={`${t.x}-${t.label}`} aria-hidden x={t.x} y={t.y} textAnchor={t.anchor} fill="var(--color-ink-3)" style={{ fontSize: L.fontSize * (12 / 13), fontWeight: 500 }}>{t.label}</text>
      ))}
    </svg>
  );
}

/** A stop is a link when the map has somewhere to send it, otherwise just a drawing. */
function Stop({ href, label, current, children }: { href?: string; label: string; current: boolean; children: React.ReactNode }) {
  return href ? <a href={href} aria-label={label} aria-current={current ? "true" : undefined}>{children}</a> : <g aria-hidden>{children}</g>;
}

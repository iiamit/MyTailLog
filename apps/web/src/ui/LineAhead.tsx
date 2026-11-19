import { LA, BOOK, LINE_TOKEN, layoutLineAhead, monthTicks, xFor, type RingInput } from "@/lib/v2/status";

/** A shop visit drawn across the lines it touches (02 §4.7 VisitCapsule). */
export type CapInput = { key: string; date: string; lines: string[]; kind: "suggested" | "planned" | "in_shop" | "awaiting_records"; label: string; name: string };

const RING: Record<string, { stroke: string; fill: string }> = {
  overdue: { stroke: "var(--color-alarm)", fill: "var(--color-alarm)" },
  due_soon: { stroke: "var(--color-alarm)", fill: "var(--color-leaf)" },
  current: { stroke: "var(--color-ink)", fill: "var(--color-leaf)" },
};

/**
 * The next twelve months on the books' lines (02 §4.5, 10 §8.3 status variant): solid stub, dotted future,
 * rings at due dates, today, month ticks. The DueTable is the full equivalent for screen readers; each ring is
 * still a button with its own name so keyboard users can select from the drawing. Visit caps sit behind the rings.
 * shortcut: rings and caps are each a tab stop rather than the roving-focus composite of 10 §10.
 */
export function LineAhead({
  from,
  to,
  lanes,
  rings,
  dim,
  selected,
  onSelect,
  summary,
  caps = [],
  selectedCap,
  onSelectCap,
}: {
  from: string;
  to: string;
  lanes: string[];
  rings: (RingInput & { name: string })[];
  dim?: (key: string) => boolean;
  selected?: string | null;
  onSelect?: (key: string) => void;
  summary: string;
  caps?: CapInput[];
  selectedCap?: string | null;
  onSelectCap?: (key: string) => void;
}) {
  const { rings: placed, more } = layoutLineAhead(rings, lanes, from, to);
  const ticks = monthTicks(from, to);
  const laneY = (i: number) => LA.laneTop + i * LA.laneGap;
  const top = laneY(0) - 20;
  const bottom = laneY(lanes.length - 1) + 20;
  const names = new Map(rings.map((r) => [r.key, r.name]));
  return (
    <figure role="group" aria-label="The line ahead: the next twelve months on each logbook line" className="m-0 mb-1">
      <svg viewBox={`0 0 ${LA.width} ${LA.height}`} className="block h-auto w-full" aria-describedby="line-ahead-summary">
        {lanes.map((l, i) => (
          <g key={l} aria-hidden>
            <text x={0} y={laneY(i) + 4} fill={LINE_TOKEN[l]} className="text-map-label">
              {BOOK[l]}
            </text>
            <line x1={LA.nameCol + 4} x2={LA.todayX} y1={laneY(i)} y2={laneY(i)} stroke={LINE_TOKEN[l]} style={{ strokeWidth: "var(--map-line-stroke)" }} strokeLinecap="round" />
            <line x1={LA.todayX} x2={LA.horizonX} y1={laneY(i)} y2={laneY(i)} stroke={LINE_TOKEN[l]} style={{ strokeWidth: "var(--map-line-stroke)" }} strokeLinecap="round" strokeDasharray="0.1 11" />
          </g>
        ))}
        <line aria-hidden x1={LA.todayX} x2={LA.todayX} y1={top} y2={bottom} stroke="var(--color-ink)" strokeWidth="1.5" />
        {ticks.map((t) => (
          <text key={`${t.x}-${t.label}`} aria-hidden x={t.x} y={LA.tickY} textAnchor={t.anchor} fill="var(--color-ink-3)" className="text-map-tick">
            {t.label}
          </text>
        ))}
        {caps.map((c) => {
          const ys = c.lines.filter((l) => lanes.includes(l)).map((l) => laneY(lanes.indexOf(l)));
          if (!ys.length) return null;
          const x = xFor(c.date, from, to);
          const y1 = Math.min(...ys) - 10;
          const y2 = Math.max(...ys) + 10;
          const isSel = selectedCap === c.key;
          const act = () => onSelectCap?.(c.key);
          return (
            <g
              key={c.key}
              role="button"
              tabIndex={0}
              aria-label={c.name}
              aria-pressed={isSel}
              className="cursor-pointer outline-none [&:focus-visible>.focus]:visible"
              onClick={act}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  act();
                }
              }}
            >
              <rect className="focus invisible" x={x - 13} y={y1 - 3} width={26} height={y2 - y1 + 6} rx={13} fill="none" stroke="var(--color-focus)" strokeWidth="2" />
              <rect
                x={x - 10}
                y={y1}
                width={20}
                height={y2 - y1}
                rx={10}
                fill={c.kind === "suggested" || c.kind === "planned" || c.kind === "in_shop" ? "var(--color-leaf-2)" : "var(--color-leaf)"}
                stroke={c.kind === "in_shop" ? "var(--board-ink)" : "var(--color-ink)"}
                strokeDasharray={c.kind === "suggested" ? "4 4" : undefined}
                style={{ strokeWidth: isSel ? "var(--map-cap-sel-stroke)" : "var(--map-cap-stroke)" }}
              />
              <text x={x} y={y1 - 6} textAnchor="middle" fill="var(--color-ink)" className="text-map-label font-semibold" aria-hidden>
                {c.label}
              </text>
            </g>
          );
        })}
        {placed.map((r) => {
          const style = RING[r.status] ?? RING.current;
          const isSel = selected === r.key;
          return (
            <g
              key={r.key}
              role="button"
              tabIndex={0}
              aria-label={names.get(r.key)}
              aria-pressed={isSel}
              opacity={dim?.(r.key) ? 0.3 : 1}
              className="cursor-pointer outline-none [&:focus-visible>.focus]:visible"
              onClick={() => onSelect?.(r.key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect?.(r.key);
                }
              }}
            >
              <circle cx={r.x} cy={r.y} r={12} fill="transparent" />
              <circle className="focus invisible" cx={r.x} cy={r.y} r={13} fill="none" stroke="var(--color-focus)" strokeWidth="2" />
              <circle
                cx={r.x}
                cy={r.y}
                r={7}
                fill={style.fill}
                stroke={style.stroke}
                style={{ r: "var(--map-ring-radius)", strokeWidth: isSel ? "var(--map-cap-sel-stroke)" : "var(--map-ring-stroke)" } as React.CSSProperties}
              />
              {r.labelX != null && r.labelY != null && (
                <text
                  x={r.labelX}
                  y={r.labelY}
                  textAnchor={r.anchor}
                  fill={r.status === "overdue" || r.status === "due_soon" ? "var(--color-alarm-text)" : "var(--color-ink-2)"}
                  className={`text-map-label ${isSel ? "font-bold" : ""}`}
                  aria-hidden
                >
                  {r.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption id="line-ahead-summary" className="sr-only">
        {summary}
      </figcaption>
      {more > 0 && (
        <p className="text-caption text-ink-3">
          {more} more {more === 1 ? "item" : "items"}: see the list.
        </p>
      )}
    </figure>
  );
}

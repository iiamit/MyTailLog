"use client";

import { useState } from "react";
import { metalFlag } from "@/lib/v2/oil";

export type ChartSample = { id: string; date: string; label: string; oilHours: number | null; ppm: Record<string, number>; avg: Record<string, number> };

const DEFAULT = ["iron", "copper", "aluminum", "chromium"];
const MORE = ["nickel", "silicon", "lead"];
// One line per element; each carries its name at the line end, so colour is never the only key.
const INK: Record<string, string> = {
  iron: "var(--color-line-engine)",
  copper: "var(--color-line-propeller)",
  aluminum: "var(--color-line-airframe)",
  chromium: "var(--color-line-avionics)",
  nickel: "var(--color-line-other)",
  silicon: "var(--color-ink-2)",
  lead: "var(--color-ink-3)",
};
const name = (e: string) => e[0].toUpperCase() + e.slice(1);

/** W-AIRCRAFT-02 wear metals: ppm per sample against the lab's universal average (dashed), with a table equivalent. */
export function WearChart({ samples }: { samples: ChartSample[] }) {
  const available = [...DEFAULT, ...MORE].filter((e) => samples.some((s) => s.ppm[e] != null));
  const [on, setOn] = useState<string[]>(DEFAULT.filter((e) => available.includes(e)));
  const W = 664;
  const H = 220;
  const pad = { l: 36, r: 76, t: 14, b: 40 };
  const shown = on.filter((e) => available.includes(e));
  const latest = samples[samples.length - 1];
  const values = shown.flatMap((e) => [...samples.map((s) => s.ppm[e]), latest?.avg[e]]).filter((v): v is number => typeof v === "number");
  const yMax = Math.max(1, ...values) * 1.15;
  const n = samples.length;
  const x = (i: number) => pad.l + (n <= 1 ? (W - pad.l - pad.r) / 2 : (i / (n - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - v / yMax) * (H - pad.t - pad.b);
  const ticks = [0, yMax / 2.3, yMax / 1.15].map((v) => Math.round(v));

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Elements on the chart">
        {available.map((e) => {
          const pressed = shown.includes(e);
          return (
            <button
              key={e}
              type="button"
              aria-pressed={pressed}
              onClick={() => setOn(pressed ? on.filter((o) => o !== e) : [...on, e])}
              className={`state-layer inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-small font-semibold ${pressed ? "border-ink bg-ink text-leaf" : "border-control-border bg-leaf text-ink"}`}
            >
              <span aria-hidden className="inline-block h-[4px] w-3.5 rounded-[2px]" style={{ background: INK[e] }} />
              {name(e)}
            </button>
          );
        })}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Wear metals in parts per million across ${n} samples. The table below lists every value.`}>
        {ticks.map((t) => (
          <g key={t} aria-hidden>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--color-rule)" strokeWidth="1" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fill="var(--color-ink-3)" className="text-map-tick">{t}</text>
          </g>
        ))}
        <text x={4} y={pad.t - 2} fill="var(--color-ink-3)" className="text-map-tick" aria-hidden>parts per million</text>
        {shown.map((e) => {
          const pts = samples.map((s, i) => ({ i, v: s.ppm[e] })).filter((p): p is { i: number; v: number } => typeof p.v === "number");
          const avg = latest?.avg[e];
          const last = pts[pts.length - 1];
          return (
            <g key={e} aria-hidden>
              {avg != null && <line x1={pad.l} x2={W - pad.r} y1={y(avg)} y2={y(avg)} stroke={INK[e]} strokeWidth="1" strokeDasharray="4 4" opacity="0.8" />}
              {pts.length > 1 && <polyline points={pts.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")} fill="none" stroke={INK[e]} strokeWidth="2.5" strokeLinejoin="round" />}
              {pts.map((p) => {
                const flag = metalFlag(p.v, samples[p.i].avg[e]);
                return (
                  <g key={p.i}>
                    {flag === "twice" && <circle cx={x(p.i)} cy={y(p.v)} r="8" fill="none" stroke="var(--color-alarm)" strokeWidth="2.5" />}
                    <circle cx={x(p.i)} cy={y(p.v)} r="3.5" fill="var(--color-leaf)" stroke={INK[e]} strokeWidth="2.5" />
                    {flag && (
                      <text x={x(p.i) + 10} y={y(p.v) - 6} fill={flag === "twice" ? "var(--color-alarm-text)" : "var(--color-ink)"} className="text-map-tick">
                        {p.v}{flag === "twice" ? ", 2× avg" : ""}
                      </text>
                    )}
                  </g>
                );
              })}
              {last && <text x={W - pad.r + 8} y={y(last.v) + 4} fill="var(--color-ink)" className="text-map-tick">{name(e)}</text>}
            </g>
          );
        })}
        {samples.map((s, i) => (
          <g key={s.id} aria-hidden>
            <text x={x(i)} y={H - 22} textAnchor="middle" fill="var(--color-ink-2)" className="text-map-tick">{s.label}</text>
            {s.oilHours != null && <text x={x(i)} y={H - 8} textAnchor="middle" fill="var(--color-ink-3)" className="text-map-tick">{s.oilHours} h on oil</text>}
          </g>
        ))}
      </svg>
      <p className="mt-1 text-caption text-ink-3">Dashed: the lab&apos;s universal average. A ring marks twice the average.</p>
      <details className="mt-2">
        <summary className="cursor-pointer text-small font-semibold text-board-ink">Show as a table</summary>
        <table className="mt-2 w-full text-small tabular-nums">
          <thead className="text-left text-ink-3">
            <tr>
              <th className="py-1 font-semibold">Sampled</th>
              {available.map((e) => <th key={e} className="font-semibold">{name(e)}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {samples.map((s) => (
              <tr key={s.id}>
                <td className="py-1.5">{s.label}</td>
                {available.map((e) => {
                  const flag = metalFlag(s.ppm[e], s.avg[e]);
                  return (
                    <td key={e} className={flag === "twice" ? "font-bold text-alarm-text" : flag ? "font-bold" : ""}>
                      {s.ppm[e] ?? "none"}
                      {flag === "twice" ? " (2× avg)" : flag ? " (above avg)" : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

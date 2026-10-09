import Link from "next/link";
import { engineTrends, type TrendEntry } from "@/lib/engineTrends";

const sourceHref = (aircraftId: string, pageId: string | null, entryId: string) =>
  pageId ? `/aircraft/${aircraftId}/pages/${pageId}/review` : `/aircraft/${aircraftId}/timeline?entry=${entryId}`;

export function EngineTrends({ aircraftId, entries, resets }: {
  aircraftId: string;
  entries: TrendEntry[];
  resets: { meter: string; reset_date: string }[];
}) {
  const { compression, needsReview, oilChanges, oilIntervals } = engineTrends(entries, resets);
  const confirmed = compression.filter((test) => test.confirmed && test.date);
  const cylinders = [...new Set(confirmed.flatMap((test) => test.readings.map((r) => r.cylinder)))].sort((a, b) => a - b);
  const dated = confirmed.map((test) => Date.parse(`${test.date}T00:00:00Z`));
  const minDate = Math.min(...dated);
  const maxDate = Math.max(...dated);
  const xFor = (date: string) => 40 + (Date.parse(`${date}T00:00:00Z`) - minDate) / Math.max(1, maxDate - minDate) * 600;
  const colors = ["#14b8a6", "#f59e0b", "#60a5fa", "#f472b6", "#a78bfa", "#84cc16", "#f97316", "#06b6d4", "#e879f9", "#eab308", "#22c55e", "#ef4444"];

  return <section className="mt-10 border-t border-line pt-8">
    <h2 className="font-display text-xl font-semibold text-ink">Historical engine trends</h2>
    <p className="mt-2 max-w-3xl text-sm leading-relaxed text-dim">
      Compression readings and oil changes recognized in logbook entries. Only confirmed, dated entries appear on the chart. Open a source page to verify or correct its transcription; use “Cyl 1 76/80” wording for a reading the parser missed. Readings across an engine replacement may refer to different engines; this is a record view, not a diagnosis.
    </p>
    <h3 className="mt-7 text-base font-semibold text-ink">Cylinder compression</h3>
    {confirmed.length > 1 ? <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-panel p-3">
      <svg viewBox="0 0 680 180" role="img" aria-label="Confirmed cylinder compression readings over time" className="min-w-[560px] w-full">
        {[0, 40, 80, 120].map((v) => <g key={v}><line x1="40" x2="640" y1={150 - v} y2={150 - v} stroke="currentColor" opacity="0.15" /><text x="2" y={154 - v} fill="currentColor" fontSize="11">{v}</text></g>)}
        {cylinders.map((cyl) => {
          const points = confirmed.flatMap((test) => test.readings.filter((r) => r.cylinder === cyl).map((r) => ({ x: xFor(test.date!), y: 150 - r.psi, test })));
          return <g key={cyl} fill={colors[(cyl - 1) % colors.length]} stroke={colors[(cyl - 1) % colors.length]}>
            {points.length > 1 && <polyline points={points.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" strokeWidth="2" />}
            {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="4"><title>{`Cylinder ${cyl}: ${150 - p.y} psi on ${p.test.date}`}</title></circle>)}
          </g>;
        })}
        <text x="40" y="175" fill="currentColor" fontSize="11">{confirmed[0].date}</text>
        <text x="640" y="175" fill="currentColor" textAnchor="end" fontSize="11">{confirmed[confirmed.length - 1].date}</text>
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-dim">{cylinders.map((cyl) => <span key={cyl} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: colors[(cyl - 1) % colors.length] }} />Cylinder {cyl}</span>)}</div>
    </div> : <p className="mt-2 text-sm text-faint">Add at least two confirmed, dated compression records to see a trend.</p>}
    {compression.length > 0 && <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-line text-faint"><th className="p-2">Date</th><th className="p-2">Readings (psi)</th><th className="p-2">Review</th></tr></thead><tbody>{[...compression].reverse().map((test) => <tr key={test.entryId} className="border-b border-line"><td className="p-2">{test.date ?? "Undated"}</td><td className="p-2">{test.readings.map((r) => `#${r.cylinder} ${r.psi}/${r.reference}`).join(" · ")}</td><td className="p-2"><Link className="text-accent underline" href={sourceHref(aircraftId, test.pageId, test.entryId)}>{test.confirmed ? "Source entry" : "Confirm source"}</Link></td></tr>)}</tbody></table></div>}
    {needsReview.length > 0 && <p className="mt-3 text-sm text-annun-amber">{needsReview.length} entr{needsReview.length === 1 ? "y mentions" : "ies mention"} compression without clear cylinder readings: {needsReview.slice(0, 10).map((item, i) => <span key={item.entryId}>{i > 0 && ", "}<Link className="underline" href={sourceHref(aircraftId, item.pageId, item.entryId)}>{item.date ?? "undated entry"}</Link></span>)}{needsReview.length > 10 && " …"}</p>}
    <h3 className="mt-8 text-base font-semibold text-ink">Oil-change intervals</h3>
    <p className="mt-1 text-sm text-dim">Measured between confirmed oil changes using the same recorded meter. Intervals crossing a known meter reset are omitted.</p>
    {oilIntervals.length ? <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-line text-faint"><th className="p-2">From</th><th className="p-2">To</th><th className="p-2">Interval</th></tr></thead><tbody>{[...oilIntervals].reverse().map((interval) => <tr key={`${interval.from.entryId}-${interval.to.entryId}`} className="border-b border-line"><td className="p-2"><Link className="text-accent underline" href={sourceHref(aircraftId, interval.from.pageId, interval.from.entryId)}>{interval.from.date}</Link></td><td className="p-2"><Link className="text-accent underline" href={sourceHref(aircraftId, interval.to.pageId, interval.to.entryId)}>{interval.to.date}</Link></td><td className="p-2">{interval.hours} {interval.meter} hrs</td></tr>)}</tbody></table></div> : <p className="mt-2 text-sm text-faint">No comparable confirmed oil-change pair with recorded hours yet.</p>}
    <p className="mt-3 text-xs text-faint">{oilChanges.length} oil-change entr{oilChanges.length === 1 ? "y" : "ies"} recognized. Missing pages or inconsistent meter readings can make an interval appear longer than the actual service interval.</p>
  </section>;
}

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { OilAnalysisSample } from "@/lib/database.types";
import {
  OIL_ELEMENTS,
  OIL_PROPERTIES,
  KEY_METALS,
  PROPERTY_LABEL,
  elementLabel,
} from "@/lib/oilElements";

type Msg = { ok: boolean; text: string } | null;

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : Number.isInteger(n) ? String(n) : n.toFixed(2);

// Compare a wear-metal value to the lab's universal average. Heuristic only —
// the lab's written comments are authoritative.
function tone(ppm: number | undefined, avg: number | null | undefined): "" | "amber" | "red" {
  if (ppm == null || avg == null || avg <= 0) return "";
  if (ppm >= 2 * avg) return "red";
  if (ppm > avg) return "amber";
  return "";
}
const toneClass = (t: "" | "amber" | "red") =>
  t === "red" ? "text-annun-red font-semibold" : t === "amber" ? "text-annun-amber" : "text-ink";

export function OilAnalysisClient({
  aircraftId,
  aircraftTail,
  canEdit,
  samples,
}: {
  aircraftId: string;
  aircraftTail: string;
  canEdit: boolean;
  samples: OilAnalysisSample[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/aircraft/${aircraftId}/oil-analysis/import`, {
        method: "POST",
        body: fd,
      });
      const j = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: j.error || "Import failed." });
      } else {
        const mismatch =
          j.reportTail &&
          j.aircraftTail &&
          String(j.reportTail).toUpperCase() !== String(j.aircraftTail).toUpperCase()
            ? ` — heads up: the report's tail (${j.reportTail}) doesn't match ${j.aircraftTail}`
            : "";
        setMsg({
          ok: true,
          text: `Imported ${j.inserted + j.updated} sample${j.inserted + j.updated === 1 ? "" : "s"} from ${j.lab || "the report"}${mismatch}.`,
        });
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: "Import failed — please try again." });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const latest = samples.length ? samples[samples.length - 1] : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Import */}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-4">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={onFile}
            disabled={busy}
            className="hidden"
            id="oil-file"
          />
          <label
            htmlFor="oil-file"
            className={`cursor-pointer rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90 ${busy ? "pointer-events-none opacity-60" : ""}`}
          >
            {busy ? "Reading report…" : "Import oil report"}
          </label>
          <span className="text-xs text-faint">
            Blackstone / AVLab PDF, or a photo of the report. Every sample in the report is imported.
          </span>
          {msg && (
            <span className={`text-sm ${msg.ok ? "text-annun-green" : "text-annun-red"}`}>{msg.text}</span>
          )}
        </div>
      )}

      {samples.length === 0 ? (
        <div className="rounded-lg border border-line p-8 text-center text-sm text-dim">
          No oil analysis yet.{" "}
          {canEdit ? "Import a lab report to start tracking wear-metal trends." : "No reports have been imported."}
        </div>
      ) : (
        <>
          {/* Latest sample summary */}
          {latest && (
            <div className="rounded-lg border border-line p-5">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold">
                  Latest sample — {latest.sample_date}
                </h2>
                <span className="text-xs text-faint">
                  {latest.lab}
                  {latest.lab_number ? ` · ${latest.lab_number}` : ""}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                <Field label="Hours on oil" value={fmt(latest.oil_hours)} />
                <Field label="Engine hours" value={fmt(latest.engine_hours)} />
                <Field label="Oil added (qt)" value={fmt(latest.oil_added_quarts)} />
                <Field label="Oil type" value={latest.oil_type ?? "—"} />
              </dl>
              {latest.lab_comments && (
                <div className="mt-4 rounded-md border border-line bg-panel2 p-3 text-[13px] leading-relaxed text-dim">
                  <span className="font-medium text-ink">Lab assessment: </span>
                  {latest.lab_comments}
                </div>
              )}
            </div>
          )}

          {/* Trend charts (need ≥2 samples to trend; 1 sample shows a point vs the average) */}
          <div className="rounded-lg border border-line p-5">
            <h2 className="mb-1 font-semibold">Wear-metal trend</h2>
            <p className="mb-4 text-xs text-faint">
              Parts per million by sample date. The dashed line is the lab&apos;s universal average
              for this engine type — above it (amber/red) is worth watching.
            </p>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {KEY_METALS.filter((m) =>
                samples.some((s) => (s.elements_ppm as Record<string, number>)?.[m] != null),
              ).map((metal) => (
                <TrendChart key={metal} metal={metal} samples={samples} />
              ))}
            </div>
          </div>

          {/* Full element table for the latest sample */}
          {latest && (
            <div className="rounded-lg border border-line p-5">
              <h2 className="mb-3 font-semibold">Elements — latest sample (ppm)</h2>
              <div className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
                {OIL_ELEMENTS.filter(
                  (el) =>
                    (latest.elements_ppm as Record<string, number>)?.[el] != null ||
                    (latest.universal_averages as Record<string, number> | null)?.[el] != null,
                ).map((el) => {
                  const ppm = (latest.elements_ppm as Record<string, number>)?.[el];
                  const avg = (latest.universal_averages as Record<string, number> | null)?.[el] ?? null;
                  const t = tone(ppm, avg);
                  return (
                    <div key={el} className="flex items-center justify-between border-b border-line/50 py-1 text-sm">
                      <span className="text-dim">{elementLabel(el)}</span>
                      <span className="flex items-baseline gap-2 tabular-nums">
                        <span className={toneClass(t)}>{fmt(ppm)}</span>
                        <span className="text-[11px] text-faint">avg {fmt(avg)}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Oil properties for the latest sample */}
          {latest?.oil_properties && (
            <div className="rounded-lg border border-line p-5">
              <h2 className="mb-3 font-semibold">Oil properties — latest sample</h2>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                {OIL_PROPERTIES.filter(
                  (p) => (latest.oil_properties as Record<string, number>)?.[p] != null,
                ).map((p) => (
                  <Field
                    key={p}
                    label={PROPERTY_LABEL[p] ?? p}
                    value={fmt((latest.oil_properties as Record<string, number>)[p])}
                  />
                ))}
              </dl>
            </div>
          )}

          {/* Sample history */}
          <div className="rounded-lg border border-line p-5">
            <h2 className="mb-3 font-semibold">All samples ({samples.length})</h2>
            <div className="flex flex-col gap-1 text-sm">
              {[...samples].reverse().map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line/50 py-1.5">
                  <span className="font-medium">{s.sample_date}</span>
                  <span className="text-xs text-faint">
                    {s.oil_hours != null ? `${fmt(s.oil_hours)} hrs on oil` : ""}
                    {s.engine_hours != null ? ` · ${fmt(s.engine_hours)} eng hrs` : ""}
                    {s.lab ? ` · ${s.lab}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-faint">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

// Compact inline-SVG trend for one metal across samples, with the universal
// average as a dashed reference line. Degenerates to a single point for one
// sample (still meaningful against the average line).
function TrendChart({ metal, samples }: { metal: string; samples: OilAnalysisSample[] }) {
  const W = 240;
  const H = 90;
  const pad = { l: 26, r: 8, t: 10, b: 18 };
  const pts = samples
    .map((s, i) => ({ i, y: (s.elements_ppm as Record<string, number>)?.[metal], date: s.sample_date }))
    .filter((p): p is { i: number; y: number; date: string } => typeof p.y === "number");
  if (pts.length === 0) return null;

  const avg =
    (samples[samples.length - 1].universal_averages as Record<string, number> | null)?.[metal] ?? null;
  const ys = [...pts.map((p) => p.y), ...(avg != null ? [avg] : [])];
  const yMax = Math.max(...ys, 1) * 1.15;
  const n = samples.length;
  const x = (i: number) => pad.l + (n <= 1 ? (W - pad.l - pad.r) / 2 : (i / (n - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - v / yMax) * (H - pad.t - pad.b);

  const line = pts.map((p) => `${x(p.i)},${y(p.y)}`).join(" ");
  const last = pts[pts.length - 1];
  const t = tone(last.y, avg);
  const stroke = t === "red" ? "var(--red)" : t === "amber" ? "var(--amb)" : "var(--accent)";

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm font-medium">{elementLabel(metal)}</span>
        <span className={`text-sm tabular-nums ${toneClass(t)}`}>{fmt(last.y)} ppm</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${metal} trend`}>
        {/* axis baseline */}
        <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke="var(--line)" strokeWidth="1" />
        {avg != null && (
          <>
            <line
              x1={pad.l}
              y1={y(avg)}
              x2={W - pad.r}
              y2={y(avg)}
              stroke="var(--faint)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <text x={pad.l - 3} y={y(avg) + 3} textAnchor="end" className="fill-faint" fontSize="8">
              {fmt(avg)}
            </text>
          </>
        )}
        {pts.length > 1 && <polyline points={line} fill="none" stroke={stroke} strokeWidth="1.5" />}
        {pts.map((p) => (
          <circle key={p.i} cx={x(p.i)} cy={y(p.y)} r="2.5" fill={stroke} />
        ))}
      </svg>
    </div>
  );
}

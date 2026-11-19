import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAircraftShellContext } from "@/lib/aircraftContext";
import { fmtDate } from "@/lib/due/engine";
import { dueSnapshot } from "@/lib/due/load";
import { buildMapModel } from "@/lib/mapModel";
import { aircraftTail } from "@/lib/v2/landing";
import { aircraftTabs } from "@/lib/v2/tabs";
import { BOOK } from "@/lib/v2/status";
import { avgOf, metalFlag, oilVerdict, ppm } from "@/lib/v2/oil";
import { OIL_ELEMENTS, OIL_PROPERTIES, PROPERTY_LABEL, elementLabel } from "@/lib/oilElements";
import { oilConsumption } from "@/lib/oilConsumption";
import { engineTrends } from "@/lib/engineTrends";
import { loadLogEntries } from "@/lib/loadLogEntries";
import { Board, BoardHead, HungSection, Leaf, Leaves, SourceMat, Spine } from "@/ui/Board";
import { Button, buttonClass } from "@/ui/Button";
import { ConfirmSubmit, Field, FormLeaf, Notice, fieldClass } from "@/ui/Form";
import { ActForm } from "../hours/ActForm";
import { ImportReport } from "./ImportReport";
import { WearChart, type ChartSample } from "./WearChart";
import { addOil, removeOil } from "./actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Oil analysis · ${await aircraftTail(id)}` };
}

const short = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const num = (n: number | null | undefined) => (n == null ? "none" : Number.isInteger(n) ? String(n) : n.toFixed(2));

/** W-AIRCRAFT-02 Oil analysis: lab reports and wear metals, oil added and burn rate, compressions from the entries. */
export default async function OilPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sample?: string; panel?: string; done?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const [context, { data: auth }] = await Promise.all([getAircraftShellContext(supabase, id), supabase.auth.getUser()]);
  if (!context || !auth.user) notFound();
  const a = `/aircraft/${id}`;
  const self = `${a}/oil`;
  const canEdit = context.canEdit;

  const [samplesQ, additionsQ, entries, resetsQ, due] = await Promise.all([
    supabase.from("oil_analysis_sample").select("*").eq("aircraft_id", id).order("sample_date", { ascending: true }),
    supabase.from("oil_addition").select("*").eq("aircraft_id", id).order("added_date", { ascending: true }),
    loadLogEntries(supabase, id).catch(() => null),
    supabase.from("meter_reset").select("meter, reset_date").eq("aircraft_id", id),
    dueSnapshot(id, auth.user.id).catch(() => null),
  ]);
  const head = (actions?: React.ReactNode) => (
    <BoardHead title="Aircraft" subTabs={aircraftTabs(id, "oil")} actions={actions} />
  );
  if (samplesQ.error || additionsQ.error) {
    return (
      <Board section="aircraft">
        {head()}
        <Spine tail={context.reg} context="oil analysis" href={`${a}/logbooks/map`} />
        <Leaves split="1.6fr 1fr">
          <Leaf label="Oil analysis">
            <p className="mb-3 text-lede text-ink-2">Oil analysis could not be loaded.</p>
            <Button variant="quiet" href={self}>Try again</Button>
          </Leaf>
          <SourceMat />
        </Leaves>
      </Board>
    );
  }
  const samples = samplesQ.data ?? [];
  const additions = additionsQ.data ?? [];
  const burn = oilConsumption(additions, context.bridge);
  const trends = entries ? engineTrends(entries, resetsQ.data ?? []) : null;
  const books = new Map((due?.loaded.input.logbook ?? []).map((b) => [b.id, b.type]));
  const pageLabel = new Map(
    (due?.loaded.input.page ?? []).map((p) => [p.id, `${BOOK[books.get(p.logbook_id) ?? ""] ?? "Other"} p. ${p.page_sequence ?? "?"}`]),
  );
  const today = due?.snap.today ?? new Date().toISOString().slice(0, 10);
  const latest = samples[samples.length - 1] ?? null;
  const selected = samples.find((s) => s.id === sp.sample) ?? latest;
  const chart: ChartSample[] = samples.map((s) => ({
    id: s.id,
    date: s.sample_date,
    label: short(s.sample_date),
    oilHours: s.oil_hours,
    ppm: (s.elements_ppm as Record<string, number>) ?? {},
    avg: (s.universal_averages as Record<string, number> | null) ?? {},
  }));

  const actions = canEdit ? (
    <>
      <Button variant="quiet" href={`${self}?panel=oil`} className="text-on-board">Add oil</Button>
      <ImportReport aircraftId={id} />
    </>
  ) : null;

  // Right leaf: the Add oil form, else the selected sample's report.
  let right: React.ReactNode;
  if (canEdit && sp.panel === "oil") {
    right = (
      <FormLeaf title="Add oil" closeHref={self}>
        <ActForm action={addOil.bind(null, id)} className="flex flex-col gap-4">
          <Field label="Date"><input name="date" type="date" required defaultValue={today} max={today} className={fieldClass} /></Field>
          <Field label="Quarts added"><input name="quarts" type="number" step="0.25" min="0.25" required inputMode="decimal" className={fieldClass} /></Field>
          <Field label="Tach" help="The burn rate is measured on tach when it can be."><input name="tach" type="number" step="0.1" min="0" inputMode="decimal" defaultValue={context.tach ?? ""} className={fieldClass} /></Field>
          <Field label="Hobbs"><input name="hobbs" type="number" step="0.1" min="0" inputMode="decimal" defaultValue={context.hobbs ?? ""} className={fieldClass} /></Field>
          <Field label="Notes"><input name="notes" className={fieldClass} /></Field>
          <div className="flex gap-2">
            <button type="submit" className={buttonClass("primary", "m")}>Add oil</button>
            <Link href={self} replace scroll={false} className={buttonClass("quiet", "m")}>Cancel</Link>
          </div>
        </ActForm>
      </FormLeaf>
    );
  } else if (selected) {
    const props = (selected.oil_properties as Record<string, number> | null) ?? {};
    right = (
      <SourceMat
        title={`${selected.lab ?? "Lab"} report, ${fmtDate(selected.sample_date)} sample`}
        meta={`Imported ${fmtDate(selected.created_at.slice(0, 10))} · values read by AI from the report`}
      >
        {selected.source_page_id && (
          // eslint-disable-next-line @next/next/no-img-element -- signed, per-user page image
          <img src={`/api/page/${selected.source_page_id}/image`} alt={`The lab report for the ${fmtDate(selected.sample_date)} sample`} className="h-auto w-full rounded-[var(--radius-s)]" />
        )}
        <div className="rounded-[var(--radius-s)] bg-leaf-2 px-4 py-3.5 text-body text-ink">
          <p className="text-label">Lab assessment</p>
          <p className="mt-1">{selected.lab_comments?.trim() || "The report has no written assessment."}</p>
          <p className="mt-2 text-small text-ink-2">The lab&apos;s own assessment is what counts.</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-small text-on-cover-2">
          {selected.lab_number && <><dt>Lab number</dt><dd className="text-on-cover">{selected.lab_number}</dd></>}
          <dt>Hours on oil</dt><dd className="text-on-cover tabular-nums">{num(selected.oil_hours)}</dd>
          <dt>Engine hours</dt><dd className="text-on-cover tabular-nums">{num(selected.engine_hours)}</dd>
          <dt>Oil added</dt><dd className="text-on-cover tabular-nums">{selected.oil_added_quarts != null ? `${num(selected.oil_added_quarts)} qt` : "none"}</dd>
          <dt>Oil type</dt><dd className="text-on-cover">{selected.oil_type ?? "not stated"}</dd>
          {OIL_PROPERTIES.filter((p) => props[p] != null).map((p) => (
            <Fragment key={p}><dt>{PROPERTY_LABEL[p] ?? p}</dt><dd className="text-on-cover tabular-nums">{num(props[p])}</dd></Fragment>
          ))}
        </dl>
      </SourceMat>
    );
  } else {
    right = <SourceMat title="Lab reports"><p className="m-auto text-[15px] text-on-cover-2">Import a lab report to see it here.</p></SourceMat>;
  }

  const confirmedCompressions = (trends?.compression ?? []).filter((t) => t.readings.length > 0);
  const cylinders = [...new Set(confirmedCompressions.flatMap((t) => t.readings.map((r) => r.cylinder)))].sort((x, y) => x - y);
  const addRows = [...additions].reverse();

  return (
    <Board section="aircraft">
      {head(actions)}
      <Spine
        tail={context.reg}
        context="oil analysis"
        href={`${a}/logbooks/map`}
        model={due ? buildMapModel(due.loaded.input, due.loaded.today) : null}
        window={samples[0] ? { from: samples[0].sample_date, to: today } : null}
        windowDescription={samples[0] ? "the sampled years bracketed" : undefined}
      />
      <Leaves split="1.6fr 1fr">
        <Leaf label="Oil analysis">
          {sp.done === "oil" && <div className="mb-3"><Notice>Oil added.</Notice></div>}
          <h2 className="mb-1 max-w-[52ch] text-lede text-ink">{oilVerdict(samples, burn.avgHoursPerQuart, fmtDate)}</h2>
          {samples.length > 0 && <p className="mb-3 text-small text-ink-3">The lab&apos;s own assessment is what counts. The averages and marks below are a guide.</p>}

          <HungSection title="Wear metals" first>
            {samples.length === 0 ? (
              <p className="text-body text-ink-2">No oil analysis yet. Import a lab report to start the trend.</p>
            ) : (
              <WearChart samples={chart} />
            )}
          </HungSection>

          {samples.length > 0 && (
            <HungSection title="Samples" count={`${samples.length}`}>
              <table className="w-full text-small tabular-nums">
                <thead className="text-left text-ink-3">
                  <tr>
                    <th className="py-1 font-semibold">Sampled</th><th className="font-semibold">Hours on oil</th>
                    <th className="font-semibold">Iron</th><th className="font-semibold">Copper</th><th className="font-semibold">Silicon</th>
                    <th className="font-semibold">Lab says</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {[...samples].reverse().map((s) => {
                    const sel = s.id === selected?.id;
                    return (
                      <tr key={s.id} className={sel ? "bg-leaf-2" : ""} aria-current={sel ? "true" : undefined}>
                        <td className="py-1.5">
                          <Link href={`${self}?sample=${s.id}`} replace scroll={false} className="font-semibold underline decoration-dotted underline-offset-[3px]">
                            {fmtDate(s.sample_date)}
                          </Link>
                        </td>
                        <td>{num(s.oil_hours)}</td>
                        {["iron", "copper", "silicon"].map((e) => {
                          const flag = metalFlag(ppm(s, e), avgOf(s, e));
                          return (
                            <td key={e} className={flag === "twice" ? "font-bold text-alarm-text" : flag ? "font-bold" : ""}>
                              {ppm(s, e) ?? "none"}{flag === "twice" ? " (2× avg)" : flag ? " (above)" : ""}
                            </td>
                          );
                        })}
                        <td className="max-w-[24ch] truncate font-paper text-paper-small" title={s.lab_comments ?? undefined}>{s.lab_comments ?? "no comment"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </HungSection>
          )}

          {latest && (
            <HungSection title="Latest sample">
              <details>
                <summary className="cursor-pointer text-small font-semibold text-board-ink">All elements and oil properties, {fmtDate(latest.sample_date)}</summary>
                <table className="mt-2 w-full text-small tabular-nums">
                  <thead className="text-left text-ink-3"><tr><th className="py-1 font-semibold">Element</th><th className="font-semibold">ppm</th><th className="font-semibold">Average</th></tr></thead>
                  <tbody className="divide-y divide-rule">
                    {OIL_ELEMENTS.filter((e) => ppm(latest, e) != null || avgOf(latest, e) != null).map((e) => {
                      const flag = metalFlag(ppm(latest, e), avgOf(latest, e));
                      return (
                        <tr key={e}>
                          <td className="py-1">{elementLabel(e)}</td>
                          <td className={flag === "twice" ? "font-bold text-alarm-text" : flag ? "font-bold" : ""}>{num(ppm(latest, e))}{flag === "twice" ? " (2× avg)" : flag ? " (above)" : ""}</td>
                          <td className="text-ink-3">{num(avgOf(latest, e))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {latest.oil_properties && (
                  <p className="mt-2 text-small text-ink-2">
                    {OIL_PROPERTIES.filter((p) => (latest.oil_properties as Record<string, number>)[p] != null)
                      .map((p) => `${PROPERTY_LABEL[p] ?? p} ${num((latest.oil_properties as Record<string, number>)[p])}`).join(" · ")}
                  </p>
                )}
                <p className="mt-2 text-body">Lab assessment: <span className="font-paper text-paper">{latest.lab_comments?.trim() || "none written."}</span></p>
              </details>
            </HungSection>
          )}

          <HungSection title="Oil added" count={additions.length ? `last ${Math.min(3, additions.length)} of ${additions.length}` : undefined}>
            <p className="mb-2 text-body">
              {burn.avgHoursPerQuart != null
                ? <><b className="tabular-nums">{burn.avgHoursPerQuart.toFixed(1)} hrs per quart</b> · average on {burn.meter}</>
                : "Not enough top-offs yet to work out a burn rate."}
            </p>
            {burn.excluded > 0 && (
              <p className="mb-2 text-small text-ink-3">
                {burn.excluded === 1 ? "1 top-off has" : `${burn.excluded} top-offs have`} no {burn.meter ?? "tach or hobbs"} reading, so {burn.excluded === 1 ? "it isn't" : "they aren't"} in the burn rate.
              </p>
            )}
            {burn.bridged > 0 && (
              <p className="mb-2 text-small text-ink-3">
                {burn.bridged === 1 ? "1 top-off has" : `${burn.bridged} top-offs have`} no tach reading, so the tach is estimated from the hobbs.
              </p>
            )}
            {additions.length === 0 ? (
              <p className="text-body text-ink-2">No top-offs logged.</p>
            ) : (
              <>
                <AddedList rows={addRows.slice(0, 3)} id={id} canEdit={canEdit} />
                {addRows.length > 3 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-small font-semibold text-board-ink">Show all {addRows.length}</summary>
                    <AddedList rows={addRows.slice(3)} id={id} canEdit={canEdit} />
                  </details>
                )}
              </>
            )}
            {canEdit && <Link href={`${self}?panel=oil`} replace scroll={false} className={`mt-2 ${buttonClass("secondary", "s")}`}>Add oil</Link>}
          </HungSection>

          <HungSection title="Compressions" count="over 80 psi">
            {!trends ? (
              <p className="text-body text-ink-2">Compressions could not be loaded.</p>
            ) : confirmedCompressions.length === 0 ? (
              <p className="text-body text-ink-2">No compression readings found in the entries. Readings written like “#1 76/80” are picked up.</p>
            ) : (
              <>
                <table className="w-full text-small tabular-nums">
                  <thead className="text-left text-ink-3">
                    <tr>
                      <th className="py-1 font-semibold">Date</th>
                      {cylinders.map((c) => <th key={c} className="font-semibold">#{c}</th>)}
                      <th className="font-semibold">Page</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule">
                    {[...confirmedCompressions].reverse().map((t) => (
                      <tr key={t.entryId}>
                        <td className="py-1.5">{t.date ? fmtDate(t.date) : "undated"}</td>
                        {cylinders.map((c) => {
                          const r = t.readings.find((x) => x.cylinder === c);
                          return <td key={c}>{r ? r.psi : ""}</td>;
                        })}
                        <td>
                          {t.confirmed ? (
                            <Link href={`${a}/logbooks/entries/${t.entryId}`} className="text-caption text-board-ink underline decoration-dotted">
                              {t.pageId ? (pageLabel.get(t.pageId) ?? "Entry") : "Entry"}
                            </Link>
                          ) : (
                            <Link href={t.pageId ? `${a}/logbooks/review/${t.pageId}` : `${a}/logbooks/entries/${t.entryId}`} className="text-caption font-semibold text-board-ink underline decoration-dotted">
                              Confirm source
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {confirmedCompressions.filter((t) => t.confirmed && t.date).length > 1 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-small font-semibold text-board-ink">Show the trend</summary>
                    <CompressionTrend tests={confirmedCompressions.filter((t) => t.confirmed && t.date) as { date: string; readings: { cylinder: number; psi: number }[] }[]} cylinders={cylinders} />
                  </details>
                )}
              </>
            )}
            {(trends?.needsReview.length ?? 0) > 0 && (
              <p className="mt-2 text-small text-ink-2">
                {trends!.needsReview.length === 1 ? "1 entry mentions" : `${trends!.needsReview.length} entries mention`} compression without clear cylinder readings.
              </p>
            )}
          </HungSection>
        </Leaf>
        {right}
      </Leaves>
    </Board>
  );
}

function AddedList({ rows, id, canEdit }: { rows: { id: string; added_date: string | null; quarts: number; tach: number | null; hobbs: number | null }[]; id: string; canEdit: boolean }) {
  return (
    <ul className="divide-y divide-rule">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-3 py-1.5 text-body tabular-nums">
          <span className="min-w-0 flex-1">
            {r.added_date ? fmtDate(r.added_date) : "undated"} · {r.quarts} qt{r.tach != null ? ` at tach ${r.tach.toFixed(1)}` : r.hobbs != null ? ` at hobbs ${r.hobbs.toFixed(1)}` : ""}
          </span>
          {canEdit && (
            <ActForm action={removeOil.bind(null, id, r.id)}>
              <ConfirmSubmit label="Remove" question={`Remove the ${r.quarts} qt top-off${r.added_date ? ` of ${fmtDate(r.added_date)}` : ""}?`} />
            </ActForm>
          )}
        </li>
      ))}
    </ul>
  );
}

/** One line per cylinder, labelled at its end (never colour alone). */
function CompressionTrend({ tests, cylinders }: { tests: { date: string; readings: { cylinder: number; psi: number }[] }[]; cylinders: number[] }) {
  const W = 640;
  const H = 170;
  const t0 = Date.parse(tests[0].date);
  const t1 = Date.parse(tests[tests.length - 1].date);
  const x = (d: string) => 40 + ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * (W - 100);
  const y = (psi: number) => 150 - ((psi - 40) / 50) * 130;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 block h-auto w-full" role="img" aria-label="Compression by cylinder over time. The table above lists every reading.">
      {[40, 60, 80].map((v) => (
        <g key={v} aria-hidden>
          <line x1={40} x2={W - 60} y1={y(v)} y2={y(v)} stroke="var(--color-rule)" strokeDasharray={v === 60 ? undefined : "4 4"} />
          <text x={34} y={y(v) + 4} textAnchor="end" fill="var(--color-ink-3)" className="text-map-tick">{v}</text>
        </g>
      ))}
      {cylinders.map((c) => {
        const pts = tests.flatMap((t) => t.readings.filter((r) => r.cylinder === c).map((r) => ({ x: x(t.date), y: y(r.psi) })));
        const last = pts[pts.length - 1];
        return (
          <g key={c} aria-hidden>
            {pts.length > 1 && <polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="var(--color-line-engine)" strokeWidth="2" />}
            {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="var(--color-leaf)" stroke="var(--color-ink)" strokeWidth="2" />)}
            {last && <text x={last.x + 8} y={last.y + 4} fill="var(--color-ink)" className="text-map-tick">#{c}</text>}
          </g>
        );
      })}
      <text x={40} y={H - 2} fill="var(--color-ink-3)" className="text-map-tick">{fmtDate(tests[0].date)}</text>
      <text x={W - 60} y={H - 2} textAnchor="end" fill="var(--color-ink-3)" className="text-map-tick">{fmtDate(tests[tests.length - 1].date)}</text>
    </svg>
  );
}

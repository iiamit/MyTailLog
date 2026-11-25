import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAircraftShellContext } from "@/lib/aircraftContext";
import { fmtDate, type MeterName } from "@/lib/due/engine";
import { dueSnapshot } from "@/lib/due/load";
import { buildMapModel } from "@/lib/mapModel";
import { aircraftTail } from "@/lib/v2/landing";
import { aircraftTabs } from "@/lib/v2/tabs";
import { BOOK, fmtMeter, leftText, ratePhrase } from "@/lib/v2/status";
import { SOURCE_WORD, dateX, engineVerdict, storedSourceWord } from "@/lib/v2/hours";
import { engineTrends } from "@/lib/engineTrends";
import { loadLogEntries } from "@/lib/loadLogEntries";
import { computeTimeChecks, type TimeCheckInput } from "@/lib/timeCheck";
import { reconcileAdsb } from "@/lib/adsb/reconcile";
import { getLatestRecordedReading, getMeterResets } from "@/lib/aircraftHours";
import { OWNER_SOURCES } from "@/lib/writes/meters";
import { Board, BoardHead, HungSection, Leaf, Leaves, SourceMat, Spine } from "@/ui/Board";
import { Button, buttonClass } from "@/ui/Button";
import { ConfirmSubmit, Field, FormLeaf, Notice, fieldClass } from "@/ui/Form";
import { StatusMark } from "@/ui/Marks";
import { ActForm } from "./ActForm";
import { MfbSync } from "./MfbSync";
import {
  addReading, addReplacement, answerTimeCheck, dismissAdsb, removeReading, removeReplacement, saveStarting, saveUsualFlying, setAdsb,
} from "./actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Hours and engine · ${await aircraftTail(id)}` };
}

const METER_LABEL: Record<MeterName, string> = { tach: "Tach", hobbs: "Hobbs", airframe: "Airframe total" };
const DONE: Record<string, string> = {
  reading: "Reading saved.",
  replacement: "Meter replacement recorded.",
  starting: "Starting readings updated.",
  usual: "Usual flying saved.",
};
const fmt1 = (n: number | null | undefined) => (n == null ? "none" : fmtMeter(n));
const cite = "text-caption text-board-ink underline decoration-dotted underline-offset-[3px] hover:decoration-solid";

/** W-AIRCRAFT-01 Hours and engine: the meters behind every countdown and the engine's life since overhaul. */
export default async function HoursPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ panel?: string; sel?: string; done?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const [context, { data: auth }] = await Promise.all([getAircraftShellContext(supabase, id), supabase.auth.getUser()]);
  if (!context || !auth.user) notFound();
  const a = `/aircraft/${id}`;
  const self = `${a}/hours`;
  const canEdit = context.canEdit;

  const due = await dueSnapshot(id, auth.user.id).catch(() => undefined);
  const head = (actions?: React.ReactNode, spine?: React.ReactNode) => (
    <>
      <BoardHead title="Aircraft" subTabs={aircraftTabs(id, "hours")} actions={actions} />
      {spine ?? <Spine tail={context.reg} context="since overhaul" href={`${a}/logbooks/map`} />}
    </>
  );
  if (!due) {
    return (
      <Board section="aircraft">
        {head()}
        <Leaves split="1.5fr 1fr">
          <Leaf label="Hours and engine">
            <p className="mb-3 text-lede text-ink-2">The meters could not be loaded.</p>
            <Button variant="quiet" href={self}>Try again</Button>
          </Leaf>
          <SourceMat />
        </Leaves>
      </Board>
    );
  }
  const { loaded, snap } = due;
  const input = loaded.input;
  const today = snap.today;
  const ac = input.aircraft as typeof input.aircraft & { enrollment_airframe?: number | null; expected_hours_per_week?: number | null };

  const [{ data: extra }, { data: resets }, entries, stated, dismissals, mfbStatus, mfbReadings] = await Promise.all([
    supabase.from("aircraft").select("adsb_enabled, icao24, updated_at").eq("id", id).maybeSingle(),
    supabase.from("meter_reset").select("id, meter, reset_date, prior_value, new_value, notes, updated_at").eq("aircraft_id", id).order("reset_date", { ascending: false }),
    loadLogEntries(supabase, id).catch(() => []),
    supabase.from("log_entry").select("id, stated_times").eq("aircraft_id", id).not("stated_times", "is", null),
    supabase.from("time_check_dismissal").select("component, log_entry_id, written_value, calculated_value").eq("aircraft_id", id),
    supabase.rpc("my_mfb_status"),
    supabase.from("hours_reading").select("id", { count: "exact", head: true }).eq("aircraft_id", id).eq("source", "myflightbook"),
  ]);

  // Pages for cites and the mat.
  const books = new Map((input.logbook ?? []).map((b) => [b.id, b.type]));
  const pageLabel = new Map(
    (input.page ?? []).map((p) => [p.id, `${BOOK[books.get(p.logbook_id) ?? ""] ?? "Other"} p. ${p.page_sequence ?? "?"}`]),
  );
  const citeOf = (pageId: string | null) =>
    pageId && pageLabel.has(pageId) ? (
      <Link href={`${self}?sel=${pageId}`} replace scroll={false} className={cite}>
        {pageLabel.get(pageId)}
      </Link>
    ) : (
      <span className="text-caption text-ink-3">no page</span>
    );

  // Engine: the TBO item carries the last overhaul and the TBO.
  const tboRow = input.maintenance_item?.find((m) => m.kind === "engine_tbo");
  const tboItem = tboRow ? snap.items.find((i) => i.key === `mx:${tboRow.id}`) : undefined;
  const overhaul = tboItem?.lastDone?.date ? tboItem.lastDone : null;
  const tbo = tboRow?.interval_hours ?? null;
  const since = overhaul && tbo && tboItem?.hours ? Math.round((tbo - tboItem.hours.remaining) * 10) / 10 : null;
  const tboDate = tboItem?.hours?.projectedDate ?? null;
  const oilRow = input.maintenance_item?.find((m) => m.kind === "oil_change");
  const oilItem = oilRow ? snap.items.find((i) => i.key === `mx:${oilRow.id}`) : undefined;

  const trends = engineTrends(entries, (resets ?? []).map((r) => ({ meter: r.meter, reset_date: r.reset_date })));
  const oil = trends.oilChanges.filter((c) => c.confirmed && c.date).reverse();
  const spread = null;

  // Written against calculated (09 §3.10).
  const statedById = new Map((stated.data ?? []).map((r) => [r.id, r.stated_times]));
  const checks = computeTimeChecks({
    maintenance_item: input.maintenance_item ?? [],
    item_completion: (input.item_completion ?? []) as TimeCheckInput["item_completion"],
    log_entry: (input.log_entry ?? []).map((e) => ({ ...e, stated_times: (statedById.get(e.id) as TimeCheckInput["log_entry"][number]["stated_times"]) ?? null })) as TimeCheckInput["log_entry"],
    logbook: (input.logbook ?? []) as TimeCheckInput["logbook"],
    page: input.page ?? [],
    meter_reset: (resets ?? []) as TimeCheckInput["meter_reset"],
    time_check_dismissal: dismissals.data ?? [],
  });
  const openChecks = checks.filter((c) => !c.dismissed);
  const apart = openChecks.find((c) => c.result === "apart");

  // ADS-B speaks only when the recorded hours don't already account for the flying.
  let adsb = null;
  if (extra?.adsb_enabled) {
    const enrollment = { hobbs: ac.enrollment_hobbs ?? null, tach: ac.enrollment_tach ?? null, airframe: ac.enrollment_airframe ?? null, date: ac.enrollment_date ?? null };
    const [{ data: flights }, latestReading, meterResets] = await Promise.all([
      supabase.from("adsb_flight").select("first_seen, last_seen, airborne_minutes, dismissed_at").eq("aircraft_id", id),
      getLatestRecordedReading(supabase, id, enrollment),
      getMeterResets(supabase, id),
    ]);
    adsb = reconcileAdsb({ flights: flights ?? [], latestReading, resetDates: meterResets.map((r) => r.date).filter((d): d is string => !!d) });
  }
  const mfb = mfbStatus.data?.[0];
  const mfbLatest = (input.hours_reading ?? []).filter((r) => r.source === "myflightbook").sort((x, y) => ((x.reading_date ?? "") < (y.reading_date ?? "") ? 1 : -1))[0];

  const readings = [...(input.hours_reading ?? [])].sort((x, y) => ((x.reading_date ?? "") < (y.reading_date ?? "") ? 1 : -1));
  const rate = ratePhrase(snap.rate);
  const latest = { tach: snap.meters.tach.face, hobbs: snap.meters.hobbs.face };
  const usual = ac.expected_hours_per_week ?? null;

  // Right leaf: an open panel, else the selected page, else the disagreement's page, else the last oil change.
  const selPage = sp.sel && pageLabel.has(sp.sel) ? sp.sel : (apart?.pageRef?.pageId ?? oil[0]?.pageId ?? null);
  const panel = canEdit ? sp.panel : undefined;
  const close = self;
  let right: React.ReactNode;
  if (panel === "reading") {
    right = (
      <FormLeaf title="Add a reading" closeHref={close}>
        <ActForm action={addReading.bind(null, id, latest)} className="flex flex-col gap-4">
          <Field label="Date"><input name="date" type="date" required defaultValue={today} max={today} className={fieldClass} /></Field>
          {(["tach", "hobbs", "airframe"] as const).map((m) => (
            <Field key={m} label={METER_LABEL[m]} help={snap.meters[m].face != null ? `Last ${fmtMeter(snap.meters[m].face!)}${snap.meters[m].asOf ? ` on ${fmtDate(snap.meters[m].asOf!)}` : ""}` : undefined}>
              <input name={m} type="number" inputMode="decimal" step="0.1" min="0" className={fieldClass} />
            </Field>
          ))}
          <label className="flex items-center gap-2 text-small text-ink-2">
            <input type="checkbox" name="confirmLower" value="1" /> Keep it even if it is lower than the last reading
          </label>
          <div className="flex gap-2">
            <button type="submit" className={buttonClass("primary", "m")}>Save reading</button>
            <Link href={close} replace scroll={false} className={buttonClass("quiet", "m")}>Cancel</Link>
          </div>
        </ActForm>
      </FormLeaf>
    );
  } else if (panel === "replacement") {
    right = (
      <FormLeaf title="Record a replacement" closeHref={close}>
        <ActForm action={addReplacement.bind(null, id)} className="flex flex-col gap-4">
          <Field label="Meter">
            <select name="meter" defaultValue="tach" className={fieldClass}>
              <option value="tach">Tach</option>
              <option value="hobbs">Hobbs</option>
              <option value="airframe">Airframe</option>
            </select>
          </Field>
          <Field label="First date on the new meter"><input name="date" type="date" required max={today} className={fieldClass} /></Field>
          <Field label="Old meter's final reading" help="Leave blank and the highest reading on record before that date is used.">
            <input name="prior" type="number" step="0.1" min="0" inputMode="decimal" className={fieldClass} />
          </Field>
          <Field label="New meter started at"><input name="next" type="number" step="0.1" min="0" defaultValue="0" inputMode="decimal" className={fieldClass} /></Field>
          <Field label="Notes"><input name="notes" placeholder="e.g. tach replaced at annual, Airframe p. 42" className={fieldClass} /></Field>
          <div className="flex gap-2">
            <button type="submit" className={buttonClass("primary", "m")}>Record replacement</button>
            <Link href={close} replace scroll={false} className={buttonClass("quiet", "m")}>Cancel</Link>
          </div>
        </ActForm>
      </FormLeaf>
    );
  } else if (panel === "starting") {
    right = (
      <FormLeaf title="Starting readings" closeHref={close}>
        <ActForm base={extra?.updated_at} action={saveStarting.bind(null, id)} className="flex flex-col gap-4">
          {(["tach", "hobbs", "airframe"] as const).map((m) => (
            <Field key={m} label={METER_LABEL[m]}>
              <input
                name={m}
                type="number"
                step="0.1"
                min="0"
                inputMode="decimal"
                placeholder="not tracked"
                defaultValue={(m === "tach" ? ac.enrollment_tach : m === "hobbs" ? ac.enrollment_hobbs : ac.enrollment_airframe) ?? ""}
                className={fieldClass}
              />
            </Field>
          ))}
          <p className="text-small text-ink-3">Leave a box empty to stop tracking that meter.</p>
          <div className="flex gap-2">
            <button type="submit" className={buttonClass("primary", "m")}>Save starting readings</button>
            <Link href={close} replace scroll={false} className={buttonClass("quiet", "m")}>Cancel</Link>
          </div>
        </ActForm>
      </FormLeaf>
    );
  } else if (panel === "usual") {
    right = (
      <FormLeaf title="Usual flying" closeHref={close}>
        <ActForm base={extra?.updated_at} action={saveUsualFlying.bind(null, id)} className="flex flex-col gap-4">
          <Field label="Hours a week" help="Used to turn hours into dates when there aren't enough recent readings. Leave blank to clear.">
            <input name="hours" type="number" step="0.5" min="0" max="60" inputMode="decimal" defaultValue={usual ?? ""} className={fieldClass} />
          </Field>
          <div className="flex gap-2">
            <button type="submit" className={buttonClass("primary", "m")}>Save</button>
            <Link href={close} replace scroll={false} className={buttonClass("quiet", "m")}>Cancel</Link>
          </div>
        </ActForm>
      </FormLeaf>
    );
  } else if (selPage) {
    const src = `/api/page/${selPage}/image`;
    right = (
      <SourceMat title={pageLabel.get(selPage)} meta={apart?.pageRef?.pageId === selPage ? "The written time since overhaul" : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element -- signed, per-user page image; next/image would cache it across users */}
        <img src={src} alt={`Logbook page, ${pageLabel.get(selPage)}`} className="h-auto w-full rounded-[var(--radius-s)]" />
        <div>
          <a href={src} target="_blank" rel="noopener" className={buttonClass("on-mat", "s")}>Zoom</a>
        </div>
      </SourceMat>
    );
  } else {
    right = <SourceMat />;
  }

  const actions = canEdit ? <Button variant="on-board" href={`${self}?panel=reading`}>Add a reading</Button> : null;
  const spine = (
    <Spine
      tail={context.reg}
      context="since overhaul"
      href={`${a}/logbooks/map`}
      model={buildMapModel(input, today)}
      window={overhaul?.date ? { from: overhaul.date, to: today } : null}
      windowDescription={overhaul?.date ? "the time since the last overhaul bracketed" : undefined}
    />
  );

  const verdict = engineVerdict({
    sinceOverhaul: since,
    overhaulYear: overhaul?.date?.slice(0, 4) ?? null,
    tbo,
    hoursPerWeek: snap.rate.basis === "none" ? null : snap.rate.hoursPerWeek,
    tboYear: tboDate?.slice(0, 4) ?? null,
  });

  return (
    <Board section="aircraft">
      {head(actions, spine)}
      <Leaves split="1.5fr 1fr">
        <Leaf label="Hours and engine">
          {sp.done && DONE[sp.done] && <div className="mb-3"><Notice>{DONE[sp.done]}</Notice></div>}
          <h2 className="mb-3 max-w-[46ch] text-lede text-ink">{verdict}</h2>

          <EngineLine
            today={today}
            overhaul={overhaul?.date ?? null}
            since={since}
            tbo={tbo}
            tboDate={tboDate}
            oil={oil.map((c) => c.date!).filter((d) => !overhaul?.date || d >= overhaul.date)}
            spread={spread}
            nextOil={oilItem?.firstDate ? { date: oilItem.firstDate, left: leftText(oilItem) } : null}
          />

          {extra?.adsb_enabled && adsb && (
            <div className="mt-4 rounded-[var(--radius-s)] bg-leaf-2 px-4 py-3.5" id="adsb-suggestion">
              <p className="text-body">
                {adsb.since
                  ? `${adsb.meter === "hobbs" ? "Hobbs" : "Tach"} read ${fmt1(adsb.from)} on ${fmtDate(adsb.since.date)}. `
                  : "No reading on record yet. "}
                ADS-B has seen {adsb.flights === 1 ? "1 flight" : `${adsb.flights} flights`} since, about {adsb.hours.toFixed(1)} h.
              </p>
              <p className="mt-1 text-small text-ink-2">Airborne time, not tach time. Until you enter a reading, hour items may be up to {adsb.hours.toFixed(1)} h closer than shown.</p>
              {canEdit && (
                <ActForm action={dismissAdsb.bind(null, id)} className="mt-3 flex flex-wrap gap-2">
                  <Link href={`${self}?panel=reading`} className={buttonClass("primary", "s")}>Enter the real tach</Link>
                  <button type="submit" className={buttonClass("quiet", "s")}>Dismiss</button>
                </ActForm>
              )}
            </div>
          )}

          <HungSection title="Now" first>
            <dl className="divide-y divide-rule">
              {(["tach", "hobbs", "airframe"] as const).map((m) => {
                const v = snap.meters[m];
                return (
                  <div key={m} className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 py-2">
                    <dt className="w-32 text-small text-ink-2">{METER_LABEL[m]}</dt>
                    <dd className="text-body-strong tabular-nums">{v.face != null ? fmtMeter(v.face) : "none"}</dd>
                    <dd className="text-small text-ink-3">
                      {v.face == null
                        ? `no ${m} reading on record`
                        : [v.asOf ? fmtDate(v.asOf) : "undated", v.source ? SOURCE_WORD[v.source] : null].filter(Boolean).join(" · ")}
                      {v.stitched != null && v.face != null && Math.abs(v.stitched - v.face) > 0.05 && ` · ${fmtMeter(v.stitched)} counting the meter it replaced`}
                    </dd>
                  </div>
                );
              })}
            </dl>
            <p className="mt-2 text-small text-ink-3">Airframe time is never estimated from the other two.</p>
          </HungSection>

          <section id="check">
            <HungSection title="Written against calculated" count={openChecks.length ? `${openChecks.length} to look at` : undefined}>
              {checks.length === 0 ? (
                <p className="text-body text-ink-2">
                  {overhaul ? "No time since overhaul is written in the confirmed entries since the overhaul." : "Add the overhaul to compare times."}
                </p>
              ) : (
                <>
                  <table className="w-full text-small">
                    <thead className="text-left text-ink-3">
                      <tr><th className="py-1 font-semibold">Since overhaul</th><th className="font-semibold">Written</th><th className="font-semibold">Calculated</th><th className="font-semibold">Result</th></tr>
                    </thead>
                    <tbody className="divide-y divide-rule">
                      {checks.map((c) => (
                        <tr key={`${c.component}-${c.entryId}`} className={c.dismissed ? "text-ink-3" : ""}>
                          <td className="py-1.5">{c.component === "engine" ? "Engine" : "Propeller"}</td>
                          <td className="tabular-nums">{fmtMeter(c.written)} · {citeOf(c.pageRef?.pageId ?? null)}</td>
                          <td className="tabular-nums">{fmtMeter(c.calculated)}</td>
                          <td>
                            {c.result === "agree" ? (
                              <StatusMark kind="current" label="Agree" compact />
                            ) : c.dismissed ? (
                              <span>{Math.abs(c.difference).toFixed(1)} h apart, answered</span>
                            ) : (
                              <StatusMark kind="due_soon" label={`${Math.abs(c.difference).toFixed(1)} h apart`} compact />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {apart && (
                    <div className="mt-3 text-body">
                      <p>
                        The {apart.component === "engine" ? "engine" : "propeller"} time written on {apart.pageRef?.label ?? "the entry"} reads {fmtMeter(apart.written)} h; the tach since the overhaul gives {fmtMeter(apart.calculated)} h.
                        {apart.digitSwap ? " The written figure looks like two digits swapped." : ""} Mention it to your IA; only a new entry can correct the book.
                      </p>
                      {canEdit && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(["added_to_annual_prep", "agree"] as const).map((act) => (
                            <ActForm key={act} action={answerTimeCheck.bind(null, id, { component: apart.component, entryId: apart.entryId, written: apart.written, calculated: apart.calculated }, act)}>
                              <button type="submit" className={buttonClass(act === "agree" ? "quiet" : "secondary", "s")}>
                                {act === "agree" ? "They agree, dismiss" : "Add to annual prep"}
                              </button>
                            </ActForm>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </HungSection>
          </section>

          <HungSection title="Oil changes" count={oil.length ? "last three" : undefined}>
            {oil.length === 0 ? (
              <p className="text-body text-ink-2">No oil change found in the confirmed entries.</p>
            ) : (
              <>
                <table className="w-full text-small">
                  <thead className="text-left text-ink-3">
                    <tr><th className="py-1 font-semibold">Date</th><th className="font-semibold">Tach</th><th className="font-semibold">Page</th></tr>
                  </thead>
                  <tbody className="divide-y divide-rule tabular-nums">
                    {oil.slice(0, 3).map((c) => (
                      <tr key={c.entryId}>
                        <td className="py-1.5">{fmtDate(c.date!)}</td>
                        <td>{fmt1(c.tach)}</td>
                        <td>{citeOf(c.pageId)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Link href={`${a}/engine-history`} className="mt-3 block text-small font-semibold underline">Oil service intervals by engine and service period</Link>

              </>
            )}
          </HungSection>

          <section id="readings">
            <HungSection title="Readings" count={`${readings.length} on record`}>
              {readings.length === 0 ? (
                <p className="text-body text-ink-2">No readings yet. Add today&apos;s tach to start the countdowns.</p>
              ) : (
                <ReadingsTable rows={readings.slice(0, 8)} canEdit={canEdit} id={id} />
              )}
              {readings.length > 8 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-small font-semibold text-board-ink">Show all {readings.length}</summary>
                  <ReadingsTable rows={readings.slice(8)} canEdit={canEdit} id={id} />
                </details>
              )}
            </HungSection>
          </section>

          <HungSection title="Usual flying">
            <p className="text-body">
              {usual != null ? `${usual} h a week` : "Not set"}{" "}
              {canEdit && <Link href={`${self}?panel=usual`} replace scroll={false} className="text-small font-semibold text-board-ink underline decoration-dotted">Change</Link>}
            </p>
            <p className="mt-1 text-small text-ink-3">
              Used to turn hours into dates when there aren&apos;t enough recent readings.
              {rate ? ` Right now hours become dates at ${rate}.` : ""}
            </p>
          </HungSection>

          <HungSection title="MyFlightBook">
            {mfb?.connected ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-body">
                  From MyFlightBook{mfb.mfb_username ? ` as ${mfb.mfb_username}` : ""}
                  {mfbLatest?.reading_date ? ` · last reading ${fmtDate(mfbLatest.reading_date)}` : ""}, {mfbReadings.count ?? 0} flights brought in as readings.
                </p>
                {canEdit && <MfbSync />}
              </div>
            ) : (
              <p className="text-body">
                Not connected.{" "}
                <Link href="/profile" className="font-semibold text-board-ink underline decoration-dotted">Connect MyFlightBook in Settings</Link>
              </p>
            )}
          </HungSection>

          <section id="replaced">
            <HungSection title="Replaced meters">
              <p className="mb-2 text-small text-ink-2">If a tach or hobbs is ever swapped, record it here so every countdown keeps counting.</p>
              {(resets ?? []).length === 0 ? (
                <p className="text-body text-ink-2">None recorded.</p>
              ) : (
                <ul className="divide-y divide-rule">
                  {(resets ?? []).map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block text-body-strong">{r.meter[0].toUpperCase() + r.meter.slice(1)} replaced {fmtDate(r.reset_date)}</span>
                        <span className="block text-small text-ink-3 tabular-nums">
                          {r.prior_value != null ? `${fmtMeter(r.prior_value)} to ${fmtMeter(r.new_value)}` : `inferred to ${fmtMeter(r.new_value)}`}
                          {r.notes ? ` · ${r.notes}` : ""}
                        </span>
                      </span>
                      {canEdit && (
                        <ActForm action={removeReplacement.bind(null, id, r.id, r.updated_at ?? "")}>
                          <ConfirmSubmit label="Remove" question={`Remove the ${r.meter} replacement of ${fmtDate(r.reset_date)}? Countdowns stop counting across it.`} />
                        </ActForm>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {canEdit && (
                <Link href={`${self}?panel=replacement`} replace scroll={false} className={`mt-2 ${buttonClass("secondary", "s")}`}>Record a replacement</Link>
              )}
            </HungSection>
          </section>

          <section id="starting">
            <HungSection title="Starting readings">
              <p className="text-small text-ink-2">
                What each meter read when you added {context.reg}{ac.enrollment_date ? ` on ${fmtDate(ac.enrollment_date)}` : ""}. Every hours countdown starts from here, so a wrong figure shifts all of them. Clear a meter to stop tracking it.
              </p>
              <p className="mt-2 text-body tabular-nums">
                Tach {ac.enrollment_tach != null ? fmtMeter(ac.enrollment_tach) : "not tracked"} · Hobbs {ac.enrollment_hobbs != null ? fmtMeter(ac.enrollment_hobbs) : "not tracked"} · Airframe {ac.enrollment_airframe != null ? fmtMeter(ac.enrollment_airframe) : "not tracked"}
              </p>
              {canEdit && <Link href={`${self}?panel=starting`} replace scroll={false} className={`mt-2 ${buttonClass("secondary", "s")}`}>Edit</Link>}
            </HungSection>
          </section>

          <section id="adsb">
            <HungSection title="ADS-B checks">
              {extra?.adsb_enabled ? (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-body">Watching {extra.icao24?.toUpperCase() ?? "this aircraft"} via OpenSky, once a day.{!adsb ? " Your readings cover every flight seen." : ""}</p>
                  {canEdit && (
                    <ActForm base={extra?.updated_at} action={setAdsb.bind(null, id, false)}>
                      <button type="submit" className={buttonClass("quiet", "s")}>Turn off</button>
                    </ActForm>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-small text-ink-2">
                    MyTailLog asks the OpenSky Network once a day whether {context.reg} flew, sending only its public ICAO Mode S address. Nothing about you leaves the app, and no track is stored.
                  </p>
                  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-small text-ink-3">
                    <li>Airborne time is neither tach nor hobbs; it leaves out taxi and run-up.</li>
                    <li>Ground stations have coverage gaps, especially low and far from busy airspace.</li>
                    <li>Not every aircraft broadcasts, and not every flight is seen.</li>
                    <li>Nothing is written for you, and an accepted estimate never counts as compliance evidence.</li>
                  </ul>
                  {canEdit && (
                    <ActForm base={extra?.updated_at} action={setAdsb.bind(null, id, true)} className="mt-3 flex flex-wrap items-end gap-2">
                      <div className="w-52">
                        <Field label="Mode S address (optional)">
                          <input name="hex" placeholder="looked up from the registry" className={fieldClass} />
                        </Field>
                      </div>
                      <button type="submit" className={buttonClass("secondary", "m")}>Turn on ADS-B checks</button>
                    </ActForm>
                  )}
                </>
              )}
            </HungSection>
          </section>
        </Leaf>
        {right}
      </Leaves>
    </Board>
  );
}

function ReadingsTable({
  rows,
  canEdit,
  id,
}: {
  rows: { id: string; updated_at?: string; reading_date: string | null; tach: number | null; hobbs: number | null; airframe?: number | null; source: string | null }[];
  canEdit: boolean;
  id: string;
}) {
  return (
    <table className="w-full text-small">
      <thead className="text-left text-ink-3">
        <tr>
          <th className="py-1 font-semibold">Date</th><th className="font-semibold">Tach</th><th className="font-semibold">Hobbs</th>
          <th className="font-semibold">Airframe</th><th className="font-semibold">From</th><th><span className="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-rule tabular-nums">
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="py-1.5">{r.reading_date ? fmtDate(r.reading_date) : "undated"}</td>
            <td>{fmt1(r.tach)}</td>
            <td>{fmt1(r.hobbs)}</td>
            <td>{fmt1(r.airframe)}</td>
            <td>{storedSourceWord(r.source)}</td>
            <td className="text-right">
              {canEdit && OWNER_SOURCES.includes(r.source ?? "") && (
                <ActForm action={removeReading.bind(null, id, r.id, r.updated_at ?? "")}>
                  <ConfirmSubmit label="Remove" question={`Remove the reading of ${r.reading_date ? fmtDate(r.reading_date) : "this date"}? Countdowns use the next latest reading.`} />
                </ActForm>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The engine's life since overhaul on one line (W-AIRCRAFT-01 "Engine line"): solid to today, dotted to TBO. */
function EngineLine({
  today,
  overhaul,
  since,
  tbo,
  tboDate,
  oil,
  spread,
  nextOil,
}: {
  today: string;
  overhaul: string | null;
  since: number | null;
  tbo: number | null;
  tboDate: string | null;
  oil: string[];
  spread: string | null;
  nextOil: { date: string; left: string } | null;
}) {
  const W = 646;
  const x0 = 12;
  const x1 = W - 12;
  const y = 62;
  const from = overhaul ?? oil[oil.length - 1] ?? `${Number(today.slice(0, 4)) - 2}${today.slice(4)}`;
  const ends = [today, tboDate, nextOil?.date].filter((d): d is string => !!d).sort();
  const to = ends[ends.length - 1] > today ? ends[ends.length - 1] : `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;
  const X = (d: string) => dateX(d, from, to, x0, x1);
  const tx = X(today);
  const years: number[] = [];
  for (let yr = Number(from.slice(0, 4)) + 1; yr <= Number(to.slice(0, 4)); yr++) years.push(yr);
  const step = Math.max(1, Math.ceil(years.length / 8));
  const summary = [
    overhaul ? `Overhauled ${fmtDate(overhaul)}.` : "No overhaul on record.",
    since != null ? `${fmtMeter(since)} h since overhaul.` : "",
    oil.length ? `${oil.length} oil changes${spread ? `, ${spread}` : ""}.` : "",
    tbo && tboDate ? `TBO ${tbo} h, about ${tboDate.slice(0, 4)}.` : "",
    nextOil ? `Next oil change ${nextOil.left}.` : "",
  ].filter(Boolean).join(" ");
  return (
    <figure className="m-0 mt-1">
      <svg viewBox={`0 0 ${W} 120`} className="block h-auto w-full" role="img" aria-label={`The engine line. ${summary}`}>
        <line x1={x0} x2={tx} y1={y} y2={y} stroke="var(--color-line-engine)" style={{ strokeWidth: "var(--map-line-stroke)" }} strokeLinecap="round" />
        <line x1={tx} x2={x1} y1={y} y2={y} stroke="var(--color-line-engine)" style={{ strokeWidth: "var(--map-line-stroke)" }} strokeLinecap="round" strokeDasharray="0.1 11" />
        <line x1={tx} x2={tx} y1={y - 22} y2={y + 22} stroke="var(--color-ink)" strokeWidth="1.5" />
        <text x={tx} y={y + 34} textAnchor="middle" fill="var(--color-ink-3)" className="text-map-tick">today</text>
        {overhaul && (
          <g>
            <circle cx={x0} cy={y} r="7" fill="var(--color-leaf)" stroke="var(--color-ink)" strokeWidth="2.5" />
            <text x={x0} y={y - 16} fill="var(--color-ink)" className="text-map-label">Overhauled {fmtDate(overhaul)}: 0 h</text>
          </g>
        )}
        {since != null && (
          <text x={(x0 + tx) / 2} y={y + 20} textAnchor="middle" fill="var(--color-ink-2)" className="text-map-tick">{fmtMeter(since)} h since overhaul</text>
        )}
        {oil.map((d) => (
          <circle key={d} cx={X(d)} cy={y} r="4.5" fill="var(--color-leaf)" stroke="var(--color-ink)" strokeWidth="2" />
        ))}
        {oil.length > 0 && (
          <text x={X(oil[0])} y={y - 16} textAnchor="end" fill="var(--color-ink-2)" className="text-map-tick">
            {oil.length} oil changes{spread ? `, ${spread}` : ""}
          </text>
        )}
        {nextOil && (
          <g>
            <circle cx={X(nextOil.date)} cy={y} r="7" fill="var(--color-leaf)" stroke="var(--color-ink)" strokeWidth="2.5" />
            <text x={X(nextOil.date)} y={y + 20} textAnchor="middle" fill="var(--color-ink)" className="text-map-tick">Oil, {nextOil.left}</text>
          </g>
        )}
        {tbo && tboDate && (
          <g>
            <line x1={X(tboDate)} x2={X(tboDate)} y1={y - 12} y2={y + 12} stroke="var(--color-ink)" strokeWidth="2.5" />
            <text x={X(tboDate)} y={y - 18} textAnchor="end" fill="var(--color-ink)" className="text-map-label">TBO {tbo.toLocaleString("en-US")} h, about {tboDate.slice(0, 4)}</text>
          </g>
        )}
        {years.filter((_, i) => i % step === 0).map((yr) => {
          const x = X(`${yr}-01-01`);
          return (
            <text key={yr} x={x} y={114} textAnchor="middle" fill="var(--color-ink-3)" className="text-map-tick" aria-hidden>{yr}</text>
          );
        })}
      </svg>
    </figure>
  );
}

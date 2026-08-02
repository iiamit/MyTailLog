"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { ConfirmButton } from "@/components/ConfirmButton";
import { METERS, type Meter } from "@/lib/hobbsTach";
import type { AdsbSuggestion } from "@/lib/adsb/reconcile";
import {
  addMeterReset,
  deleteMeterReset,
  addMeterReading,
  deleteMeterReading,
  setAdsbEnabled,
  dismissAdsbFlights,
  acceptAdsbEstimate,
} from "./actions";

type ResetRow = {
  id: string;
  meter: string;
  reset_date: string;
  prior_value: number | null;
  new_value: number;
  notes: string | null;
};

type ReadingRow = {
  id: string;
  reading_date: string | null;
  hobbs: number | null;
  tach: number | null;
  airframe: number | null;
};

type Meters = Record<Meter, number | null>;

const LABEL: Record<Meter, string> = { tach: "Tach", hobbs: "Hobbs", airframe: "Airframe" };

const inputClass =
  "w-full rounded-md border border-line bg-panel2 px-2.5 py-1.5 text-sm text-ink outline-hidden focus:border-accent";
const primaryBtn =
  "rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-50";
const secondaryBtn =
  "rounded-md border border-line px-3 py-1.5 text-sm text-dim hover:bg-panel2 disabled:opacity-50";

const num = (s: string): number | null => {
  const n = Number(s.trim());
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
};
const show = (n: number | null) => (n != null ? n.toFixed(1) : "—");

// The honest limits, stated here and not buried in /help. Every one of these is
// a reason the number below is an ESTIMATE that prompts a real reading.
function AdsbLimits() {
  return (
    <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11.5px] leading-relaxed text-faint">
      <li>
        Airborne wall-clock is <strong>neither tach nor hobbs</strong> — it excludes taxi and runup,
        and it drifts from tach with RPM.
      </li>
      <li>Ground-station coverage has gaps, especially low and away from busy airspace.</li>
      <li>Not every GA aircraft broadcasts ADS-B Out, and not every flight is seen.</li>
      <li>
        Nothing is ever written for you, and an accepted estimate never counts as compliance
        evidence — confirm the real meter.
      </li>
    </ul>
  );
}

/**
 * ADS-B passive hours: opt-in, off by default, and never authoritative. It has
 * exactly one job — notice that the aircraft flew when the recorded hours don't
 * show it — so when MyFlightBook (or any reading you entered) already covers the
 * dates, this stays silent.
 */
function AdsbSection({
  aircraftId,
  canEdit,
  adsb,
}: {
  aircraftId: string;
  canEdit: boolean;
  adsb: { enabled: boolean; icao24: string | null; suggestion: AdsbSuggestion | null };
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [hex, setHex] = useState("");
  const s = adsb.suggestion;
  const [accept, setAccept] = useState<string | null>(null);

  async function toggle(enabled: boolean) {
    setBusy(true);
    const res = await setAdsbEnabled(aircraftId, enabled, hex || null);
    setBusy(false);
    if ("error" in res) return toast.error(res.error);
    setHex("");
    toast.success(enabled ? `Watching ${res.icao24?.toUpperCase()}.` : "ADS-B checks off.");
    router.refresh();
  }

  async function dismiss() {
    setBusy(true);
    const res = await dismissAdsbFlights(aircraftId);
    setBusy(false);
    if ("error" in res) return toast.error(res.error);
    router.refresh();
  }

  async function save() {
    if (!s?.meter) return;
    const value = num(accept ?? "");
    setBusy(true);
    const res = await acceptAdsbEstimate(aircraftId, {
      reading_date: new Date().toISOString().slice(0, 10),
      tach: s.meter === "tach" ? value : null,
      hobbs: s.meter === "hobbs" ? value : null,
    });
    setBusy(false);
    if ("error" in res) return toast.error(res.error);
    toast.success("Reading recorded.");
    setAccept(null);
    router.refresh();
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">ADS-B passive hours</h2>
        {canEdit && adsb.enabled && (
          <button onClick={() => toggle(false)} disabled={busy} className={secondaryBtn}>
            Turn off
          </button>
        )}
      </div>

      {!adsb.enabled ? (
        <div className="rounded-lg border border-line bg-panel p-4">
          <p className="max-w-2xl text-[12.5px] leading-relaxed text-dim">
            If you don&apos;t log every flight, the recorded hours drift below the real ones and
            every countdown on the status page reads optimistic. Turn this on and MyTailLog asks the{" "}
            <strong>OpenSky Network</strong> once a day whether this aircraft flew — sending only its{" "}
            <strong>ICAO 24-bit Mode S address</strong>, which is public FAA registry data. Nothing
            about you or your records leaves the app, and no track or position data is stored: just
            the start, end and duration of each flight seen.
          </p>
          <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-dim">
            It only ever speaks up when your <strong>own</strong> records don&apos;t already account
            for the flying. A MyFlightBook sync, a logbook entry or a reading you typed always wins.
          </p>
          <AdsbLimits />
          {canEdit && (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="text-xs font-medium text-dim">
                Mode S address (optional)
                <input
                  value={hex}
                  onChange={(e) => setHex(e.target.value)}
                  placeholder="looked up automatically"
                  className={`${inputClass} readout w-48`}
                />
              </label>
              <button onClick={() => toggle(true)} disabled={busy} className={primaryBtn}>
                Turn on ADS-B checks
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-line bg-panel p-4">
          <div className="readout text-[12.5px] text-dim">
            Watching <span className="text-ink">{adsb.icao24?.toUpperCase() ?? "—"}</span> via
            OpenSky, once a day.
          </div>

          {!s ? (
            <p className="mt-2 text-[12.5px] text-faint">
              Nothing unaccounted for — your recorded readings cover every flight seen.
            </p>
          ) : (
            <div className="mt-3 rounded-md border border-annun-amber/40 px-3 py-2" style={{ background: "var(--amb-bg)" }}>
              <p className="text-[13px] leading-relaxed text-annun-amber">
                ADS-B detected <strong>{s.flights} flight{s.flights === 1 ? "" : "s"} totalling ≈{s.hours.toFixed(1)} h</strong>
                {s.since ? (
                  <>
                    {" "}since your last recorded reading
                    {s.from != null && ` (${s.from.toFixed(1)} on ${s.since.date})`}
                  </>
                ) : (
                  " with no recorded reading at all"
                )}
                . Hour-based items may be <strong>≈{s.hours.toFixed(1)} h closer</strong> than shown.
              </p>
              {s.meter && s.to != null && (
                <p className="readout mt-1 text-[12.5px] text-annun-amber">
                  Suggested {s.meter}: {s.from?.toFixed(1)} → {s.to.toFixed(1)}
                </p>
              )}
              {canEdit && (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  {accept == null ? (
                    <>
                      {s.meter && s.to != null && (
                        <button
                          onClick={() => setAccept(s.to!.toFixed(1))}
                          disabled={busy}
                          className={primaryBtn}
                        >
                          Record a reading
                        </button>
                      )}
                      <button onClick={dismiss} disabled={busy} className={secondaryBtn}>
                        Dismiss
                      </button>
                    </>
                  ) : (
                    <>
                      <label className="text-xs font-medium text-dim">
                        {s.meter === "hobbs" ? "Hobbs" : "Tach"} today
                        <input
                          type="number"
                          step="0.1"
                          value={accept}
                          onChange={(e) => setAccept(e.target.value)}
                          className={`${inputClass} w-32`}
                        />
                      </label>
                      <button onClick={save} disabled={busy} className={primaryBtn}>
                        Save
                      </button>
                      <button onClick={() => setAccept(null)} disabled={busy} className={secondaryBtn}>
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              )}
              <p className="mt-2 text-[11px] leading-relaxed text-faint">
                Pre-filled from the estimate and fully editable — read the real meter and correct it.
                Saved as an <span className="readout">adsb_estimate</span>, which never counts as
                compliance evidence.
              </p>
            </div>
          )}
          <AdsbLimits />
        </div>
      )}
    </section>
  );
}

export function MetersClient({
  aircraftId,
  canEdit,
  face,
  total,
  estimated,
  resets,
  readings,
  adsb,
}: {
  aircraftId: string;
  canEdit: boolean;
  face: Meters;
  total: Meters;
  estimated: Record<Meter, boolean>;
  resets: ResetRow[];
  readings: ReadingRow[];
  adsb: { enabled: boolean; icao24: string | null; suggestion: AdsbSuggestion | null };
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [resetForm, setResetForm] = useState<{
    meter: Meter;
    reset_date: string;
    prior_value: string;
    new_value: string;
    notes: string;
  } | null>(null);
  const [readingForm, setReadingForm] = useState<{
    reading_date: string;
    hobbs: string;
    tach: string;
    airframe: string;
  } | null>(null);

  async function saveReset() {
    if (!resetForm) return;
    setBusy(true);
    const res = await addMeterReset(aircraftId, {
      meter: resetForm.meter,
      reset_date: resetForm.reset_date,
      prior_value: num(resetForm.prior_value),
      new_value: num(resetForm.new_value) ?? 0,
      notes: resetForm.notes || null,
    });
    setBusy(false);
    if ("error" in res) return toast.error(res.error);
    toast.success("Meter replacement recorded.");
    setResetForm(null);
    router.refresh();
  }

  async function removeReset(id: string) {
    setBusy(true);
    const res = await deleteMeterReset(aircraftId, id);
    setBusy(false);
    if ("error" in res) return toast.error(res.error);
    router.refresh();
  }

  async function saveReading() {
    if (!readingForm) return;
    setBusy(true);
    const res = await addMeterReading(aircraftId, {
      reading_date: readingForm.reading_date,
      hobbs: num(readingForm.hobbs),
      tach: num(readingForm.tach),
      airframe: num(readingForm.airframe),
    });
    setBusy(false);
    if ("error" in res) return toast.error(res.error);
    toast.success("Reading recorded.");
    setReadingForm(null);
    router.refresh();
  }

  async function removeReading(id: string) {
    setBusy(true);
    const res = await deleteMeterReading(aircraftId, id);
    setBusy(false);
    if ("error" in res) return toast.error(res.error);
    router.refresh();
  }

  // Once a meter has been replaced, "what it reads" and "how much time the
  // airframe/engine has" are different numbers. Show both rather than picking one.
  const stitched = (m: Meter) => resets.some((r) => r.meter === m);

  return (
    <div className="space-y-8">
      <AdsbSection aircraftId={aircraftId} canEdit={canEdit} adsb={adsb} />

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">Current readings</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {METERS.map((m) => (
            <div key={m} className="rounded-lg border border-line bg-panel p-4">
              <div className="text-[9px] uppercase tracking-[0.14em] text-faint">{LABEL[m]}</div>
              <div className="readout mt-1 text-2xl text-ink">{show(face[m])}</div>
              {stitched(m) && (
                <div className="mt-1 text-[11px] text-dim">
                  {show(total[m])} total, incl. the meter it replaced
                </div>
              )}
              {estimated[m] && (
                <div className="mt-1 text-[11px] text-annun-amber">
                  estimated — no {LABEL[m].toLowerCase()} reading on record
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-faint">
          Airframe time is never estimated from the other two: there is no fixed relationship
          between them, so it shows only what has actually been recorded.
        </p>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Replaced meters</h2>
          {canEdit && !resetForm && (
            <button
              onClick={() =>
                setResetForm({ meter: "tach", reset_date: "", prior_value: "", new_value: "0", notes: "" })
              }
              className={secondaryBtn}
            >
              Record a replacement
            </button>
          )}
        </div>
        <p className="mb-3 max-w-2xl text-[12.5px] leading-relaxed text-dim">
          A hobbs or tach that was swapped restarts near zero. Record it here and the app keeps
          counting across the change — otherwise importing older logbook pages makes time appear to
          run backwards, and every hour-based item reads wrong.
        </p>

        {resetForm && (
          <div className="mb-4 rounded-lg border border-line bg-panel p-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-medium text-dim">
                Meter
                <select
                  value={resetForm.meter}
                  onChange={(e) => setResetForm({ ...resetForm, meter: e.target.value as Meter })}
                  className={inputClass}
                >
                  {METERS.map((m) => (
                    <option key={m} value={m}>
                      {LABEL[m]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-dim">
                First date on the new meter
                <input
                  type="date"
                  value={resetForm.reset_date}
                  onChange={(e) => setResetForm({ ...resetForm, reset_date: e.target.value })}
                  className={inputClass}
                />
              </label>
              <label className="text-xs font-medium text-dim">
                Old meter&apos;s final reading
                <input
                  type="number"
                  step="0.1"
                  value={resetForm.prior_value}
                  onChange={(e) => setResetForm({ ...resetForm, prior_value: e.target.value })}
                  className={inputClass}
                />
                <span className="mt-1 block font-normal text-[10.5px] text-faint">
                  Leave blank and the highest reading on record before that date is used.
                </span>
              </label>
              <label className="text-xs font-medium text-dim">
                New meter started at
                <input
                  type="number"
                  step="0.1"
                  value={resetForm.new_value}
                  onChange={(e) => setResetForm({ ...resetForm, new_value: e.target.value })}
                  className={inputClass}
                />
              </label>
              <label className="col-span-2 text-xs font-medium text-dim">
                Notes
                <input
                  value={resetForm.notes}
                  onChange={(e) => setResetForm({ ...resetForm, notes: e.target.value })}
                  placeholder="e.g. tach replaced at annual, logbook p.42"
                  className={inputClass}
                />
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={saveReset} disabled={busy} className={primaryBtn}>
                Save
              </button>
              <button onClick={() => setResetForm(null)} disabled={busy} className={secondaryBtn}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {resets.length === 0 ? (
          <p className="text-[13px] text-faint">No meter replacements recorded.</p>
        ) : (
          <ul className="space-y-2">
            {resets.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-line bg-panel px-4 py-3"
              >
                <div>
                  <div className="text-[13.5px] text-ink">
                    {LABEL[r.meter as Meter] ?? r.meter} replaced {r.reset_date}
                  </div>
                  <div className="readout mt-0.5 text-[11.5px] text-dim">
                    {r.prior_value != null ? `${r.prior_value.toFixed(1)} → ` : "inferred → "}
                    {r.new_value.toFixed(1)}
                  </div>
                  {r.notes && <div className="mt-1 text-[11.5px] text-faint">{r.notes}</div>}
                </div>
                {canEdit && (
                  <ConfirmButton
                    onConfirm={() => removeReset(r.id)}
                    className={secondaryBtn}
                    confirmLabel="Remove?"
                  >
                    Remove
                  </ConfirmButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Readings entered by hand</h2>
          {canEdit && !readingForm && (
            <button
              onClick={() =>
                setReadingForm({
                  reading_date: new Date().toISOString().slice(0, 10),
                  hobbs: "",
                  tach: "",
                  airframe: "",
                })
              }
              className={secondaryBtn}
            >
              Add a reading
            </button>
          )}
        </div>

        {readingForm && (
          <div className="mb-4 rounded-lg border border-line bg-panel p-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 text-xs font-medium text-dim">
                Date
                <input
                  type="date"
                  value={readingForm.reading_date}
                  onChange={(e) => setReadingForm({ ...readingForm, reading_date: e.target.value })}
                  className={inputClass}
                />
              </label>
              {METERS.map((m) => (
                <label key={m} className="text-xs font-medium text-dim">
                  {LABEL[m]}
                  <input
                    type="number"
                    step="0.1"
                    value={readingForm[m]}
                    onChange={(e) => setReadingForm({ ...readingForm, [m]: e.target.value })}
                    className={inputClass}
                  />
                </label>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={saveReading} disabled={busy} className={primaryBtn}>
                Save
              </button>
              <button onClick={() => setReadingForm(null)} disabled={busy} className={secondaryBtn}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {readings.length === 0 ? (
          <p className="text-[13px] text-faint">
            Nothing entered by hand. Readings also arrive from scanned logbook pages and
            MyFlightBook syncs.
          </p>
        ) : (
          <ul className="space-y-2">
            {readings.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-line bg-panel px-4 py-3"
              >
                <div className="readout text-[12.5px] text-dim">
                  <span className="text-ink">{r.reading_date ?? "—"}</span>
                  {METERS.filter((m) => r[m] != null).map((m) => (
                    <span key={m} className="ml-3">
                      {LABEL[m].toLowerCase()} {r[m]?.toFixed(1)}
                    </span>
                  ))}
                </div>
                {canEdit && (
                  <ConfirmButton
                    onConfirm={() => removeReading(r.id)}
                    className={secondaryBtn}
                    confirmLabel="Remove?"
                  >
                    Remove
                  </ConfirmButton>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { AdKind, AdStatus } from "@/lib/database.types";
import { getADByNumber } from "@/lib/faa/federalRegister";
import { STATUS_OPTIONS, previewNextDue } from "@/lib/v2/ads";
import { buttonClass } from "@/ui/Button";
import { Field, FormLeaf, fieldClass } from "@/ui/Form";
import { lookupDrs, recordCompliance, saveAd, saveReference, type FormState } from "./actions";

export type EditorAd = {
  id: string;
  kind: AdKind;
  reference: string;
  title: string | null;
  status: AdStatus;
  recurring: boolean;
  interval_hours: number | null;
  interval_months: number | null;
  applicability: string | null;
  notes: string | null;
  reason: string | null;
  status_changed_on: string | null;
  component_id: string | null;
};

const box = "size-4 accent-[var(--color-ink)]";

/** The AD editor on the right leaf (W-MAINT-01 "AD editor"): track a new AD or SB, or edit one. */
export function AdEditor({
  aircraftId,
  ad,
  components,
  nextDue,
  closeHref,
}: {
  aircraftId: string;
  ad: EditorAd | null;
  components: { id: string; label: string }[];
  nextDue: string | null;
  closeHref: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveAd.bind(null, aircraftId, ad?.id ?? null), null);
  const [status, setStatus] = useState<AdStatus>(ad?.status ?? "open");
  const [recurring, setRecurring] = useState(ad?.recurring ?? false);
  const sideline = status === "not_applicable" || status === "superseded";

  return (
    <FormLeaf title={ad ? `Edit ${ad.kind.toUpperCase()} ${ad.reference}` : "Track an AD or SB"} closeHref={closeHref}>
      <form action={action} className="flex flex-col gap-4">
        <fieldset>
          <legend className="text-label">Kind</legend>
          <div className="mt-1 inline-flex rounded-control border border-control-border p-0.5">
            {(["ad", "sb"] as const).map((k) => (
              <label key={k} className="cursor-pointer rounded-[var(--radius-s)] px-3 py-1.5 text-small font-semibold has-checked:bg-ink has-checked:text-leaf">
                <input type="radio" name="kind" value={k} defaultChecked={(ad?.kind ?? "ad") === k} className="sr-only" />
                {k === "ad" ? "AD (mandatory)" : "SB (advisory)"}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Number">
          <input name="reference" required defaultValue={ad?.reference ?? ""} placeholder="2015-19-07" className={fieldClass} />
        </Field>
        <Field label="Title">
          <input name="title" defaultValue={ad?.title ?? ""} className={fieldClass} />
        </Field>
        <Field label="Status">
          <select name="status" value={status} onChange={(e) => setStatus(e.target.value as AdStatus)} className={fieldClass}>
            {STATUS_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-label">
          <input type="checkbox" name="recurring" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} className={box} />
          Recurring
        </label>
        {recurring && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Every (hours)">
              <input name="interval_hours" type="number" step="0.1" min="0" defaultValue={ad?.interval_hours ?? ""} className={fieldClass} />
            </Field>
            <Field label="Every (months)">
              <input name="interval_months" type="number" step="1" min="0" defaultValue={ad?.interval_months ?? ""} className={fieldClass} />
            </Field>
          </div>
        )}
        {!ad && (
          <fieldset className="flex flex-col gap-3">
            <legend className="text-label">Last complied (optional)</legend>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date">
                <input name="complied_date" type="date" className={fieldClass} />
              </Field>
              <Field label="Tach">
                <input name="complied_hours" type="number" step="0.1" min="0" inputMode="decimal" className={fieldClass} />
              </Field>
            </div>
            <Field label="Method">
              <input name="method" placeholder="e.g. Inspected per paragraph (f), no cracks" className={fieldClass} />
            </Field>
          </fieldset>
        )}
        {components.length > 0 && (
          <Field label="Related equipment" help="Removing this part marks the AD not applicable from that date.">
            <select name="component_id" defaultValue={ad?.component_id ?? ""} className={fieldClass}>
              <option value="">None</option>
              {components.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Applicability">
          <textarea name="applicability" rows={2} defaultValue={ad?.applicability ?? ""} className={`${fieldClass} h-auto py-2`} />
        </Field>
        <Field label="Notes">
          <textarea name="notes" rows={2} defaultValue={ad?.notes ?? ""} className={`${fieldClass} h-auto py-2`} />
        </Field>
        {sideline && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={status === "superseded" ? "Superseded on" : "Not applicable since"}>
              <input name="status_changed_on" type="date" defaultValue={ad?.status_changed_on ?? ""} className={fieldClass} />
            </Field>
            <Field label="Reason">
              <input name="reason" defaultValue={ad?.reason ?? ""} placeholder={status === "superseded" ? "e.g. by AD 2020-01-01" : "e.g. vacuum pump removed"} className={fieldClass} />
            </Field>
          </div>
        )}
        <p className="text-small text-ink-2">{nextDue ? `Next due: ${nextDue}` : "Next due is worked out once a compliance is recorded."}</p>
        {state?.error && <p role="alert" className="text-small font-semibold text-alarm-text">{state.error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={pending} className={buttonClass("primary", "m")}>Save</button>
          <Link href={closeHref} replace scroll={false} className={buttonClass("quiet", "m")}>Cancel</Link>
        </div>
      </form>
    </FormLeaf>
  );
}

/** Record compliance (W-MAINT-01): adds to the history and previews the next due before saving. */
export function RecordForm({
  aircraftId,
  adId,
  reference,
  today,
  tach,
  intervalHours,
  intervalMonths,
  entries,
  closeHref,
}: {
  aircraftId: string;
  adId: string;
  reference: string;
  today: string;
  tach: number | null;
  intervalHours: number | null;
  intervalMonths: number | null;
  entries: { id: string; label: string }[];
  closeHref: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(recordCompliance.bind(null, aircraftId, adId), null);
  const [date, setDate] = useState(today);
  const [hours, setHours] = useState(tach != null ? tach.toFixed(1) : "");
  const h = hours.trim() === "" ? null : Number(hours);
  const preview = previewNextDue(date, h != null && Number.isFinite(h) ? h : null, intervalHours, intervalMonths);

  return (
    <FormLeaf title={`Record compliance, ${reference}`} closeHref={closeHref}>
      <form action={action} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date complied">
            <input name="date" type="date" required max={today} value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} />
          </Field>
          <Field label="Tach">
            <input name="hours" type="number" step="0.1" min="0" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} className={fieldClass} />
          </Field>
        </div>
        <Field label="Method">
          <input name="method" placeholder="e.g. Inspected per paragraph (f), no cracks" className={fieldClass} />
        </Field>
        <Field label="Which entry records it?">
          <select name="entry" defaultValue="" className={fieldClass}>
            <option value="">The page isn&apos;t scanned yet</option>
            {entries.map((e) => (
              <option key={e.id} value={e.id}>{e.label}</option>
            ))}
          </select>
        </Field>
        <p className="rounded-[var(--radius-s)] bg-leaf-2 px-4 py-3.5 text-body" aria-live="polite">
          {preview ? `Next due ${preview}.` : "One-time: nothing comes due after this."}
        </p>
        <p className="text-small text-ink-2">Adds to the history. The earlier compliances stay.</p>
        {state?.error && <p role="alert" className="text-small font-semibold text-alarm-text">{state.error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={pending} className={buttonClass("primary", "m")}>Record compliance</button>
          <Link href={closeHref} replace scroll={false} className={buttonClass("quiet", "m")}>Cancel</Link>
        </div>
      </form>
    </FormLeaf>
  );
}

/** "Look up the FAA record": Federal Register from the browser, FAA DRS as the server-side fallback. */
export function LookupButton({ aircraftId, adId, reference }: { aircraftId: string; adId: string; reference: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [miss, setMiss] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setMiss(null);
    const fr = await getADByNumber(reference).catch(() => null);
    const res = fr ? await saveReference(aircraftId, adId, fr) : await lookupDrs(aircraftId, adId);
    setBusy(false);
    if (res.error) setMiss(res.error);
    else if ("found" in res && !res.found)
      setMiss("Couldn't find this AD in the Federal Register or FAA DRS. Check the number; very old ADs are sometimes indexed differently.");
    else router.refresh();
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" onClick={run} disabled={busy} className={buttonClass("quiet", "s")}>
        {busy ? "Looking it up…" : "Look up the FAA record"}
      </button>
      {miss && <span role="status" className="text-small text-ink-2">{miss}</span>}
    </span>
  );
}

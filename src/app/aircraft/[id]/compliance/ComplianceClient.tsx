"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdCompliance, AdKind, AdStatus, AdReference } from "@/lib/database.types";
import {
  AD_STATUS_LABEL,
  urgencyOf,
  dueText,
  URGENCY_STYLE,
  urgencyLabel,
} from "@/lib/compliance";
import {
  upsertAdRecord,
  deleteAdRecord,
  trackRef,
  enrichAdRecord,
  type AdInput,
} from "./actions";

export type UntrackedRef = { kind: AdKind; reference: string };

const STATUS_STYLE: Record<AdStatus, string> = {
  open: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  complied: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  previously_complied: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  not_applicable: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  superseded: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};
const AD_STATUSES: AdStatus[] = [
  "open",
  "complied",
  "previously_complied",
  "not_applicable",
  "superseded",
];

type FormState = {
  id?: string;
  kind: AdKind;
  reference: string;
  title: string;
  applicability: string;
  recurring: boolean;
  interval_hours: string;
  interval_months: string;
  status: AdStatus;
  method: string;
  complied_date: string;
  complied_hours: string;
  notes: string;
  reason: string;
  status_changed_on: string;
  component_id: string;
};

export type ComponentLite = {
  id: string;
  name: string;
  make: string | null;
  is_installed: boolean;
};

function blankForm(seed?: Partial<FormState>): FormState {
  return {
    kind: "ad",
    reference: "",
    title: "",
    applicability: "",
    recurring: false,
    interval_hours: "",
    interval_months: "",
    status: "open",
    method: "",
    complied_date: "",
    complied_hours: "",
    notes: "",
    reason: "",
    status_changed_on: "",
    component_id: "",
    ...seed,
  };
}

function fromRecord(r: AdCompliance): FormState {
  return {
    id: r.id,
    kind: r.kind,
    reference: r.reference,
    title: r.title ?? "",
    applicability: r.applicability ?? "",
    recurring: r.recurring,
    interval_hours: r.interval_hours?.toString() ?? "",
    interval_months: r.interval_months?.toString() ?? "",
    status: r.status,
    method: r.method ?? "",
    complied_date: r.complied_date ?? "",
    complied_hours: r.complied_hours?.toString() ?? "",
    notes: r.notes ?? "",
    reason: r.reason ?? "",
    status_changed_on: r.status_changed_on ?? "",
    component_id: r.component_id ?? "",
  };
}

function toInput(f: FormState): AdInput {
  const num = (s: string) => {
    const n = Number(s.trim());
    return s.trim() !== "" && Number.isFinite(n) ? n : null;
  };
  const int = (s: string) => {
    const n = parseInt(s.trim(), 10);
    return Number.isFinite(n) ? n : null;
  };
  const str = (s: string) => (s.trim() === "" ? null : s.trim());
  return {
    id: f.id,
    kind: f.kind,
    reference: f.reference.trim(),
    title: str(f.title),
    applicability: str(f.applicability),
    recurring: f.recurring,
    interval_hours: f.recurring ? num(f.interval_hours) : null,
    interval_months: f.recurring ? int(f.interval_months) : null,
    status: f.status,
    method: str(f.method),
    complied_date: str(f.complied_date),
    complied_hours: num(f.complied_hours),
    notes: str(f.notes),
    reason: str(f.reason),
    status_changed_on: str(f.status_changed_on),
    component_id: f.component_id || null,
  };
}

function urgencyRank(r: AdCompliance, currentHours: number | null): number {
  const u = urgencyOf(r, currentHours);
  if (u === "overdue") return 0;
  if (r.status === "open") return 1;
  if (u === "due_soon") return 2;
  if (u === "upcoming") return 3;
  return 4;
}

const inputClass =
  "w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

export function ComplianceClient({
  aircraftId,
  records,
  untracked,
  currentHours,
  adReferences,
  components,
}: {
  aircraftId: string;
  records: AdCompliance[];
  untracked: UntrackedRef[];
  currentHours: number | null;
  adReferences: Record<string, AdReference>;
  components: ComponentLite[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function enrich(id: string) {
    setEnrichingId(id);
    setError(null);
    const res = await enrichAdRecord(aircraftId, id);
    setEnrichingId(null);
    if ("error" in res) setError(res.error);
    else if (!res.found)
      setError(
        `Couldn't find AD in the Federal Register or FAA DRS. Double-check the number, or it may be a very old AD indexed differently.`,
      );
    else router.refresh();
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    setError(null);
    const res = await upsertAdRecord(aircraftId, toInput(form));
    setBusy(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setForm(null);
    router.refresh();
  }

  async function remove(id: string, reference: string) {
    if (!window.confirm(`Delete tracking for ${reference}?`)) return;
    setBusy(true);
    const res = await deleteAdRecord(aircraftId, id);
    setBusy(false);
    if ("error" in res) setError(res.error);
    else router.refresh();
  }

  async function track(u: UntrackedRef) {
    setBusy(true);
    const res = await trackRef(aircraftId, u.kind, u.reference);
    setBusy(false);
    if ("error" in res) setError(res.error);
    else router.refresh();
  }

  const sorted = [...records].sort(
    (a, b) =>
      urgencyRank(a, currentHours) - urgencyRank(b, currentHours) ||
      a.reference.localeCompare(b.reference),
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {currentHours != null ? `Current hours ≈ ${currentHours}` : "Current hours unknown"}
        </span>
        {!form && (
          <button
            onClick={() => setForm(blankForm())}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Add AD / SB
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {/* Referenced in the logs but not tracked yet */}
      {untracked.length > 0 && (
        <section className="rounded-lg border border-dashed border-slate-300 p-4 dark:border-slate-700">
          <h2 className="mb-2 text-sm font-medium">
            Referenced in your logs — not tracked yet
          </h2>
          <div className="flex flex-wrap gap-2">
            {untracked.map((u) => (
              <button
                key={`${u.kind}:${u.reference}`}
                onClick={() => track(u)}
                disabled={busy}
                className="rounded-full border border-slate-300 px-3 py-1 text-xs hover:border-slate-500 disabled:opacity-50 dark:border-slate-700"
              >
                + {u.kind.toUpperCase()} {u.reference}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Add / edit form */}
      {form && (
        <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-semibold">
            {form.id ? "Edit record" : "New record"}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Type
              <select
                value={form.kind}
                onChange={(e) => set("kind", e.target.value as AdKind)}
                className={inputClass}
              >
                <option value="ad">AD (mandatory)</option>
                <option value="sb">SB (advisory)</option>
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Number
              <input
                value={form.reference}
                onChange={(e) => set("reference", e.target.value)}
                placeholder="2015-19-07"
                className={inputClass}
              />
            </label>
            <label className="col-span-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              Title
              <input
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Status
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value as AdStatus)}
                className={inputClass}
              >
                {AD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {AD_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 pt-5 text-xs font-medium text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={form.recurring}
                onChange={(e) => set("recurring", e.target.checked)}
              />
              Recurring
            </label>
            {form.recurring && (
              <>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Interval (hours)
                  <input
                    type="number"
                    step="0.1"
                    value={form.interval_hours}
                    onChange={(e) => set("interval_hours", e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Interval (months)
                  <input
                    type="number"
                    value={form.interval_months}
                    onChange={(e) => set("interval_months", e.target.value)}
                    className={inputClass}
                  />
                </label>
              </>
            )}
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Complied date
              <input
                type="date"
                value={form.complied_date}
                onChange={(e) => set("complied_date", e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Complied hours
              <input
                type="number"
                step="0.1"
                value={form.complied_hours}
                onChange={(e) => set("complied_hours", e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="col-span-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              Method of compliance
              <input
                value={form.method}
                onChange={(e) => set("method", e.target.value)}
                className={inputClass}
              />
            </label>
            {components.length > 0 && (
              <label className="col-span-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                Related equipment
                <select
                  value={form.component_id}
                  onChange={(e) => set("component_id", e.target.value)}
                  className={inputClass}
                >
                  <option value="">— none —</option>
                  {components.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.make ? ` (${c.make})` : ""}
                      {c.is_installed ? "" : " — removed"}
                    </option>
                  ))}
                </select>
                <span className="mt-0.5 block font-normal text-slate-400 dark:text-slate-500">
                  Removing this equipment will mark the AD not applicable.
                </span>
              </label>
            )}
            <label className="col-span-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              Applicability / notes
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                className={inputClass}
              />
            </label>
            {(form.status === "not_applicable" || form.status === "superseded") && (
              <>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  {form.status === "superseded" ? "Superseded on" : "N/A since"}
                  <input
                    type="date"
                    value={form.status_changed_on}
                    onChange={(e) => set("status_changed_on", e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Reason
                  <input
                    value={form.reason}
                    onChange={(e) => set("reason", e.target.value)}
                    placeholder={
                      form.status === "superseded"
                        ? "superseded by AD …"
                        : "e.g. vacuum pump removed"
                    }
                    className={inputClass}
                  />
                </label>
              </>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={save}
              disabled={busy}
              className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => setForm(null)}
              disabled={busy}
              className="rounded-md border border-slate-300 px-4 py-1.5 text-sm hover:border-slate-500 disabled:opacity-50 dark:border-slate-700"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {/* Records */}
      {sorted.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-5 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          No AD/SB records yet. Add one, or track a number referenced in your logs.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((r) => {
            const urgency = urgencyOf(r, currentHours);
            const due = dueText(r.next_due_date, r.next_due_hours, currentHours);
            return (
              <li
                key={r.id}
                className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] font-medium text-white dark:bg-slate-700">
                    {r.kind.toUpperCase()}
                  </span>
                  <span className="font-semibold">{r.reference}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[r.status]}`}>
                    {AD_STATUS_LABEL[r.status]}
                  </span>
                  {urgency !== "none" && (
                    <span className={`rounded-full px-2 py-0.5 text-xs ${URGENCY_STYLE[urgency]}`}>
                      {urgencyLabel(urgency)}
                    </span>
                  )}
                  {r.recurring && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      recurring{" "}
                      {[
                        r.interval_hours != null ? `${r.interval_hours} hrs` : null,
                        r.interval_months != null ? `${r.interval_months} mo` : null,
                      ]
                        .filter(Boolean)
                        .join(" / ") || ""}
                    </span>
                  )}
                </div>

                {r.title && <p className="mt-1 text-sm">{r.title}</p>}

                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {(r.status === "not_applicable" || r.status === "superseded") &&
                    (r.reason || r.status_changed_on) && (
                      <div className="text-slate-600 dark:text-slate-300">
                        {r.status === "superseded" ? "Superseded" : "Not applicable"}
                        {r.status_changed_on ? ` since ${r.status_changed_on}` : ""}
                        {r.reason ? ` — ${r.reason}` : ""}
                      </div>
                    )}
                  {r.status === "complied" && r.complied_date && (
                    <span>
                      Last complied {r.complied_date}
                      {r.complied_hours != null ? ` at ${r.complied_hours} hrs` : ""}
                      {r.method ? ` · ${r.method}` : ""}
                    </span>
                  )}
                  {due && (
                    <span className={r.status === "complied" && r.complied_date ? " · " : ""}>
                      Next due: {due}
                    </span>
                  )}
                  {r.notes && <div className="mt-1">{r.notes}</div>}
                </div>

                {/* Official reference (Federal Register or DRS) */}
                {r.ad_reference_id && adReferences[r.ad_reference_id] && (() => {
                  const ref = adReferences[r.ad_reference_id];
                  const isDrs = ref.source === "drs";
                  return (
                    <div className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs dark:bg-slate-950">
                      <div className="font-medium text-slate-700 dark:text-slate-200">
                        {isDrs ? "FAA DRS" : "FAA · Federal Register"} ·{" "}
                        {ref.title ?? "official record"}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-slate-500 dark:text-slate-400">
                        {ref.effective_date && <span>effective {ref.effective_date}</span>}
                        {isDrs && ref.document_status && <span>{ref.document_status}</span>}
                        {ref.fr_html_url && (
                          <a href={ref.fr_html_url} target="_blank" rel="noreferrer" className="text-sky-600 underline dark:text-sky-400">
                            Federal Register ↗
                          </a>
                        )}
                        {ref.pdf_url && (
                          <a href={ref.pdf_url} target="_blank" rel="noreferrer" className="text-sky-600 underline dark:text-sky-400">
                            Official PDF ↗
                          </a>
                        )}
                        {ref.drs_url && (
                          <a href={ref.drs_url} target="_blank" rel="noreferrer" className="text-sky-600 underline dark:text-sky-400">
                            FAA DRS document ↗
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })()}

                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={() => setForm(fromRecord(r))}
                    className="rounded-md border border-slate-300 px-3 py-1 text-xs hover:border-slate-500 dark:border-slate-700"
                  >
                    Edit
                  </button>
                  {r.kind === "ad" && !r.ad_reference_id && (
                    <button
                      onClick={() => enrich(r.id)}
                      disabled={enrichingId === r.id}
                      className="rounded-md border border-slate-300 px-3 py-1 text-xs hover:border-slate-500 disabled:opacity-50 dark:border-slate-700"
                    >
                      {enrichingId === r.id ? "Looking up…" : "Look up FAA record"}
                    </button>
                  )}
                  <button
                    onClick={() => remove(r.id, r.reference)}
                    disabled={busy}
                    className="rounded-md border border-slate-300 px-3 py-1 text-xs text-red-600 hover:border-red-400 disabled:opacity-50 dark:border-slate-700 dark:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

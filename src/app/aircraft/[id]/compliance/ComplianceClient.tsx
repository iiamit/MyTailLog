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
  open: "border-line text-dim",
  complied: "border-annun-green/40 text-annun-green",
  previously_complied: "border-accent/40 text-accent",
  not_applicable: "border-line text-faint",
  superseded: "border-annun-amber/40 text-annun-amber",
};
const STATUS_BG: Partial<Record<AdStatus, string>> = {
  complied: "var(--grn-bg)",
  previously_complied: "var(--accent-soft)",
  superseded: "var(--amb-bg)",
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
  "w-full rounded-md border border-line bg-panel2 px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent";
const rowBtn =
  "rounded-md border border-line2 bg-panel2 px-3 py-1 text-xs text-ink hover:border-accent disabled:opacity-50";

// Left-border accent: overdue/due-soon from the due date, else a settled
// status reads as green, anything else (open/N/A/superseded) stays neutral.
function accentColor(urgency: ReturnType<typeof urgencyOf>, status: AdStatus): string {
  if (urgency === "overdue") return "var(--red)";
  if (urgency === "due_soon") return "var(--amb)";
  if (status === "complied" || status === "previously_complied") return "var(--grn)";
  return "var(--line2)";
}

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
        <span className="readout text-xs text-faint">
          {currentHours != null ? `Current hours ≈ ${currentHours}` : "Current hours unknown"}
        </span>
        {!form && (
          <button
            onClick={() => setForm(blankForm())}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90"
          >
            Add AD / SB
          </button>
        )}
      </div>

      {error && <p className="text-sm text-annun-red">{error}</p>}

      {/* Referenced in the logs but not tracked yet */}
      {untracked.length > 0 && (
        <section className="rounded-xl border border-dashed border-line p-4">
          <div className="eyebrow mb-2">Referenced in your logs — not tracked yet</div>
          <div className="flex flex-wrap gap-2">
            {untracked.map((u) => (
              <button
                key={`${u.kind}:${u.reference}`}
                onClick={() => track(u)}
                disabled={busy}
                className="rounded-full border border-line2 bg-panel2 px-3 py-1 text-xs text-ink hover:border-accent disabled:opacity-50"
              >
                + {u.kind.toUpperCase()} {u.reference}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Add / edit form */}
      {form && (
        <section className="panel p-4">
          <div className="eyebrow mb-3">{form.id ? "Edit record" : "New record"}</div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-dim">
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
            <label className="text-xs font-medium text-dim">
              Number
              <input
                value={form.reference}
                onChange={(e) => set("reference", e.target.value)}
                placeholder="2015-19-07"
                className={inputClass}
              />
            </label>
            <label className="col-span-2 text-xs font-medium text-dim">
              Title
              <input
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="text-xs font-medium text-dim">
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
            <label className="flex items-center gap-2 pt-5 text-xs font-medium text-dim">
              <input
                type="checkbox"
                checked={form.recurring}
                onChange={(e) => set("recurring", e.target.checked)}
              />
              Recurring
            </label>
            {form.recurring && (
              <>
                <label className="text-xs font-medium text-dim">
                  Interval (hours)
                  <input
                    type="number"
                    step="0.1"
                    value={form.interval_hours}
                    onChange={(e) => set("interval_hours", e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="text-xs font-medium text-dim">
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
            <label className="text-xs font-medium text-dim">
              Complied date
              <input
                type="date"
                value={form.complied_date}
                onChange={(e) => set("complied_date", e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="text-xs font-medium text-dim">
              Complied hours
              <input
                type="number"
                step="0.1"
                value={form.complied_hours}
                onChange={(e) => set("complied_hours", e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="col-span-2 text-xs font-medium text-dim">
              Method of compliance
              <input
                value={form.method}
                onChange={(e) => set("method", e.target.value)}
                className={inputClass}
              />
            </label>
            {components.length > 0 && (
              <label className="col-span-2 text-xs font-medium text-dim">
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
                <span className="mt-0.5 block font-normal text-faint">
                  Removing this equipment will mark the AD not applicable.
                </span>
              </label>
            )}
            <label className="col-span-2 text-xs font-medium text-dim">
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
                <label className="text-xs font-medium text-dim">
                  {form.status === "superseded" ? "Superseded on" : "N/A since"}
                  <input
                    type="date"
                    value={form.status_changed_on}
                    onChange={(e) => set("status_changed_on", e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="text-xs font-medium text-dim">
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
              className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => setForm(null)}
              disabled={busy}
              className="rounded-md border border-line px-4 py-1.5 text-sm text-dim hover:border-line2 hover:text-ink disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {/* Records */}
      {sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-5 py-8 text-center text-sm text-faint">
          No AD/SB records yet. Add one, or track a number referenced in your logs.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {sorted.map((r) => {
            const urgency = urgencyOf(r, currentHours);
            const due = dueText(r.next_due_date, r.next_due_hours, currentHours);
            const accent = accentColor(urgency, r.status);
            const hasStatusNote =
              (r.status === "not_applicable" || r.status === "superseded") &&
              (r.reason || r.status_changed_on);
            return (
              <li
                key={r.id}
                className="panel overflow-hidden"
                style={{ borderLeft: `3px solid ${accent}` }}
              >
                {/* Design row: kind/id/method — subject — last/next due */}
                <div className="flex flex-wrap items-center gap-4 p-4">
                  <div className="w-[150px] shrink-0">
                    <div className="mb-1 flex items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10.5px] font-medium ${
                          r.kind === "ad" ? "bg-accent-soft text-accent" : "bg-panel2 text-dim"
                        }`}
                      >
                        {r.kind.toUpperCase()}
                      </span>
                      <span className="readout text-[13px] font-semibold text-ink">{r.reference}</span>
                    </div>
                    {r.method && <div className="truncate text-[11px] text-faint">{r.method}</div>}
                  </div>
                  <div className="min-w-[160px] flex-1 text-[13px] text-ink">{r.title}</div>
                  <div className="w-[130px] shrink-0 text-right">
                    <div className="readout text-[11.5px] text-dim">
                      {r.status === "complied" && r.complied_date
                        ? `last ${r.complied_date}${r.complied_hours != null ? ` · ${r.complied_hours}h` : ""}`
                        : "—"}
                    </div>
                    <div className="readout mt-0.5 text-[11px] text-faint">
                      {due ? `next ${due}` : "no due date"}
                    </div>
                  </div>
                </div>

                {/* Status / urgency / verification badges */}
                <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_STYLE[r.status]}`}
                    style={STATUS_BG[r.status] ? { background: STATUS_BG[r.status] } : undefined}
                  >
                    {AD_STATUS_LABEL[r.status]}
                  </span>
                  {urgency !== "none" && (
                    <span className={`rounded-full px-2 py-0.5 text-xs ${URGENCY_STYLE[urgency]}`}>
                      {urgencyLabel(urgency)}
                    </span>
                  )}
                  {r.verified_report_page_id && (
                    <span
                      title={
                        r.verified_at
                          ? `Corroborated by a scanned A&P AD compliance report on ${r.verified_at.slice(0, 10)}`
                          : "Corroborated by a scanned A&P AD compliance report"
                      }
                      className="rounded-full border border-annun-green/40 px-2 py-0.5 text-xs text-annun-green"
                      style={{ background: "var(--grn-bg)" }}
                    >
                      ✓ A&amp;P report
                    </span>
                  )}
                  {r.recurring && (
                    <span className="text-xs text-faint">
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

                {(hasStatusNote || r.notes) && (
                  <div className="border-t border-line px-4 py-2.5 text-xs text-faint">
                    {hasStatusNote && (
                      <div className="text-dim">
                        {r.status === "superseded" ? "Superseded" : "Not applicable"}
                        {r.status_changed_on ? ` since ${r.status_changed_on}` : ""}
                        {r.reason ? ` — ${r.reason}` : ""}
                      </div>
                    )}
                    {r.notes && <div className={hasStatusNote ? "mt-1" : ""}>{r.notes}</div>}
                  </div>
                )}

                {/* Official reference (Federal Register or DRS) */}
                {r.ad_reference_id && adReferences[r.ad_reference_id] && (() => {
                  const ref = adReferences[r.ad_reference_id];
                  const isDrs = ref.source === "drs";
                  return (
                    <div className="border-t border-line bg-bg px-4 py-2.5 text-xs">
                      <div className="font-medium text-dim">
                        {isDrs ? "FAA DRS" : "FAA · Federal Register"} ·{" "}
                        {ref.title ?? "official record"}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-faint">
                        {ref.effective_date && <span>effective {ref.effective_date}</span>}
                        {isDrs && ref.document_status && <span>{ref.document_status}</span>}
                        {ref.fr_html_url && (
                          <a href={ref.fr_html_url} target="_blank" rel="noreferrer" className="text-accent underline hover:opacity-80">
                            Federal Register ↗
                          </a>
                        )}
                        {ref.pdf_url && (
                          <a href={ref.pdf_url} target="_blank" rel="noreferrer" className="text-accent underline hover:opacity-80">
                            Official PDF ↗
                          </a>
                        )}
                        {ref.drs_url && (
                          <a href={ref.drs_url} target="_blank" rel="noreferrer" className="text-accent underline hover:opacity-80">
                            FAA DRS document ↗
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })()}

                <div className="flex flex-wrap gap-2 border-t border-line px-4 py-2.5">
                  <button onClick={() => setForm(fromRecord(r))} className={rowBtn}>
                    Edit
                  </button>
                  {r.kind === "ad" && !r.ad_reference_id && (
                    <button onClick={() => enrich(r.id)} disabled={enrichingId === r.id} className={rowBtn}>
                      {enrichingId === r.id ? "Looking up…" : "Look up FAA record"}
                    </button>
                  )}
                  <button
                    onClick={() => remove(r.id, r.reference)}
                    disabled={busy}
                    className="rounded-md border border-line2 bg-panel2 px-3 py-1 text-xs text-annun-red hover:border-annun-red/60 disabled:opacity-50"
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

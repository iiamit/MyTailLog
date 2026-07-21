"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { ConfirmButton } from "@/components/ConfirmButton";
import type { WeightBalance } from "@/lib/database.types";
import type { EquipChange } from "@/lib/weightBalance";
import { upsertWeightBalance, deleteWeightBalance, type WBInput } from "./actions";

type FormState = {
  id?: string;
  revision_date: string;
  empty_weight: string;
  empty_weight_arm: string;
  empty_weight_moment: string;
  max_gross_weight: string;
  method: "" | "weighed" | "computed";
  reference: string;
  reason: string;
  notes: string;
};

const blank = (): FormState => ({
  revision_date: new Date().toISOString().slice(0, 10),
  empty_weight: "",
  empty_weight_arm: "",
  empty_weight_moment: "",
  max_gross_weight: "",
  method: "",
  reference: "",
  reason: "",
  notes: "",
});

function fromRow(r: WeightBalance): FormState {
  const s = (n: number | null) => (n != null ? String(n) : "");
  return {
    id: r.id,
    revision_date: r.revision_date,
    empty_weight: s(r.empty_weight),
    empty_weight_arm: s(r.empty_weight_arm),
    empty_weight_moment: s(r.empty_weight_moment),
    max_gross_weight: s(r.max_gross_weight),
    method: r.method ?? "",
    reference: r.reference ?? "",
    reason: r.reason ?? "",
    notes: r.notes ?? "",
  };
}

function toInput(f: FormState): WBInput {
  const num = (v: string) => {
    const n = Number(v.trim());
    return v.trim() !== "" && Number.isFinite(n) ? n : null;
  };
  return {
    id: f.id,
    revision_date: f.revision_date,
    empty_weight: num(f.empty_weight),
    empty_weight_arm: num(f.empty_weight_arm),
    empty_weight_moment: num(f.empty_weight_moment),
    max_gross_weight: num(f.max_gross_weight),
    method: f.method || null,
    reference: f.reference.trim() || null,
    reason: f.reason.trim() || null,
    notes: f.notes.trim() || null,
  };
}

const inputClass =
  "w-full rounded-md border border-line bg-panel2 px-2.5 py-1.5 text-sm text-ink outline-hidden focus:border-accent";

const fmt = (n: number | null, unit: string) => (n != null ? `${n} ${unit}` : "—");

export function WeightBalanceClient({
  aircraftId,
  revisions,
  current,
  currentUsefulLoad,
  stale,
  latestWBDate,
  canEdit,
}: {
  aircraftId: string;
  revisions: WeightBalance[];
  current: WeightBalance | null;
  currentUsefulLoad: number | null;
  stale: EquipChange[];
  latestWBDate: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => (f ? { ...f, [k]: v } : f));
  }

  async function save() {
    if (!form) return;
    const editing = Boolean(form.id);
    setBusy(true);
    const res = await upsertWeightBalance(aircraftId, toInput(form));
    setBusy(false);
    if ("error" in res) return toast.error(res.error);
    toast.success(editing ? "Revision updated." : "Revision added.");
    setForm(null);
    router.refresh();
  }

  async function del(r: WeightBalance) {
    setBusy(true);
    const res = await deleteWeightBalance(aircraftId, r.id);
    setBusy(false);
    if ("error" in res) return toast.error(res.error);
    toast.success("Revision deleted.");
    router.refresh();
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_300px]">
      <div className="flex flex-col gap-5">
        {/* Current W&B */}
        <section className="rounded-xl border border-line bg-linear-to-b from-panel2 to-panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-ink">Current weight &amp; balance</span>
            {current && (
              <span className="readout text-[11px] text-faint">
                as of {current.revision_date}
                {current.method ? ` · ${current.method}` : ""}
              </span>
            )}
          </div>
          {current ? (
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <dt className="eyebrow mb-1">Empty weight</dt>
                <dd className="readout text-[21px]">
                  {current.empty_weight ?? "—"}
                  {current.empty_weight != null && <span className="text-xs text-dim"> lb</span>}
                </dd>
              </div>
              <div>
                <dt className="eyebrow mb-1">CG arm</dt>
                <dd className="readout text-[21px]">
                  {current.empty_weight_arm ?? "—"}
                  {current.empty_weight_arm != null && <span className="text-xs text-dim"> in</span>}
                </dd>
              </div>
              <div>
                <dt className="eyebrow mb-1">Moment</dt>
                <dd className="readout text-[21px]">
                  {current.empty_weight_moment ?? "—"}
                  {current.empty_weight_moment != null && <span className="text-xs text-dim"> lb-in</span>}
                </dd>
              </div>
              <div>
                <dt className="eyebrow mb-1">Useful load</dt>
                <dd className="readout text-[21px]">
                  {currentUsefulLoad ?? "—"}
                  {currentUsefulLoad != null && <span className="text-xs text-dim"> lb</span>}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-faint">
              No W&amp;B revision recorded yet.
            </p>
          )}
        </section>

        {form && (
          <section className="panel p-4">
            <h2 className="mb-3 text-sm font-semibold text-ink">
              {form.id ? "Edit revision" : "New revision"}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-medium text-dim">
                Revision date
                <input type="date" value={form.revision_date} onChange={(e) => set("revision_date", e.target.value)} className={inputClass} />
              </label>
              <label className="text-xs font-medium text-dim">
                Method
                <select value={form.method} onChange={(e) => set("method", e.target.value as FormState["method"])} className={inputClass}>
                  <option value="">—</option>
                  <option value="weighed">Weighed</option>
                  <option value="computed">Computed</option>
                </select>
              </label>
              <label className="text-xs font-medium text-dim">
                Empty weight (lb)
                <input type="number" step="0.01" value={form.empty_weight} onChange={(e) => set("empty_weight", e.target.value)} className={inputClass} />
              </label>
              <label className="text-xs font-medium text-dim">
                Max gross weight (lb)
                <input type="number" step="0.01" value={form.max_gross_weight} onChange={(e) => set("max_gross_weight", e.target.value)} className={inputClass} />
              </label>
              <label className="text-xs font-medium text-dim">
                CG arm (in)
                <input type="number" step="0.001" value={form.empty_weight_arm} onChange={(e) => set("empty_weight_arm", e.target.value)} className={inputClass} />
              </label>
              <label className="text-xs font-medium text-dim">
                Moment (lb-in)
                <input type="number" step="0.01" value={form.empty_weight_moment} onChange={(e) => set("empty_weight_moment", e.target.value)} className={inputClass} />
              </label>
              <label className="col-span-2 text-xs font-medium text-dim">
                Reason for change
                <input value={form.reason} onChange={(e) => set("reason", e.target.value)} placeholder="e.g. Installed GTN 650, removed KX-155" className={inputClass} />
              </label>
              <label className="col-span-2 text-xs font-medium text-dim">
                Reference (Form 337 / doc)
                <input value={form.reference} onChange={(e) => set("reference", e.target.value)} className={inputClass} />
              </label>
              <label className="col-span-2 text-xs font-medium text-dim">
                Notes
                <textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} className={inputClass} />
              </label>
            </div>
            <p className="mt-2 text-xs text-faint">
              Enter any two of weight / arm / moment — the third is filled in
              (moment = weight × arm).
            </p>
            <div className="mt-3 flex gap-2">
              <button onClick={save} disabled={busy} className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-50">
                {busy ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setForm(null)} disabled={busy} className="rounded-md border border-line2 bg-panel2 px-4 py-1.5 text-sm text-ink hover:border-accent disabled:opacity-50">
                Cancel
              </button>
            </div>
          </section>
        )}

        {/* Revision history */}
        <section>
          <div className="eyebrow mb-2.5">Revision history</div>
          {revisions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line px-5 py-8 text-center text-sm text-dim">
              No revisions yet. Add your aircraft&apos;s current W&amp;B, then a new
              revision each time equipment changes.
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {revisions.map((r, i) => (
                <li key={r.id} className="panel p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="readout text-[14px] font-semibold text-ink">{r.revision_date}</span>
                    {i === 0 && (
                      <span
                        className="rounded-full px-2 py-0.5 text-xs text-annun-green"
                        style={{ background: "var(--grn-bg)" }}
                      >
                        current
                      </span>
                    )}
                    {r.method && (
                      <span className="rounded-full bg-panel2 px-2 py-0.5 text-xs text-faint">
                        {r.method}
                      </span>
                    )}
                  </div>
                  <div className="readout mt-1.5 text-[11.5px] text-dim">
                    {[
                      `EW ${fmt(r.empty_weight, "lb")}`,
                      `CG ${fmt(r.empty_weight_arm, "in")}`,
                      `moment ${fmt(r.empty_weight_moment, "lb-in")}`,
                    ].join(" · ")}
                  </div>
                  {r.reason && <div className="mt-1.5 text-[13px] text-ink">{r.reason}</div>}
                  {(r.reference || r.notes) && (
                    <div className="mt-0.5 text-[11px] text-faint">
                      {r.reference && <div>ref: {r.reference}</div>}
                      {r.notes && <div>{r.notes}</div>}
                    </div>
                  )}
                  {canEdit && (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <button onClick={() => setForm(fromRow(r))} className="rounded-md border border-line2 bg-panel2 px-3 py-1 text-xs text-ink hover:border-accent">
                        Edit
                      </button>
                      <ConfirmButton
                        onConfirm={() => del(r)}
                        confirmLabel="Delete"
                        disabled={busy}
                        className="rounded-md border border-line px-3 py-1 text-xs text-annun-red hover:border-annun-red/60 disabled:opacity-50"
                      >
                        Delete
                      </ConfirmButton>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Sidebar: stale flag + add revision */}
      {(stale.length > 0 || canEdit) && (
        <div className="flex flex-col gap-3.5 lg:sticky lg:top-20">
          {stale.length > 0 && (
            <section
              className="rounded-xl border border-annun-amber/40 p-4"
              style={{ background: "var(--amb-bg)" }}
            >
              <div className="mb-2 text-[13px] font-semibold text-annun-amber">
                May be out of date
              </div>
              <p className="text-[12.5px] leading-relaxed text-dim">
                {latestWBDate
                  ? `${stale.length} equipment change${stale.length === 1 ? "" : "s"} recorded after the last W&B revision (${latestWBDate}):`
                  : `No W&B revision is on file, but ${stale.length} equipment change${stale.length === 1 ? "" : "s"} ${stale.length === 1 ? "is" : "are"} recorded:`}
              </p>
              <ul className="mt-2 flex flex-col gap-1.5 text-[12.5px]">
                {stale.slice(0, 8).map((c, i) => (
                  <li key={`${c.name}-${c.date}-${i}`} className="flex items-center gap-2">
                    <span className="readout text-dim">{c.date}</span>
                    <span>— {c.kind === "install" ? "installed" : "removed"} {c.name}</span>
                  </li>
                ))}
              </ul>
              {stale.length > 8 && (
                <p className="mt-1 text-xs text-faint">…and {stale.length - 8} more.</p>
              )}
              <p className="mt-2 text-xs text-faint">
                An equipment change usually requires a recomputed weight &amp; balance.
                Confirm the current W&amp;B reflects these, and add a revision if it does.
              </p>
              <Link
                href={`/aircraft/${aircraftId}/equipment`}
                className="mt-2.5 inline-block text-[11.5px] text-accent hover:underline"
              >
                View in equipment →
              </Link>
            </section>
          )}

          {canEdit && !form && (
            <button
              onClick={() => setForm(blank())}
              className="rounded-md bg-accent px-4 py-3 text-[13.5px] font-semibold text-bg hover:opacity-90"
            >
              + Add revision
            </button>
          )}
        </div>
      )}
    </div>
  );
}

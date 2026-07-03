"use client";

import { useState } from "react";
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
  "w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

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
    <div className="flex flex-col gap-5">
      {/* Current W&B */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Current weight &amp; balance</h2>
          {current && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              as of {current.revision_date}
              {current.method ? ` · ${current.method}` : ""}
            </span>
          )}
        </div>
        {current ? (
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Empty weight</dt>
              <dd className="font-medium">{fmt(current.empty_weight, "lb")}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">CG arm</dt>
              <dd className="font-medium">{fmt(current.empty_weight_arm, "in")}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Moment</dt>
              <dd className="font-medium">{fmt(current.empty_weight_moment, "lb-in")}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Useful load</dt>
              <dd className="font-medium">{fmt(currentUsefulLoad, "lb")}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No W&amp;B revision recorded yet.
          </p>
        )}
      </section>

      {/* Stale flag */}
      {stale.length > 0 && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          <strong className="font-semibold">
            Weight &amp; balance may be out of date.
          </strong>{" "}
          {latestWBDate
            ? `${stale.length} equipment change${stale.length === 1 ? "" : "s"} recorded after the last W&B revision (${latestWBDate}):`
            : `No W&B revision is on file, but ${stale.length} equipment change${stale.length === 1 ? "" : "s"} ${stale.length === 1 ? "is" : "are"} recorded:`}
          <ul className="mt-2 list-disc pl-5">
            {stale.slice(0, 8).map((c, i) => (
              <li key={`${c.name}-${c.date}-${i}`}>
                {c.date} — {c.kind === "install" ? "installed" : "removed"} {c.name}
              </li>
            ))}
          </ul>
          {stale.length > 8 && (
            <p className="mt-1 text-xs">…and {stale.length - 8} more.</p>
          )}
          <p className="mt-2 text-xs">
            An equipment change usually requires a recomputed weight &amp; balance.
            Confirm the current W&amp;B reflects these, and add a revision if it does.
          </p>
        </section>
      )}

      {/* Add / edit */}
      {canEdit && !form && (
        <div>
          <button
            onClick={() => setForm(blank())}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Add revision
          </button>
        </div>
      )}

      {form && (
        <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-semibold">
            {form.id ? "Edit revision" : "New revision"}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Revision date
              <input type="date" value={form.revision_date} onChange={(e) => set("revision_date", e.target.value)} className={inputClass} />
            </label>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Method
              <select value={form.method} onChange={(e) => set("method", e.target.value as FormState["method"])} className={inputClass}>
                <option value="">—</option>
                <option value="weighed">Weighed</option>
                <option value="computed">Computed</option>
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Empty weight (lb)
              <input type="number" step="0.01" value={form.empty_weight} onChange={(e) => set("empty_weight", e.target.value)} className={inputClass} />
            </label>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Max gross weight (lb)
              <input type="number" step="0.01" value={form.max_gross_weight} onChange={(e) => set("max_gross_weight", e.target.value)} className={inputClass} />
            </label>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              CG arm (in)
              <input type="number" step="0.001" value={form.empty_weight_arm} onChange={(e) => set("empty_weight_arm", e.target.value)} className={inputClass} />
            </label>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Moment (lb-in)
              <input type="number" step="0.01" value={form.empty_weight_moment} onChange={(e) => set("empty_weight_moment", e.target.value)} className={inputClass} />
            </label>
            <label className="col-span-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              Reason for change
              <input value={form.reason} onChange={(e) => set("reason", e.target.value)} placeholder="e.g. Installed GTN 650, removed KX-155" className={inputClass} />
            </label>
            <label className="col-span-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              Reference (Form 337 / doc)
              <input value={form.reference} onChange={(e) => set("reference", e.target.value)} className={inputClass} />
            </label>
            <label className="col-span-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              Notes
              <textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} className={inputClass} />
            </label>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Enter any two of weight / arm / moment — the third is filled in
            (moment = weight × arm).
          </p>
          <div className="mt-3 flex gap-2">
            <button onClick={save} disabled={busy} className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900">
              {busy ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setForm(null)} disabled={busy} className="rounded-md border border-slate-300 px-4 py-1.5 text-sm hover:border-slate-500 disabled:opacity-50 dark:border-slate-700">
              Cancel
            </button>
          </div>
        </section>
      )}

      {/* Revision history */}
      <section>
        <h2 className="mb-2 text-sm font-semibold">Revision history</h2>
        {revisions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 px-5 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            No revisions yet. Add your aircraft&apos;s current W&amp;B, then a new
            revision each time equipment changes.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {revisions.map((r, i) => (
              <li key={r.id} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{r.revision_date}</span>
                  {i === 0 && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                      current
                    </span>
                  )}
                  {r.method && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      {r.method}
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {[
                    `EW ${fmt(r.empty_weight, "lb")}`,
                    `CG ${fmt(r.empty_weight_arm, "in")}`,
                    `moment ${fmt(r.empty_weight_moment, "lb-in")}`,
                  ].join(" · ")}
                  {r.reason && <div className="mt-1 text-slate-600 dark:text-slate-300">{r.reason}</div>}
                  {r.reference && <div className="mt-0.5">ref: {r.reference}</div>}
                  {r.notes && <div className="mt-0.5">{r.notes}</div>}
                </div>
                {canEdit && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button onClick={() => setForm(fromRow(r))} className="rounded-md border border-slate-300 px-3 py-1 text-xs hover:border-slate-500 dark:border-slate-700">
                      Edit
                    </button>
                    <ConfirmButton
                      onConfirm={() => del(r)}
                      confirmLabel="Delete"
                      disabled={busy}
                      className="rounded-md border border-slate-300 px-3 py-1 text-xs text-red-600 hover:border-red-400 disabled:opacity-50 dark:border-slate-700 dark:text-red-400"
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
  );
}

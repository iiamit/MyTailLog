"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { ConfirmButton } from "@/components/ConfirmButton";
import type { MaintenanceItem } from "@/lib/database.types";
import { dueText, URGENCY_STYLE, urgencyLabel } from "@/lib/compliance";
import type { StatusItem } from "@/lib/status";
import { STANDARD_ITEMS } from "@/lib/maintenance";
import {
  upsertMaintenanceItem,
  deleteMaintenanceItem,
  markMaintenanceDone,
  seedStandardItems,
  type MaintenanceInput,
} from "./actions";

// The forecast list and the Status grid share one shape (src/lib/status.ts).
export type DueItem = StatusItem;

type FormState = {
  id?: string;
  kind: string;
  label: string;
  regulatory: boolean;
  interval_months: string;
  interval_hours: string;
  last_done_date: string;
  last_done_hours: string;
  notes: string;
};

const blank = (): FormState => ({
  kind: "other", label: "", regulatory: true,
  interval_months: "", interval_hours: "", last_done_date: "", last_done_hours: "", notes: "",
});

function fromItem(m: MaintenanceItem): FormState {
  return {
    id: m.id,
    kind: m.kind,
    label: m.label,
    regulatory: m.regulatory,
    interval_months: m.interval_months?.toString() ?? "",
    interval_hours: m.interval_hours?.toString() ?? "",
    last_done_date: m.last_done_date ?? "",
    last_done_hours: m.last_done_hours?.toString() ?? "",
    notes: m.notes ?? "",
  };
}

function toInput(f: FormState): MaintenanceInput {
  const num = (s: string) => {
    const n = Number(s.trim());
    return s.trim() !== "" && Number.isFinite(n) ? n : null;
  };
  const int = (s: string) => {
    const n = parseInt(s.trim(), 10);
    return Number.isFinite(n) ? n : null;
  };
  return {
    id: f.id,
    kind: f.kind,
    label: f.label.trim(),
    regulatory: f.regulatory,
    interval_months: int(f.interval_months),
    interval_hours: num(f.interval_hours),
    last_done_date: f.last_done_date || null,
    last_done_hours: num(f.last_done_hours),
    notes: f.notes.trim() || null,
  };
}

const inputClass =
  "w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

export function MaintenanceClient({
  aircraftId,
  items,
  dueItems,
  currentHours,
  extractionConfigured,
}: {
  aircraftId: string;
  items: MaintenanceItem[];
  dueItems: DueItem[];
  currentHours: number | null;
  extractionConfigured: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  // Inline "mark done" form, keyed by item id (replaces window.prompt).
  const [markId, setMarkId] = useState<string | null>(null);
  const [markDate, setMarkDate] = useState("");
  const [markHours, setMarkHours] = useState("");

  async function scanLogs() {
    setScanning(true);
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/maintenance/scan`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) toast.error(data.error ?? "Scan failed.");
      else {
        toast.success(
          data.updated > 0
            ? `Updated ${data.updated} item${data.updated === 1 ? "" : "s"} from ${data.entryCount} entries.`
            : data.detected > 0
              ? `Found ${data.detected} completion${data.detected === 1 ? "" : "s"} but items were already current.`
              : `Scanned ${data.entryCount} entries — no recurring-maintenance completions detected.`,
        );
        router.refresh();
      }
    } catch {
      toast.error("Network error during scan.");
    } finally {
      setScanning(false);
    }
  }

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => (f ? { ...f, [k]: v } : f));
  }

  // When picking a standard kind in the form, prefill its label/interval.
  function pickKind(kind: string) {
    const std = STANDARD_ITEMS.find((s) => s.kind === kind);
    setForm((f) =>
      f
        ? {
            ...f,
            kind,
            label: std && !f.label ? std.label : f.label,
            regulatory: std ? std.regulatory : f.regulatory,
            interval_months: std?.interval_months?.toString() ?? f.interval_months,
            interval_hours: std?.interval_hours?.toString() ?? f.interval_hours,
          }
        : f,
    );
  }

  async function save() {
    if (!form) return;
    const editing = Boolean(form.id);
    setBusy(true);
    const res = await upsertMaintenanceItem(aircraftId, toInput(form));
    setBusy(false);
    if ("error" in res) return toast.error(res.error);
    toast.success(editing ? "Item updated." : "Item added.");
    setForm(null);
    router.refresh();
  }

  async function seed() {
    setBusy(true);
    const res = await seedStandardItems(aircraftId);
    setBusy(false);
    if ("error" in res) return toast.error(res.error);
    toast.success("Added standard Part 91 items.");
    router.refresh();
  }

  function openMark(m: MaintenanceItem) {
    setMarkId(m.id);
    setMarkDate(new Date().toISOString().slice(0, 10));
    setMarkHours(m.interval_hours != null ? currentHours?.toString() ?? "" : "");
  }

  async function saveMark(m: MaintenanceItem) {
    const hours =
      markHours.trim() !== "" && Number.isFinite(Number(markHours)) ? Number(markHours) : null;
    setBusy(true);
    const res = await markMaintenanceDone(aircraftId, m.id, markDate || null, hours);
    setBusy(false);
    if ("error" in res) return toast.error(res.error);
    toast.success(`Marked "${m.label}" done.`);
    setMarkId(null);
    router.refresh();
  }

  async function del(m: MaintenanceItem) {
    setBusy(true);
    const res = await deleteMaintenanceItem(aircraftId, m.id);
    setBusy(false);
    if ("error" in res) return toast.error(res.error);
    toast.success(`Deleted "${m.label}".`);
    router.refresh();
  }

  const itemById = new Map(items.map((m) => [m.id, m]));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {currentHours != null ? `Current hours ≈ ${currentHours}` : "Current hours unknown"}
        </span>
        <div className="flex flex-wrap gap-2">
          {extractionConfigured && (
            <button
              onClick={scanLogs}
              disabled={scanning || busy}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:border-slate-500 disabled:opacity-50 dark:border-slate-700"
            >
              {scanning ? "Updating from logs…" : "Update from logs"}
            </button>
          )}
          {items.length === 0 && (
            <button
              onClick={seed}
              disabled={busy}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:border-slate-500 disabled:opacity-50 dark:border-slate-700"
            >
              Add standard Part 91 items
            </button>
          )}
          {!form && (
            <button
              onClick={() => setForm(blank())}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              Add item
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Last-done dates update automatically as pages are extracted; use “Update
        from logs” to rescan the full history. Verify against the physical logs.
      </p>

      {form && (
        <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 text-sm font-semibold">{form.id ? "Edit item" : "New item"}</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Type
              <select value={form.kind} onChange={(e) => pickKind(e.target.value)} className={inputClass}>
                <option value="other">Custom</option>
                {STANDARD_ITEMS.map((s) => (
                  <option key={s.kind} value={s.kind}>{s.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Label
              <input value={form.label} onChange={(e) => set("label", e.target.value)} className={inputClass} />
            </label>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Interval (months)
              <input type="number" value={form.interval_months} onChange={(e) => set("interval_months", e.target.value)} className={inputClass} />
            </label>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Interval (hours)
              <input type="number" step="0.1" value={form.interval_hours} onChange={(e) => set("interval_hours", e.target.value)} className={inputClass} />
            </label>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Last done date
              <input type="date" value={form.last_done_date} onChange={(e) => set("last_done_date", e.target.value)} className={inputClass} />
            </label>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Last done hours
              <input type="number" step="0.1" value={form.last_done_hours} onChange={(e) => set("last_done_hours", e.target.value)} className={inputClass} />
            </label>
            <label className="col-span-2 flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={form.regulatory} onChange={(e) => set("regulatory", e.target.checked)} />
              Regulatory (mandatory under Part 91) — uncheck for advisory items like TBO
            </label>
            <label className="col-span-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              Notes
              <textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} className={inputClass} />
            </label>
          </div>
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

      {dueItems.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-5 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          No maintenance items yet. Seed the standard Part 91 items or add your own.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {dueItems.map((d) => {
            const m = d.source === "maintenance" ? itemById.get(d.id) : null;
            return (
              <li
                key={`${d.source}-${d.id}`}
                className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{d.label}</span>
                  {d.urgency !== "none" && (
                    <span className={`rounded-full px-2 py-0.5 text-xs ${URGENCY_STYLE[d.urgency]}`}>
                      {urgencyLabel(d.urgency)}
                    </span>
                  )}
                  {!d.regulatory && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      advisory
                    </span>
                  )}
                  {d.source === "ad" && (
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                      AD
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {dueText(d.nextDueDate, d.nextDueHours, currentHours) ?? "no due date set"}
                  {(d.intervalMonths || d.intervalHours) && (
                    <span>
                      {" · every "}
                      {[
                        d.intervalHours != null ? `${d.intervalHours} hrs` : null,
                        d.intervalMonths != null ? `${d.intervalMonths} mo` : null,
                      ].filter(Boolean).join(" / ")}
                    </span>
                  )}
                  {d.lastDoneDate && <span>{` · last ${d.lastDoneDate}`}</span>}
                  {d.notes && <div className="mt-1">{d.notes}</div>}
                </div>

                {m && markId === m.id ? (
                  <div className="mt-3 flex flex-wrap items-end gap-2 rounded-md border border-slate-200 p-3 dark:border-slate-800">
                    <label className="flex w-40 flex-col gap-1 text-xs">
                      Date done
                      <input
                        type="date"
                        value={markDate}
                        onChange={(e) => setMarkDate(e.target.value)}
                        className={inputClass}
                      />
                    </label>
                    {m.interval_hours != null && (
                      <label className="flex w-40 flex-col gap-1 text-xs">
                        Hours (optional)
                        <input
                          type="number"
                          step="0.1"
                          value={markHours}
                          onChange={(e) => setMarkHours(e.target.value)}
                          className={inputClass}
                        />
                      </label>
                    )}
                    <button
                      onClick={() => saveMark(m)}
                      disabled={busy}
                      className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
                    >
                      {busy ? "Saving…" : "Save"}
                    </button>
                    <button
                      onClick={() => setMarkId(null)}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:border-slate-500 dark:border-slate-700"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m ? (
                      <>
                        <button onClick={() => openMark(m)} disabled={busy} className="rounded-md border border-slate-300 px-3 py-1 text-xs hover:border-emerald-400 disabled:opacity-50 dark:border-slate-700">
                          Mark done
                        </button>
                        <button onClick={() => setForm(fromItem(m))} className="rounded-md border border-slate-300 px-3 py-1 text-xs hover:border-slate-500 dark:border-slate-700">
                          Edit
                        </button>
                        <ConfirmButton
                          onConfirm={() => del(m)}
                          confirmLabel="Delete"
                          disabled={busy}
                          className="rounded-md border border-slate-300 px-3 py-1 text-xs text-red-600 hover:border-red-400 disabled:opacity-50 dark:border-slate-700 dark:text-red-400"
                        >
                          Delete
                        </ConfirmButton>
                      </>
                    ) : (
                      <Link href={`/aircraft/${aircraftId}/compliance`} className="rounded-md border border-slate-300 px-3 py-1 text-xs hover:border-slate-500 dark:border-slate-700">
                        Manage in compliance →
                      </Link>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

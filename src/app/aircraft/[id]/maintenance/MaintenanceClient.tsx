"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { ConfirmButton } from "@/components/ConfirmButton";
import { MfbSyncButton } from "@/components/MfbSyncButton";
import type { MaintenanceItem } from "@/lib/database.types";
import { dueText } from "@/lib/compliance";
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
  "w-full rounded-md border border-line bg-panel2 px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent";

const secondaryBtn =
  "rounded-md border border-line2 bg-panel2 px-4 py-2 text-sm font-medium text-ink hover:border-accent disabled:opacity-50";
const rowBtn =
  "rounded-md border border-line2 bg-panel2 px-2.5 py-1 text-xs text-ink hover:border-accent disabled:opacity-50";

const FORECAST_COLS = "grid-cols-[1.6fr_1.1fr_0.8fr_0.9fr_0.8fr_auto]";

// Dot + "remaining" text carry the urgency color; red/amber/green/faint.
const URGENCY_COLOR: Record<DueItem["urgency"], string> = {
  overdue: "var(--red)",
  due_soon: "var(--amb)",
  upcoming: "var(--grn)",
  none: "var(--faint)",
};

export function MaintenanceClient({
  aircraftId,
  items,
  dueItems,
  currentTach,
  currentHobbs,
  currentTachEstimated = false,
  currentTachRough = false,
  currentHobbsEstimated = false,
  mfbReading,
  extractionConfigured,
}: {
  aircraftId: string;
  items: MaintenanceItem[];
  dueItems: DueItem[];
  currentTach: number | null;
  currentHobbs: number | null;
  currentTachEstimated?: boolean;
  currentTachRough?: boolean;
  currentHobbsEstimated?: boolean;
  mfbReading: { date: string | null; hobbs: number | null; tach: number | null } | null;
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
    // Pre-fill with the current reading on THIS item's meter — regulatory items
    // (100-hr, annual) on tach, usage items (oil) on hobbs — so last-done stays
    // consistent with the meter its countdown uses.
    const cur = m.regulatory ? currentTach : currentHobbs;
    setMarkHours(m.interval_hours != null ? cur?.toString() ?? "" : "");
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="readout text-xs text-faint">
            {currentTach == null && currentHobbs == null ? (
              "Current hours unknown"
            ) : (
              <>
                <span
                  title={
                    currentTachEstimated
                      ? currentTachRough
                        ? "Rough estimate — no tach recorded; derived from hobbs at the default ratio"
                        : "Estimated from the latest hobbs via this aircraft's hobbs↔tach ratio; actual tach may differ slightly"
                      : "Tach drives regulatory items (100-hr, annual)"
                  }
                >
                  Current tach ≈ {currentTach ?? "—"}
                  {currentTach != null && currentTachEstimated ? (currentTachRough ? " (rough est.)" : " (est.)") : ""}
                </span>
                <span className="text-faint">{"  ·  "}</span>
                <span title="Hobbs drives usage items (oil change)">
                  hobbs {currentHobbs ?? "—"}
                  {currentHobbs != null && currentHobbsEstimated ? " (est.)" : ""}
                </span>
              </>
            )}
          </span>
          {mfbReading && (
            <span className="text-[11px] text-faint">
              {[
                mfbReading.hobbs != null ? `hobbs ${mfbReading.hobbs}` : null,
                mfbReading.tach != null ? `tach ${mfbReading.tach}` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "reading"}
              {mfbReading.date ? ` as of ${mfbReading.date}` : ""} · from MyFlightBook
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <MfbSyncButton className={secondaryBtn} label="Sync hours" />
          {extractionConfigured && (
            <button onClick={scanLogs} disabled={scanning || busy} className={secondaryBtn}>
              {scanning ? "Updating from logs…" : "Update from logs"}
            </button>
          )}
          {items.length === 0 && (
            <button onClick={seed} disabled={busy} className={secondaryBtn}>
              Add standard Part 91 items
            </button>
          )}
          {!form && (
            <button
              onClick={() => setForm(blank())}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90"
            >
              Add item
            </button>
          )}
        </div>
      </div>

      <p className="text-[11.5px] text-faint">
        Last-done dates update automatically as pages are extracted; use “Update
        from logs” to rescan the full history. Verify against the physical logs.
      </p>

      {form && (
        <section className="panel p-4">
          <div className="eyebrow mb-3">{form.id ? "Edit item" : "New item"}</div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-dim">
              Type
              <select value={form.kind} onChange={(e) => pickKind(e.target.value)} className={inputClass}>
                <option value="other">Custom</option>
                {STANDARD_ITEMS.map((s) => (
                  <option key={s.kind} value={s.kind}>{s.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-dim">
              Label
              <input value={form.label} onChange={(e) => set("label", e.target.value)} className={inputClass} />
            </label>
            <label className="text-xs font-medium text-dim">
              Interval (months)
              <input type="number" value={form.interval_months} onChange={(e) => set("interval_months", e.target.value)} className={inputClass} />
            </label>
            <label className="text-xs font-medium text-dim">
              Interval (hours)
              <input type="number" step="0.1" value={form.interval_hours} onChange={(e) => set("interval_hours", e.target.value)} className={inputClass} />
            </label>
            <label className="text-xs font-medium text-dim">
              Last done date
              <input type="date" value={form.last_done_date} onChange={(e) => set("last_done_date", e.target.value)} className={inputClass} />
            </label>
            <label className="text-xs font-medium text-dim">
              Last done hours
              <input type="number" step="0.1" value={form.last_done_hours} onChange={(e) => set("last_done_hours", e.target.value)} className={inputClass} />
            </label>
            <label className="col-span-2 flex items-center gap-2 text-xs font-medium text-dim">
              <input type="checkbox" checked={form.regulatory} onChange={(e) => set("regulatory", e.target.checked)} />
              Regulatory (mandatory under Part 91) — uncheck for advisory items like TBO
            </label>
            <label className="col-span-2 text-xs font-medium text-dim">
              Notes
              <textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} className={inputClass} />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={save} disabled={busy} className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-50">
              {busy ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setForm(null)} disabled={busy} className="rounded-md border border-line px-4 py-1.5 text-sm text-dim hover:border-line2 hover:text-ink disabled:opacity-50">
              Cancel
            </button>
          </div>
        </section>
      )}

      {dueItems.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-5 py-8 text-center text-sm text-faint">
          No maintenance items yet. Seed the standard Part 91 items or add your own.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-panel">
          <div className={`grid ${FORECAST_COLS} gap-3 border-b border-line px-[18px] py-3`}>
            <span className="eyebrow">Item</span>
            <span className="eyebrow">Interval</span>
            <span className="eyebrow">Last</span>
            <span className="eyebrow">Next due</span>
            <span className="eyebrow">Remaining</span>
            <span className="eyebrow text-right">Actions</span>
          </div>
          {dueItems.map((d) => {
            const m = d.source === "maintenance" ? itemById.get(d.id) : null;
            const color = URGENCY_COLOR[d.urgency];
            let remaining: string;
            if (d.hoursUnreliable) {
              const dateOnly = dueText(d.nextDueDate, null, null);
              remaining = dateOnly ? `${dateOnly} · check last-done` : "check last-done reading";
            } else {
              remaining = dueText(d.nextDueDate, d.nextDueForItem, d.currentForItem) ?? "";
              if (d.currentEstimated && d.nextDueForItem != null && d.currentForItem != null) remaining += " est.";
            }
            const marking = m && markId === m.id;
            return (
              <div key={`${d.source}-${d.id}`} className="border-b border-line last:border-b-0">
                <div className={`grid ${FORECAST_COLS} items-center gap-3 px-[18px] py-3`}>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: color, boxShadow: `0 0 7px ${color}` }}
                    />
                    <span className="truncate text-[13.5px] font-semibold text-ink">{d.label}</span>
                    {!d.regulatory && (
                      <span className="rounded-full bg-panel2 px-2 py-0.5 text-[10px] text-faint">
                        advisory
                      </span>
                    )}
                    {d.source === "ad" && (
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] text-accent">
                        AD
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-dim">
                    {[
                      d.intervalHours != null ? `${d.intervalHours} hrs` : null,
                      d.intervalMonths != null ? `${d.intervalMonths} mo` : null,
                    ]
                      .filter(Boolean)
                      .join(" / ") || "—"}
                  </span>
                  <span className="readout text-[11.5px] text-faint">{d.lastDoneDate ?? "—"}</span>
                  <span className="readout text-[11.5px] text-dim">
                    {d.nextDueDate ?? (d.nextDueForItem != null ? `${d.nextDueForItem} ${d.meter}` : "—")}
                  </span>
                  <span className="readout text-[11.5px]" style={{ color }}>
                    {remaining ?? "—"}
                  </span>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {m ? (
                      <>
                        <button onClick={() => openMark(m)} disabled={busy} className={`${rowBtn} hover:border-annun-green/60`}>
                          Done
                        </button>
                        <button onClick={() => setForm(fromItem(m))} className={rowBtn}>
                          Edit
                        </button>
                        <ConfirmButton
                          onConfirm={() => del(m)}
                          confirmLabel="Delete"
                          disabled={busy}
                          className="rounded-md border border-line2 bg-panel2 px-2.5 py-1 text-xs text-annun-red hover:border-annun-red/60 disabled:opacity-50"
                        >
                          Delete
                        </ConfirmButton>
                      </>
                    ) : (
                      <Link href={`/aircraft/${aircraftId}/compliance`} className={rowBtn}>
                        Compliance →
                      </Link>
                    )}
                  </div>
                </div>

                {(d.notes || marking) && (
                  <div className="px-[18px] pb-3">
                    {d.notes && <p className="text-xs text-faint">{d.notes}</p>}
                    {marking && m && (
                      <div className="mt-2 flex flex-wrap items-end gap-2 rounded-md border border-line bg-panel2 p-3">
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
                          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-bg hover:opacity-90 disabled:opacity-50"
                        >
                          {busy ? "Saving…" : "Save"}
                        </button>
                        <button
                          onClick={() => setMarkId(null)}
                          className="rounded-md border border-line2 bg-panel2 px-3 py-1.5 text-xs text-ink hover:border-accent"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { ConfirmButton } from "@/components/ConfirmButton";
import type { OilAddition } from "@/lib/database.types";
import { oilConsumption, type TachBridge } from "@/lib/oilConsumption";
import { addOilTopOff, deleteOilTopOff } from "./actions";

const inputClass =
  "w-full rounded-md border border-line bg-panel2 px-2.5 py-1.5 text-sm text-ink outline-hidden focus:border-accent";

const today = () => new Date().toISOString().slice(0, 10);
const num = (v: string): number | null => {
  const n = Number(v.trim());
  return v.trim() !== "" && Number.isFinite(n) ? n : null;
};

export function OilConsumptionClient({
  aircraftId,
  canEdit,
  additions,
  bridge,
  currentTach,
  currentHobbs,
}: {
  aircraftId: string;
  canEdit: boolean;
  additions: OilAddition[];
  bridge: TachBridge | null;
  currentTach: number | null;
  currentHobbs: number | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    added_date: today(),
    quarts: "",
    tach: currentTach?.toString() ?? "",
    hobbs: currentHobbs?.toString() ?? "",
    notes: "",
  });

  const { avgHoursPerQuart, meter, excluded, bridged } = oilConsumption(additions, bridge);
  // newest first for the list
  const rows = [...additions].sort((a, b) => (b.added_date ?? "").localeCompare(a.added_date ?? ""));

  async function save() {
    setBusy(true);
    const res = await addOilTopOff(aircraftId, {
      added_date: form.added_date,
      quarts: Number(form.quarts),
      tach: num(form.tach),
      hobbs: num(form.hobbs),
      notes: form.notes.trim() || null,
    });
    setBusy(false);
    if ("error" in res) return toast.error(res.error);
    toast.success("Top-off logged.");
    setForm({ added_date: today(), quarts: "", tach: currentTach?.toString() ?? "", hobbs: currentHobbs?.toString() ?? "", notes: "" });
    setOpen(false);
    router.refresh();
  }

  async function remove(id: string) {
    const res = await deleteOilTopOff(aircraftId, id);
    if ("error" in res) return toast.error(res.error);
    toast.success("Top-off removed.");
    router.refresh();
  }

  return (
    <section className="mt-8 flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Oil consumption</h2>
          <p className="text-[13px] text-dim">
            Log each top-off with the tach/hobbs to track the burn rate over time.
          </p>
          {bridged > 0 && (
            <p className="mt-1 text-[13px] text-dim">
              {bridged} top-off{bridged === 1 ? " has" : "s have"} no tach reading, so the tach is
              estimated from the hobbs using this aircraft&apos;s measured ratio
              ({bridge ? bridge.ratio.toFixed(2) : "—"} tach/hobbs). Log a tach next time and the
              real number replaces it.
            </p>
          )}
          {excluded > 0 && (
            <p className="mt-1 text-[13px] text-annun-amber">
              {excluded} top-off{excluded === 1 ? " has" : "s have"} no {meter ?? "tach or hobbs"}{" "}
              reading, so {excluded === 1 ? "it isn't" : "they aren't"} in the burn rate. The whole
              trend is measured on one meter — mixing them would compare different scales.
            </p>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="readout text-[21px] leading-none">
              {avgHoursPerQuart != null ? `${avgHoursPerQuart.toFixed(1)}` : "—"}
              {avgHoursPerQuart != null && <span className="text-xs text-dim"> hrs/qt</span>}
            </div>
            {/* Name the meter: hobbs over-reads engine time, so the same
                aircraft looks healthier measured on hobbs than on tach. */}
            <div className="eyebrow mt-1">
              avg burn rate{meter ? ` · on ${meter}` : ""}
            </div>
          </div>
          {canEdit && (
            <button
              onClick={() => setOpen((o) => !o)}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90"
            >
              {open ? "Cancel" : "+ Top off oil"}
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="panel grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
          <label className="text-xs font-medium text-dim">
            Date
            <input type="date" value={form.added_date} onChange={(e) => setForm({ ...form, added_date: e.target.value })} className={inputClass} />
          </label>
          <label className="text-xs font-medium text-dim">
            Quarts added
            <input type="number" step="0.1" min="0" value={form.quarts} onChange={(e) => setForm({ ...form, quarts: e.target.value })} className={inputClass} placeholder="1.5" />
          </label>
          <label className="text-xs font-medium text-dim">
            Tach
            <input type="number" step="0.1" value={form.tach} onChange={(e) => setForm({ ...form, tach: e.target.value })} className={inputClass} />
          </label>
          <label className="text-xs font-medium text-dim">
            Hobbs
            <input type="number" step="0.1" value={form.hobbs} onChange={(e) => setForm({ ...form, hobbs: e.target.value })} className={inputClass} />
          </label>
          <label className="col-span-2 text-xs font-medium text-dim sm:col-span-4">
            Notes
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputClass} />
          </label>
          <div className="col-span-2 sm:col-span-4">
            <button onClick={save} disabled={busy} className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-50">
              {busy ? "Saving…" : "Log top-off"}
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-5 py-8 text-center text-sm text-dim">
          No top-offs logged yet.{canEdit ? " Log one after your next quart to start the trend." : ""}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
              <div className="readout text-ink">
                {r.added_date} · <span className="font-semibold">{r.quarts} qt</span>
                <span className="ml-2 text-faint">
                  {[r.tach != null ? `tach ${r.tach}` : null, r.hobbs != null ? `hobbs ${r.hobbs}` : null].filter(Boolean).join(" · ")}
                </span>
                {r.notes ? <span className="ml-2 text-dim">— {r.notes}</span> : null}
              </div>
              {canEdit && (
                <ConfirmButton
                  onConfirm={() => remove(r.id)}
                  confirmLabel="Delete"
                  className="rounded-md border border-line px-3 py-1 text-xs text-dim hover:border-annun-red hover:text-annun-red"
                >
                  Delete
                </ConfirmButton>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

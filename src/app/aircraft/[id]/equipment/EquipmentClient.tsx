"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Component, EquipmentProposal } from "@/lib/database.types";
import {
  upsertComponent,
  deleteComponent,
  removeComponent,
  reinstallComponent,
  confirmProposals,
  dismissProposals,
  type ComponentInput,
} from "./actions";

const CATEGORIES = ["airframe", "engine", "prop", "avionics", "other"] as const;
const LIFE_UNITS = ["hours", "months", "cycles"] as const;

type FormState = {
  id?: string;
  name: string;
  make: string;
  category: string;
  part_number: string;
  serial_number: string;
  install_date: string;
  life_limit_value: string;
  life_limit_unit: string;
  notes: string;
};

function blankForm(): FormState {
  return {
    name: "", make: "", category: "", part_number: "", serial_number: "",
    install_date: "", life_limit_value: "", life_limit_unit: "", notes: "",
  };
}

function fromComponent(c: Component): FormState {
  return {
    id: c.id,
    name: c.name,
    make: c.make ?? "",
    category: c.category ?? "",
    part_number: c.part_number ?? "",
    serial_number: c.serial_number ?? "",
    install_date: c.install_date ?? "",
    life_limit_value: c.life_limit_value?.toString() ?? "",
    life_limit_unit: c.life_limit_unit ?? "",
    notes: c.notes ?? "",
  };
}

function toInput(f: FormState): ComponentInput {
  const str = (s: string) => (s.trim() === "" ? null : s.trim());
  const num = (s: string) => {
    const n = Number(s.trim());
    return s.trim() !== "" && Number.isFinite(n) ? n : null;
  };
  return {
    id: f.id,
    name: f.name.trim(),
    make: str(f.make),
    category: str(f.category),
    part_number: str(f.part_number),
    serial_number: str(f.serial_number),
    install_date: str(f.install_date),
    life_limit_value: num(f.life_limit_value),
    life_limit_unit: (f.life_limit_unit || null) as ComponentInput["life_limit_unit"],
    notes: str(f.notes),
  };
}

const inputClass =
  "w-full rounded-md border border-line bg-panel2 px-2.5 py-1.5 text-sm text-ink outline-hidden focus:border-accent";

export function EquipmentClient({
  aircraftId,
  components,
  adCountByComponent,
  proposals,
  extractionConfigured,
}: {
  aircraftId: string;
  components: Component[];
  adCountByComponent: Record<string, number>;
  proposals: EquipmentProposal[];
  extractionConfigured: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // Pending proposals come from the DB (page extraction + full log scans).
  const [scanning, setScanning] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(proposals.map((p) => p.id)),
  );

  async function scanLogs() {
    setScanning(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/equipment/scan`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Scan failed.");
      else {
        setStatus(
          data.proposed > 0
            ? `Found ${data.proposed} new suggestion${data.proposed === 1 ? "" : "s"} from ${data.entryCount} entries.`
            : `Scanned ${data.entryCount} entries — no new equipment suggestions.`,
        );
        router.refresh();
      }
    } catch {
      setError("Network error during scan.");
    } finally {
      setScanning(false);
    }
  }

  function toggleChecked(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirmSelected() {
    const ids = proposals.filter((p) => checked.has(p.id)).map((p) => p.id);
    if (ids.length === 0) return;
    setBusy(true);
    setError(null);
    const res = await confirmProposals(aircraftId, ids);
    setBusy(false);
    if ("error" in res) return setError(res.error);
    setStatus(`Imported ${res.added} new, updated ${res.updated} from the logs.`);
    router.refresh();
  }

  async function dismissSelected() {
    const ids = proposals.filter((p) => checked.has(p.id)).map((p) => p.id);
    if (ids.length === 0) return;
    setBusy(true);
    const res = await dismissProposals(aircraftId, ids);
    setBusy(false);
    if ("error" in res) return setError(res.error);
    router.refresh();
  }

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => (f ? { ...f, [k]: v } : f));
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    setError(null);
    const res = await upsertComponent(aircraftId, toInput(form));
    setBusy(false);
    if ("error" in res) return setError(res.error);
    setForm(null);
    router.refresh();
  }

  async function remove(c: Component) {
    const adCount = adCountByComponent[c.id] ?? 0;
    const date = window.prompt(
      `Removal date for "${c.name}" (YYYY-MM-DD)?` +
        (adCount > 0
          ? `\n\nThis will mark ${adCount} linked AD${adCount === 1 ? "" : "s"} as no longer applicable as of that date.`
          : ""),
      new Date().toISOString().slice(0, 10),
    );
    if (date === null) return;
    setBusy(true);
    setError(null);
    const res = await removeComponent(aircraftId, c.id, date.trim() || null);
    setBusy(false);
    if ("error" in res) return setError(res.error);
    setStatus(
      res.adsUpdated > 0
        ? `Removed. ${res.adsUpdated} AD${res.adsUpdated === 1 ? "" : "s"} marked not applicable.`
        : "Removed.",
    );
    router.refresh();
  }

  async function reinstall(c: Component) {
    setBusy(true);
    const res = await reinstallComponent(aircraftId, c.id);
    setBusy(false);
    if ("error" in res) return setError(res.error);
    router.refresh();
  }

  async function del(c: Component) {
    if (!window.confirm(`Delete "${c.name}" from equipment? This can't be undone.`)) return;
    setBusy(true);
    const res = await deleteComponent(aircraftId, c.id);
    setBusy(false);
    if ("error" in res) return setError(res.error);
    router.refresh();
  }

  const installed = components.filter((c) => c.is_installed);
  const removed = components.filter((c) => !c.is_installed);

  const Row = ({ c }: { c: Component }) => {
    const adCount = adCountByComponent[c.id] ?? 0;
    const dotColor = c.category ? `var(--book-${c.category})` : "var(--faint)";
    const meta = [
      c.part_number ? `P/N ${c.part_number}` : null,
      c.serial_number ? `S/N ${c.serial_number}` : null,
      !c.is_installed && c.removal_date ? `removed ${c.removal_date}` : null,
      c.life_limit_value != null
        ? `life ${c.life_limit_value} ${c.life_limit_unit ?? ""}`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <li className="grid grid-cols-[1.4fr_1fr_0.8fr_auto] items-center gap-3 border-b border-line px-[18px] py-3.5 last:border-b-0">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: dotColor }}
          />
          <span className="truncate text-[13.5px] font-semibold text-ink">{c.name}</span>
          {adCount > 0 && (
            <span className="shrink-0 rounded-full border border-accent/40 bg-accent-soft px-2 py-0.5 text-[10px] text-accent">
              {adCount} AD{adCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <span className="truncate text-[12.5px] text-dim">{c.make || "—"}</span>
        <span className="readout text-[12px] text-dim">
          {c.install_date ?? "—"}
        </span>
        <div className="flex flex-wrap justify-end gap-1.5">
          <button
            onClick={() => setForm(fromComponent(c))}
            className="rounded-md border border-line2 bg-panel2 px-3 py-1 text-xs text-ink hover:border-accent"
          >
            Edit
          </button>
          {c.is_installed ? (
            <button
              onClick={() => remove(c)}
              disabled={busy}
              className="rounded-md border border-line px-3 py-1 text-xs text-dim hover:border-annun-amber/60 disabled:opacity-50"
            >
              Mark removed
            </button>
          ) : (
            <button
              onClick={() => reinstall(c)}
              disabled={busy}
              className="rounded-md border border-line px-3 py-1 text-xs text-dim hover:border-annun-green/60 disabled:opacity-50"
            >
              Reinstall
            </button>
          )}
          <button
            onClick={() => del(c)}
            disabled={busy}
            className="rounded-md border border-line px-3 py-1 text-xs text-annun-red hover:border-annun-red/60 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
        {(meta || c.category || c.notes) && (
          <div className="col-span-4 mt-1.5 text-[11.5px] text-faint">
            {c.category && <span className="mr-2">{c.category}</span>}
            {meta}
            {c.notes && <div className="mt-1">{c.notes}</div>}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="eyebrow">
          {installed.length} installed · {removed.length} removed
        </span>
        <div className="flex gap-2">
          {extractionConfigured && (
            <button
              onClick={scanLogs}
              disabled={scanning || busy}
              className="rounded-md border border-line2 bg-panel2 px-4 py-2 text-sm font-medium text-ink hover:border-accent disabled:opacity-50"
            >
              {scanning ? "Scanning logs…" : "Scan logs for equipment"}
            </button>
          )}
          {!form && (
            <button
              onClick={() => setForm(blankForm())}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90"
            >
              Add manually
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-faint">
        The equipment list is built primarily from your logbooks. Scan the logs
        to propose what was installed and removed over time, then confirm.
      </p>

      {error && <p className="text-sm text-annun-red">{error}</p>}
      {status && <p className="text-sm text-annun-green">{status}</p>}

      {/* Pending log-derived proposals for confirmation */}
      {proposals.length > 0 && (
        <section
          className="rounded-xl border border-accent/40 p-4"
          style={{ background: "var(--accent-soft)" }}
        >
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">
              {proposals.length} equipment suggestion{proposals.length === 1 ? "" : "s"} from your logs
            </h2>
            <div className="flex gap-2 text-xs text-accent">
              <button onClick={() => setChecked(new Set(proposals.map((p) => p.id)))} className="underline">all</button>
              <button onClick={() => setChecked(new Set())} className="underline">none</button>
            </div>
          </div>
          <ul className="flex flex-col gap-2">
            {proposals.map((p) => (
              <li
                key={p.id}
                className="panel flex gap-3 p-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={checked.has(p.id)}
                  onChange={() => toggleChecked(p.id)}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{p.name}</span>
                    {p.make && <span className="text-xs text-faint">{p.make}</span>}
                    {p.category && (
                      <span className="rounded-full bg-panel2 px-2 py-0.5 text-xs text-dim">
                        {p.category}
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        p.is_installed ? "text-annun-green" : "bg-panel2 text-faint"
                      }`}
                      style={p.is_installed ? { background: "var(--grn-bg)" } : undefined}
                    >
                      {p.is_installed ? "installed" : "removed"}
                    </span>
                    {p.confidence != null && (
                      <span className="text-xs text-faint">{Math.round(p.confidence * 100)}%</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-faint">
                    {[
                      p.part_number ? `P/N ${p.part_number}` : null,
                      p.serial_number ? `S/N ${p.serial_number}` : null,
                      p.install_date ? `installed ${p.install_date}` : null,
                      p.removal_date ? `removed ${p.removal_date}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    {p.source && <div className="mt-0.5 italic">“{p.source}”</div>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <button
              onClick={confirmSelected}
              disabled={busy || checked.size === 0}
              className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Importing…" : `Import ${checked.size} selected`}
            </button>
            <button
              onClick={dismissSelected}
              disabled={busy || checked.size === 0}
              className="rounded-md border border-line2 bg-panel2 px-4 py-1.5 text-sm text-ink hover:border-accent disabled:opacity-50"
            >
              Dismiss selected
            </button>
          </div>
        </section>
      )}

      {form && (
        <section className="panel p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink">{form.id ? "Edit equipment" : "New equipment"}</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 text-xs font-medium text-dim">
              Name
              <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Vacuum pump" className={inputClass} />
            </label>
            <label className="text-xs font-medium text-dim">
              Manufacturer
              <input value={form.make} onChange={(e) => set("make", e.target.value)} placeholder="Garmin, Dukes…" className={inputClass} />
            </label>
            <label className="text-xs font-medium text-dim">
              Category
              <select value={form.category} onChange={(e) => set("category", e.target.value)} className={inputClass}>
                <option value="">—</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-dim">
              Part number
              <input value={form.part_number} onChange={(e) => set("part_number", e.target.value)} className={inputClass} />
            </label>
            <label className="text-xs font-medium text-dim">
              Serial number
              <input value={form.serial_number} onChange={(e) => set("serial_number", e.target.value)} className={inputClass} />
            </label>
            <label className="text-xs font-medium text-dim">
              Install date
              <input type="date" value={form.install_date} onChange={(e) => set("install_date", e.target.value)} className={inputClass} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-medium text-dim">
                Life limit
                <input type="number" step="0.1" value={form.life_limit_value} onChange={(e) => set("life_limit_value", e.target.value)} className={inputClass} />
              </label>
              <label className="text-xs font-medium text-dim">
                Unit
                <select value={form.life_limit_unit} onChange={(e) => set("life_limit_unit", e.target.value)} className={inputClass}>
                  <option value="">—</option>
                  {LIFE_UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="col-span-2 text-xs font-medium text-dim">
              Notes
              <textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} className={inputClass} />
            </label>
          </div>
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

      {components.length === 0 && !form ? (
        <p className="rounded-lg border border-dashed border-line px-5 py-8 text-center text-sm text-faint">
          No equipment tracked yet. Add installed components to drive AD applicability.
        </p>
      ) : (
        <>
          {installed.length > 0 && (
            <section>
              <div className="eyebrow mb-2">Installed</div>
              <ul className="overflow-hidden rounded-xl border border-line bg-panel">
                <li className="grid grid-cols-[1.4fr_1fr_0.8fr_auto] gap-3 border-b border-line px-[18px] py-3">
                  <span className="eyebrow">Component</span>
                  <span className="eyebrow">Make / model</span>
                  <span className="eyebrow">Installed</span>
                  <span className="eyebrow text-right">Actions</span>
                </li>
                {installed.map((c) => (
                  <Row key={c.id} c={c} />
                ))}
              </ul>
            </section>
          )}
          {removed.length > 0 && (
            <section>
              <div className="eyebrow mb-2">Removed</div>
              <ul className="overflow-hidden rounded-xl border border-line bg-panel opacity-75">
                {removed.map((c) => (
                  <Row key={c.id} c={c} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

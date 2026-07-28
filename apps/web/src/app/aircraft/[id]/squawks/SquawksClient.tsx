"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { ConfirmButton } from "@/components/ConfirmButton";
import type { SquawkSeverity, SquawkStatus } from "@/lib/database.types";
import { addSquawk, resolveSquawk, reopenSquawk, deleteSquawk } from "./actions";

type Squawk = {
  id: string;
  description: string;
  severity: SquawkSeverity;
  status: SquawkStatus;
  reporter_name: string | null;
  reported_at: string;
  resolved_at: string | null;
  resolution_notes: string | null;
};

const inputClass =
  "w-full rounded-md border border-line bg-panel2 px-3 py-2 text-sm text-ink outline-hidden focus:border-accent";

const SEVERITY: Record<SquawkSeverity, { label: string; cls: string; bg?: string }> = {
  low: { label: "Low", cls: "text-faint border-line" },
  medium: { label: "Medium", cls: "text-annun-amber border-annun-amber/40", bg: "var(--amb-bg)" },
  high: { label: "High", cls: "text-annun-red border-annun-red/40", bg: "var(--red-bg)" },
};

function Chip({ s }: { s: SquawkSeverity }) {
  const v = SEVERITY[s];
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${v.cls}`} style={v.bg ? { background: v.bg } : undefined}>
      {v.label}
    </span>
  );
}

const fmtDate = (iso: string) => iso.slice(0, 10);

export function SquawksClient({
  aircraftId,
  canEdit,
  squawks,
}: {
  aircraftId: string;
  canEdit: boolean;
  squawks: Squawk[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<SquawkSeverity>("low");

  const open = squawks.filter((s) => s.status === "open");
  const resolved = squawks.filter((s) => s.status === "resolved");

  async function report(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await addSquawk(aircraftId, { description, severity });
    setBusy(false);
    if ("error" in res) return toast.error(res.error);
    toast.success("Squawk reported.");
    setDescription("");
    setSeverity("low");
    router.refresh();
  }

  async function act(fn: () => Promise<{ ok: true } | { error: string }>, msg: string) {
    const res = await fn();
    if ("error" in res) return toast.error(res.error);
    toast.success(msg);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Report — available to anyone with access (pilots included). */}
      <form onSubmit={report} className="flex flex-col gap-3 rounded-lg border border-line p-5">
        <h2 className="font-semibold">Report a squawk</h2>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className={inputClass}
          placeholder="e.g. #2 radio intermittent on transmit"
          required
        />
        <div className="flex flex-wrap items-center gap-3">
          <select value={severity} onChange={(e) => setSeverity(e.target.value as SquawkSeverity)} className={inputClass + " w-auto"}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Reporting…" : "Report squawk"}
          </button>
        </div>
      </form>

      {/* Open */}
      <section className="flex flex-col gap-2">
        <div className="eyebrow">Open ({open.length})</div>
        {open.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-5 py-8 text-center text-sm text-dim">
            No open squawks. 🎉
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
            {open.map((s) => (
              <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 p-3">
                <div className="min-w-0 text-sm">
                  <div className="flex items-center gap-2">
                    <Chip s={s.severity} />
                    <span className="text-ink">{s.description}</span>
                  </div>
                  <div className="mt-1 text-faint">
                    Reported {fmtDate(s.reported_at)}
                    {s.reporter_name ? ` by ${s.reporter_name}` : ""}
                  </div>
                </div>
                {canEdit && (
                  <button
                    onClick={() => act(() => resolveSquawk(aircraftId, s.id), "Squawk resolved.")}
                    className="shrink-0 rounded-md border border-annun-green/40 px-3 py-1.5 text-sm text-annun-green hover:bg-panel2"
                  >
                    Resolve
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Resolved */}
      {resolved.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="eyebrow">Resolved ({resolved.length})</div>
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
            {resolved.map((s) => (
              <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 p-3 opacity-80">
                <div className="min-w-0 text-sm">
                  <div className="flex items-center gap-2">
                    <Chip s={s.severity} />
                    <span className="text-dim line-through">{s.description}</span>
                  </div>
                  <div className="mt-1 text-faint">
                    Resolved {s.resolved_at ? fmtDate(s.resolved_at) : ""}
                    {s.resolution_notes ? ` — ${s.resolution_notes}` : ""}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => act(() => reopenSquawk(aircraftId, s.id), "Squawk reopened.")}
                      className="rounded-md border border-line px-3 py-1.5 text-sm text-dim hover:border-line2 hover:text-ink"
                    >
                      Reopen
                    </button>
                    <ConfirmButton
                      onConfirm={() => act(() => deleteSquawk(aircraftId, s.id), "Squawk deleted.")}
                      confirmLabel="Delete"
                      className="rounded-md border border-line px-3 py-1.5 text-sm text-dim hover:border-annun-red hover:text-annun-red"
                    >
                      Delete
                    </ConfirmButton>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

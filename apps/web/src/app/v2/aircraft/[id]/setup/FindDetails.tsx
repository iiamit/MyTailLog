"use client";
import { useState } from "react";
import Link from "next/link";
import { buttonClass } from "@/ui/Button";

/** Explicitly selected historical pages use the existing allowance-aware reader; never reread an aircraft in bulk. */
export function FindDetails({ aircraftId, pages }: { aircraftId: string; pages: { id: string; label: string }[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return <details className="mt-4">
    <summary className="min-h-12 cursor-pointer text-body font-semibold">Find aircraft details in existing pages</summary>
    <p className="my-3 text-small text-ink-2">Choose identification pages or original-equipment lists, up to 20 at a time. Reading uses your normal allowance. Confirmed entries and accepted/dismissed suggestions are kept.</p>
    <fieldset disabled={busy} className="max-h-64 overflow-auto border-y border-rule py-2">
      <legend className="text-label">Pages to read</legend>
      {pages.map((p) => <label key={p.id} className="flex min-h-12 items-center gap-3"><input type="checkbox" checked={selected.includes(p.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, p.id] : selected.filter((id) => id !== p.id))} />{p.label}</label>)}
      {!pages.length && <p className="text-small">Upload your logbooks first.</p>}
    </fieldset>
    <button type="button" disabled={busy} className={`${buttonClass("secondary", "s")} mt-3`} onClick={async () => {
      if (!selected.length || selected.length > 20) { setMessage("Choose between 1 and 20 pages."); return; }
      setBusy(true);
      const failed: string[] = [];
      for (const id of selected) {
        try {
          const r = await fetch(`/api/pages/${id}/extract`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queue: true }) });
          if (!r.ok) failed.push(id);
        } catch { failed.push(id); }
      }
      setMessage(`${selected.length - failed.length} queued for reading.${failed.length ? ` ${failed.length} could not be queued; retry those pages.` : " Open Review after reading finishes."}`);
      setSelected(failed); setBusy(false);
    }}>{busy ? "Queuing…" : "Read selected pages for details"}</button>
    {message && <p role="status" className="mt-2 text-small">{message} <Link href={`/aircraft/${aircraftId}/logbooks/review`} className="font-semibold underline">Open Review</Link></p>}
  </details>;
}

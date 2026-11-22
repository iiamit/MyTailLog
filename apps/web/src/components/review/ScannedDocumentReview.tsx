"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Doc = { doc_type: string; extracted: Record<string, unknown>; applied: boolean; updated_at: string };
const label = (key: string) => key.replace(/_/g, " ");

/** Machine-derived AD/W&B values require an explicit review beside the source scan. */
export function ScannedDocumentReview({ pageId, doc, canEdit }: { pageId: string; doc: Doc; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (doc.applied || doc.doc_type === "other") return null;
  const rows = doc.doc_type === "weight_balance"
    ? [doc.extracted.weight_balance as Record<string, unknown>]
    : (doc.extracted.ads ?? []) as Record<string, unknown>[];
  async function approve() {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/page/${pageId}/document-review`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ approve: true, base: doc.updated_at }),
      });
      if (!response.ok) throw new Error((await response.json()).error || "Could not apply this reading.");
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not apply this reading."); }
    finally { setBusy(false); }
  }
  return <section className="rounded-md border border-line bg-panel p-4" aria-label="Document reading to review">
    <h2 className="text-lg font-bold">Check this document reading</h2>
    <p>These values have not changed your aircraft records. Compare every value with the source page before applying them. If anything is incorrect, leave it pending and enter the correct values in Maintenance or Weight & balance.</p>
    {rows.map((row, index) => <dl key={index} className="my-3 grid grid-cols-2 gap-2 border-t border-line pt-3">
      {Object.entries(row ?? {}).filter(([, value]) => value != null).map(([key, value]) => <div key={key}>
        <dt className="text-dim capitalize">{label(key)}</dt><dd>{String(value)}</dd>
      </div>)}
    </dl>)}
    {error && <p role="alert">{error}</p>}
    {canEdit && <button type="button" className="rounded-md border border-line px-3 py-2 font-bold" disabled={busy || rows.length === 0} onClick={approve}>
      {busy ? "Applying…" : "I checked the source — apply these values"}
    </button>}
  </section>;
}

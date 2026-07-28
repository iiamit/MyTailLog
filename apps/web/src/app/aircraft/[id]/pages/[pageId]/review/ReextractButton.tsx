"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-run vision extraction on this page from the review view, so a reviewer who
 * spots a miss (e.g. a continuation not flagged) can re-extract without going
 * back to the logbook list. Hits the same endpoint as the list's Re-extract.
 */
export function ReextractButton({ pageId }: { pageId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!window.confirm("Re-extract this page? Existing entries for it are replaced.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/pages/${pageId}/extract`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Extraction failed.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={run}
        disabled={busy}
        className="rounded-md border border-line px-3 py-1.5 hover:border-line2 disabled:opacity-60"
      >
        {busy ? "Re-extracting…" : "Re-extract page"}
      </button>
      {error && <span className="text-xs text-annun-red">{error}</span>}
    </span>
  );
}

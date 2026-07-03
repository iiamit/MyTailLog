"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { exportBackup } from "@/lib/backup/export";

/** Downloads a full .zip backup (records + scans) of one aircraft, client-side. */
export function BackupButton({ aircraftId }: { aircraftId: string }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const { blob, tail } = await exportBackup(createClient(), aircraftId, setProgress);
      const date = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mytaillog-${tail}-${date}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backup failed.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={download}
        disabled={busy}
        className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium hover:border-slate-500 disabled:opacity-60 dark:border-slate-700"
        title="Download a .zip of all records and scans — re-importable later"
      >
        {busy ? "Preparing…" : "Download backup (.zip)"}
      </button>
      {progress && <span className="text-xs text-slate-500 dark:text-slate-400">{progress}</span>}
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </span>
  );
}

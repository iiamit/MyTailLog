"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { importBackup } from "@/lib/backup/import";

/** Restore a .zip backup as a NEW aircraft owned by the signed-in user. */
export function ImportBackup() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Please sign in again.");
      const { aircraftId } = await importBackup(supabase, user.id, file, setProgress);
      router.push(`/aircraft/${aircraftId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="inline-flex flex-col gap-1">
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="rounded-md border border-slate-300 px-5 py-2.5 text-sm font-medium hover:border-slate-500 disabled:opacity-60 dark:border-slate-700"
        title="Restore a .zip backup as a new aircraft"
      >
        {busy ? "Importing…" : "Import backup"}
      </button>
      {progress && <span className="text-xs text-slate-500 dark:text-slate-400">{progress}</span>}
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}

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
    <>
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
        title="Restore a .zip backup as a new aircraft"
        className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border-[1.5px] border-dashed border-line2 p-6 text-center text-dim hover:border-accent disabled:opacity-60"
      >
        <span className="flex h-[46px] w-[46px] items-center justify-center rounded-xl border border-line2 text-2xl text-accent">
          ⇱
        </span>
        <span className="text-[15px] font-semibold text-ink">
          {busy ? "Importing…" : "Import from backup"}
        </span>
        <span className="max-w-[210px] text-xs leading-relaxed text-faint">
          Restore an aircraft from a MyTailLog <span className="readout">.zip</span> archive —
          scans, extractions and status, intact.
        </span>
        {progress && <span className="text-xs text-faint">{progress}</span>}
        {error && <span className="text-xs text-annun-red">{error}</span>}
      </button>
    </>
  );
}

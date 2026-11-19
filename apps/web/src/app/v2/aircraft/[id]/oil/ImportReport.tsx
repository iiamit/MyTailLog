"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/ui/Button";

/** "Import a lab report" (W-AIRCRAFT-02 Import): POST …/oil-analysis/import, then a result line. */
export function ImportReport({ aircraftId }: { aircraftId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/aircraft/${aircraftId}/oil-analysis/import`, { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setMsg({ ok: false, text: j.error || "Couldn't read that report." });
      else {
        const n = (j.inserted ?? 0) + (j.updated ?? 0);
        const other = j.reportTail && j.aircraftTail && String(j.reportTail).toUpperCase() !== String(j.aircraftTail).toUpperCase();
        setMsg({
          ok: !other,
          text: `Imported ${n === 1 ? "1 sample" : `${n} samples`} from ${j.lab || "the report"}.${other ? ` The report names ${j.reportTail}, not ${j.aircraftTail}. Check it's the right report.` : ""}`,
        });
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: "Couldn't read that report." });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <span className="flex items-center gap-2">
      {msg && (
        <span role={msg.ok ? "status" : "alert"} className="max-w-[40ch] rounded-control bg-leaf px-2.5 py-1 text-small text-ink">
          {msg.text}
        </span>
      )}
      <input ref={input} id="oil-report" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={onFile} disabled={busy} className="peer sr-only" />
      <label htmlFor="oil-report" className={`${buttonClass("on-board", "m")} cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-focus ${busy ? "pointer-events-none opacity-60" : ""}`}>
        {busy ? "Reading the report…" : "Import a lab report"}
      </label>
    </span>
  );
}

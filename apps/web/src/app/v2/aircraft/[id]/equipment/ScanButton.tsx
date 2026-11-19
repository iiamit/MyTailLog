"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/ui/Button";

/** "Find equipment in the logs" (W-AIRCRAFT-03): runs the AI scan over confirmed entries, result inline. */
export function ScanButton({ aircraftId }: { aircraftId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ text: string; error?: boolean } | null>(null);

  async function scan() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/equipment/scan`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setResult({ text: data.error ?? "The scan didn't finish. Try again.", error: true });
      else {
        const m = data.entryCount ?? 0;
        setResult({
          text: data.proposed > 0
            ? `Found ${data.proposed} new ${data.proposed === 1 ? "suggestion" : "suggestions"} from ${m} entries.`
            : `No new equipment found in ${m} entries.`,
        });
        router.refresh();
      }
    } catch {
      setResult({ text: "Couldn't reach MyTailLog. Check your connection and try again.", error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={scan} disabled={busy} className={buttonClass("secondary", "s")}>
        {busy ? "Reading the logs…" : "Find equipment in the logs"}
      </button>
      {result && (
        <span role={result.error ? "alert" : "status"} className={`text-small ${result.error ? "font-semibold text-alarm-text" : "text-ink-2"}`}>
          {result.text}
        </span>
      )}
    </div>
  );
}

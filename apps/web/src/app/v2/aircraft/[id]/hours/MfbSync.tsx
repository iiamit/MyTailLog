"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/ui/Button";

/** "Sync now": POST /api/myflightbook/sync (the same route v1 used) and say what came of it. */
export function MfbSync() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function sync() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/myflightbook/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setMsg({ ok: false, text: data.error ?? "The sync didn't work. Try again." });
      else if (data.synced > 0) {
        setMsg({ ok: true, text: "New readings brought in from MyFlightBook." });
        router.refresh();
      } else if (data.matched === 0) setMsg({ ok: false, text: "No MyFlightBook aircraft matched this tail number." });
      else setMsg({ ok: true, text: "Already up to date. No new readings." });
    } catch {
      setMsg({ ok: false, text: "Couldn't reach MyTailLog. Check your connection." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={sync} disabled={busy} className={buttonClass("secondary", "s")}>
        {busy ? "Syncing…" : "Sync now"}
      </button>
      {msg && (
        <span role={msg.ok ? "status" : "alert"} className={`text-small ${msg.ok ? "text-ink-2" : "font-semibold text-alarm-text"}`}>
          {msg.text}
        </span>
      )}
    </span>
  );
}

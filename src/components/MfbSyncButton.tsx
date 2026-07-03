"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { PlaneIcon } from "@/components/icons";

/**
 * Triggers POST /api/myflightbook/sync and toasts the result. Degrades
 * gracefully — a not-connected / API error just shows an error toast.
 */
export function MfbSyncButton({
  className,
  label = "Sync from MyFlightBook",
}: {
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function sync() {
    setBusy(true);
    try {
      const res = await fetch("/api/myflightbook/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Sync failed.");
      } else if (data.synced > 0) {
        const extra =
          data.unmatchedTails?.length > 0
            ? ` (${data.unmatchedTails.length} MFB tail${data.unmatchedTails.length === 1 ? "" : "s"} not matched)`
            : "";
        toast.success(
          `Synced hours for ${data.synced} aircraft${data.synced === 1 ? "" : "s"}.${extra}`,
        );
        router.refresh();
      } else if (data.matched === 0) {
        toast.error("No MyFlightBook aircraft matched your tail numbers.");
      } else {
        toast.success("Already up to date — no new readings.");
      }
    } catch {
      toast.error("Network error during sync.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={sync}
      disabled={busy}
      className={
        className ??
        "inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:border-slate-500 disabled:opacity-50 dark:border-slate-700"
      }
    >
      <PlaneIcon />
      {busy ? "Syncing…" : label}
    </button>
  );
}

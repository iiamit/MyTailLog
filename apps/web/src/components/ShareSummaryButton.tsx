"use client";

import { useState } from "react";

export function ShareSummaryButton({ title, text }: { title: string; text: string }) {
  const [status, setStatus] = useState("");

  async function share() {
    setStatus("");
    try {
      if (navigator.share) {
        await navigator.share({ title, text });
        setStatus("Shared");
      } else {
        await navigator.clipboard.writeText(text);
        setStatus("Copied");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(text);
        setStatus("Copied");
      } catch {
        setStatus("Couldn’t share");
      }
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={share} className="rounded-md bg-accent px-4 py-2.5 text-[13px] font-medium text-bg hover:opacity-90">
        Share summary
      </button>
      <span aria-live="polite" className="text-xs text-faint">{status}</span>
    </div>
  );
}

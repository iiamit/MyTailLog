"use client";

import { useState, useTransition } from "react";
import { leaveSharedAircraft } from "./actions";

/**
 * "Remove from my dashboard" for an aircraft shared WITH you — including the
 * read-only demo. It drops your own grant and nothing else.
 *
 * Two-step rather than a browser confirm(): a modal dialog blocks the whole
 * page, and this is reversible by whoever shared it, so the friction should
 * match the stakes.
 */
export function RemoveShared({ aircraftId, tail }: { aircraftId: string; tail: string }) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (error) {
    return <span className="text-[11px] text-annun-red">{error}</span>;
  }

  if (!armed) {
    return (
      <button
        onClick={() => setArmed(true)}
        className="text-[11px] text-faint underline decoration-line underline-offset-2 hover:text-ink"
      >
        Remove from my dashboard
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-[11px]">
      <span className="text-dim">Remove {tail}?</span>
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await leaveSharedAircraft(aircraftId);
            if ("error" in res) setError(res.error);
          })
        }
        className="font-semibold text-annun-red hover:opacity-80 disabled:opacity-50"
      >
        {pending ? "Removing…" : "Yes"}
      </button>
      <button onClick={() => setArmed(false)} className="text-faint hover:text-ink">
        Cancel
      </button>
    </span>
  );
}

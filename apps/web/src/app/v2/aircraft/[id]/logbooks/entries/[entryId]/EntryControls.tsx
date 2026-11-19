"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/Button";
import { setEntryConfirmed } from "../../actions";

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** `[` and `]` step to the previous / next stop on this line (02 §4.9), replacing the URL. */
export function EntryKeys({ prev, next }: { prev: string | null; next: string | null }) {
  const router = useRouter();
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "[" && prev) router.replace(prev);
      if (e.key === "]" && next) router.replace(next);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [prev, next, router]);
  return null;
}

/** "Unconfirm": back to read by AI (extracted entries only). */
export function UnconfirmButton({ aircraftId, entryId }: { aircraftId: string; entryId: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <Button
        size="s"
        variant="quiet"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await setEntryConfirmed(aircraftId, entryId, false);
            if ("error" in r) setErr(r.error);
          })
        }
      >
        Unconfirm
      </Button>
      {err && <p role="alert" className="text-small text-alarm-text">{err}</p>}
    </>
  );
}

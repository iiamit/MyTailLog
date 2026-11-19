"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { importBackup } from "@/lib/backup/import";
import { HEARD_ABOUT, type HeardAbout } from "@/lib/signupSource";
import { leaveSharedAircraft } from "@/app/dashboard/actions";
import { buttonClass } from "@/ui/Button";

/** Import card (W-HANGAR-01): restore a .zip as a new aircraft; progress and errors stay inside the card. */
export function ImportCard() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const card = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The rail's Add › Import a backup lands on /hangar#import.
  useEffect(() => {
    if (window.location.hash === "#import") card.current?.focus();
  }, []);

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
      router.push(`/aircraft/${aircraftId}/status`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The import stopped. Nothing was added. Try again.");
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <button
        ref={card}
        id="import"
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className="state-layer flex min-h-[112px] w-full flex-col items-start justify-center gap-1 rounded-leaf border-2 border-dashed border-on-board-2 px-6 py-4 text-left text-on-board disabled:cursor-progress"
      >
        <span className="flex items-center gap-2 text-heading">
          <Upload aria-hidden size={20} /> {busy ? "Importing…" : "Import a backup"}
        </span>
        <span className="text-body text-on-board-2">Restore an aircraft from a MyTailLog .zip archive: scans, entries and status, as they were.</span>
        {progress && <span role="status" className="text-small font-semibold">{progress}</span>}
        {error && <span role="alert" className="rounded-[3px] bg-leaf px-2 py-0.5 text-small font-semibold text-alarm-text">{error}</span>}
      </button>
    </>
  );
}

/** "Remove from my hangar" for a shared or demo aircraft: drops only your own access, after a ConfirmDialog. */
export function RemoveFromHangar({ aircraftId, tail }: { aircraftId: string; tail: string }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button type="button" className={buttonClass("quiet", "s")} onClick={() => dialog.current?.showModal()}>
        Remove from my hangar
      </button>
      {error && <span role="alert" className="text-small font-semibold text-alarm-text">{error}</span>}
      <dialog ref={dialog} className="m-auto max-w-[440px] rounded-leaf bg-leaf p-6 text-ink shadow-leaf backdrop:bg-mat/60">
        <p className="text-body">Remove {tail} from your hangar? You can be invited again later.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" autoFocus className={buttonClass("quiet", "m")} onClick={() => dialog.current?.close()}>
            Keep {tail}
          </button>
          <button
            type="button"
            disabled={pending}
            className={buttonClass("alarm", "m")}
            onClick={() =>
              start(async () => {
                const res = await leaveSharedAircraft(aircraftId);
                dialog.current?.close();
                if ("error" in res) setError(res.error);
                else router.refresh();
              })
            }
          >
            {pending ? "Removing…" : `Remove ${tail}`}
          </button>
        </div>
      </dialog>
    </>
  );
}

/** "How did you hear" Well for accounts younger than 14 days (W-HANGAR-01). */
export function HeardAboutWell() {
  const [state, setState] = useState<"ask" | "saving" | "done" | "error">("ask");
  async function answer(value: HeardAbout) {
    setState("saving");
    const res = await fetch("/api/growth/heard-about", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answer: value }),
    }).catch(() => null);
    setState(res?.ok ? "done" : "error");
  }
  if (state === "done") return null;
  return (
    <section aria-labelledby="heard-title" className="rounded-leaf bg-leaf-2 px-6 py-4 text-ink">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="heard-title" className="text-section">How did you hear about MyTailLog?</h2>
        <button type="button" className={buttonClass("quiet", "s")} disabled={state === "saving"} onClick={() => answer("dismissed")}>
          Skip
        </button>
      </div>
      <p className="mt-1 text-small text-ink-2">One tap. It tells us where to spend our time. Nothing else is tracked.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {HEARD_ABOUT.map(([value, label]) => (
          <button key={value} type="button" disabled={state === "saving"} onClick={() => answer(value)} className={buttonClass("secondary", "s")}>
            {label}
          </button>
        ))}
      </div>
      {state === "error" && <p role="alert" className="mt-2 text-small font-semibold text-alarm-text">Couldn&apos;t save that. Try again.</p>}
    </section>
  );
}

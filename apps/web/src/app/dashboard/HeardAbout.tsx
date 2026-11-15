"use client";

import { useState } from "react";
import { HEARD_ABOUT, type HeardAbout as Answer } from "@/lib/signupSource";

/** One-tap "How did you hear about MyTailLog?" card for new accounts. */
export function HeardAbout() {
  const [state, setState] = useState<"ask" | "saving" | "done" | "error">("ask");

  async function answer(value: Answer) {
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
    <section className="panel mb-5 p-4" aria-labelledby="heard-about-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="heard-about-title" className="text-[14.5px] font-semibold">How did you hear about MyTailLog?</h2>
        <button
          type="button"
          onClick={() => answer("dismissed")}
          disabled={state === "saving"}
          className="text-xs text-faint hover:text-ink"
        >
          Skip
        </button>
      </div>
      <p className="mt-1 text-[12.5px] text-dim">One tap. It tells us where to spend our time. Nothing else is tracked.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {HEARD_ABOUT.map(([value, label]) => (
          <button
            key={value}
            type="button"
            disabled={state === "saving"}
            onClick={() => answer(value)}
            className="rounded-full border border-line2 px-3 py-1 text-[12.5px] text-dim hover:border-accent hover:text-ink disabled:opacity-50"
          >
            {label}
          </button>
        ))}
      </div>
      {state === "error" && <p className="mt-2 text-xs text-annun-red">Couldn&apos;t save that. Try again.</p>}
    </section>
  );
}

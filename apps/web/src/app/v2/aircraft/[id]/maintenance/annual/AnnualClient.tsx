"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/ui/Button";
import { Field, Notice, fieldClass } from "@/ui/Form";
import { LineAhead, type CapInput } from "@/ui/LineAhead";
import type { RingInput } from "@/lib/v2/status";
import { shareWithIa, type IaRoomState } from "./actions";

/** The line ahead from today to the annual; a ring opens its item, a cap opens the VisitPanel here. */
export function AnnualLine({
  aircraftId, from, to, lanes, rings, caps, selectedCap, summary,
}: {
  aircraftId: string; from: string; to: string; lanes: string[]; rings: (RingInput & { name: string })[]; caps: CapInput[];
  selectedCap: string | null; summary: string;
}) {
  const router = useRouter();
  const a = `/aircraft/${aircraftId}`;
  return (
    <LineAhead
      from={from}
      to={to}
      lanes={lanes}
      rings={rings}
      onSelect={(k) => router.push(`${a}/status/item/${k}`)}
      caps={caps}
      selectedCap={selectedCap}
      onSelectCap={(k) => router.replace(`${a}/maintenance/annual?visit=${encodeURIComponent(k)}`, { scroll: false })}
      summary={summary}
    />
  );
}

/** "For your IA": the record-room preset, contents editable before sharing (owner only). */
export function IaRoomForm({
  aircraftId, days, until, books, entries, pages, documents,
}: { aircraftId: string; days: number; until: string; books: number; entries: number; pages: number; documents: number }) {
  const [state, action, pending] = useActionState<IaRoomState, FormData>(shareWithIa.bind(null, aircraftId, days), null);
  if (state?.url) {
    return (
      <div className="flex flex-col gap-2">
        <Notice>Record room made. Copy the link now; it is shown once. It stays open until {until}.</Notice>
        <input readOnly value={state.url} aria-label="Record room link" className={fieldClass} onFocus={(e) => e.currentTarget.select()} />
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClass("secondary", "s")} onClick={() => navigator.clipboard?.writeText(state.url!)}>
            Copy link
          </button>
          <a href={`/aircraft/${aircraftId}/share`} className={buttonClass("quiet", "s")}>See it in Share</a>
        </div>
      </div>
    );
  }
  const box = "mt-0.5 size-[18px] accent-[var(--color-ink)]";
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label="Your IA" help="Their name and certificate, so you know which link is theirs.">
        <input name="label" maxLength={80} placeholder="e.g. R. Alvarez, IA 3105582" className={fieldClass} />
      </Field>
      <fieldset className="flex flex-col gap-2 text-body">
        <legend className="mb-1 text-label">What the room shows</legend>
        <label className="flex gap-2.5"><input type="checkbox" name="summary" defaultChecked className={box} />This checklist and the line ahead</label>
        <label className="flex gap-2.5"><input type="checkbox" name="books" defaultChecked className={box} />All {books} logbooks, {entries} confirmed entries</label>
        <label className="flex gap-2.5"><input type="checkbox" name="scans" defaultChecked className={box} />Page scans, {pages} pages</label>
        <label className="flex gap-2.5"><input type="checkbox" name="docs" defaultChecked className={box} />Documents, {documents}</label>
      </fieldset>
      <p className="text-small text-ink-3">Read-only, no account needed. Open until {until}; you can revoke it in Share.</p>
      {state?.error && <Notice tone="alarm">{state.error}</Notice>}
      <div>
        <button type="submit" disabled={pending} className={buttonClass("primary", "m")}>Share with your IA</button>
      </div>
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";
import { Copy } from "lucide-react";
import { Button, buttonClass } from "@/ui/Button";
import { Field, fieldClass, Notice } from "@/ui/Form";
import { makeRoom, type MakeState } from "./actions";

export type Audience = "ia" | "buyer" | "insurer" | "other";
export type Choice = { id: string; label: string; detail?: string; preset: Audience[] };

const WINDOWS = [
  ["line_ahead", "The line ahead to the annual"],
  ["whole_life", "The whole-life map"],
  ["last_5_years", "The last five years"],
] as const;
const PRESET: Record<Audience, { window: string; summary: boolean; dossier: boolean; scans: boolean; squawks: boolean; books: boolean; ends: string }> = {
  ia: { window: "line_ahead", summary: true, dossier: false, scans: true, squawks: true, books: true, ends: "annual" },
  buyer: { window: "whole_life", summary: true, dossier: true, scans: false, squawks: false, books: true, ends: "30" },
  insurer: { window: "last_5_years", summary: true, dossier: false, scans: false, squawks: false, books: false, ends: "14" },
  other: { window: "whole_life", summary: true, dossier: false, scans: false, squawks: false, books: false, ends: "30" },
};

/** W-SHARE-01 create form: contents, cover and end prefilled from the audience preset (08 §3.16). */
export function CreateRoomForm({
  aircraftId,
  audience,
  books,
  documents,
  annualEnds,
  today,
}: {
  aircraftId: string;
  audience: Audience;
  books: Choice[];
  documents: Choice[];
  /** "Until 14 days after the annual (Jan 14, 2027)" when the annual's due date is known. */
  annualEnds: string | null;
  today: string;
}) {
  const p = PRESET[audience];
  const [state, action, pending] = useActionState<MakeState, FormData>(makeRoom.bind(null, aircraftId), null);
  const [ends, setEnds] = useState(audience === "ia" && !annualEnds ? "30" : p.ends);
  const [squawks, setSquawks] = useState(p.squawks);
  const box = "mt-0.5 size-[18px] shrink-0";
  const row = "flex items-start gap-2.5 py-1 text-body";
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="audience" value={audience} />
      <Field label="For">
        <input name="label" required maxLength={80} placeholder="e.g. J. Okafor" className={fieldClass} autoFocus />
      </Field>

      <fieldset>
        <legend className="text-label">Opens on</legend>
        {WINDOWS.map(([v, l]) => (
          <label key={v} className={row}>
            <input type="radio" name="mapWindow" value={v} defaultChecked={p.window === v} className={box} /> {l}
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend className="text-label">Includes</legend>
        <label className={row}><input type="checkbox" name="summary" defaultChecked={p.summary} className={box} /> Maintenance summary</label>
        <label className={row}><input type="checkbox" name="dossier" defaultChecked={p.dossier} className={box} /> Pre-buy dossier</label>
        {books.map((b) => (
          <label key={b.id} className={row}>
            <input type="checkbox" name="logbook" value={b.id} defaultChecked={p.books} className={box} />
            <span>{b.label} <span className="text-small text-ink-3">{b.detail}</span></span>
          </label>
        ))}
        <label className={row}>
          <input type="checkbox" name="scans" defaultChecked={p.scans} className={box} />
          <span>Page scans <span className="block text-small text-ink-3">Page scans can show entries you haven&apos;t confirmed yet.</span></span>
        </label>
        {documents.map((d) => (
          <label key={d.id} className={row}>
            <input type="checkbox" name="document" value={d.id} defaultChecked={d.preset.includes(audience)} className={box} />
            <span>{d.label} <span className="text-small text-ink-3">{d.detail}</span></span>
          </label>
        ))}
        <label className={row}>
          <input type="checkbox" name="squawks" checked={squawks} onChange={(e) => setSquawks(e.target.checked)} className={box} /> Open squawks
        </label>
        <label className={`${row} pl-7 ${squawks ? "" : "opacity-40"}`}>
          <input type="checkbox" name="reporters" disabled={!squawks} className={box} /> Who reported them
        </label>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Ends">
          <select name="ends" value={ends} onChange={(e) => setEnds(e.target.value)} className={fieldClass}>
            {audience === "ia" && annualEnds && <option value="annual">{annualEnds}</option>}
            {[7, 14, 30, 90, 180].map((d) => <option key={d} value={d}>{d} days</option>)}
            <option value="date">On a date</option>
          </select>
        </Field>
        {ends === "date" && (
          <Field label="End date">
            <input type="date" name="endsOn" required min={today} className={fieldClass} />
          </Field>
        )}
      </div>

      {state?.error && <Notice tone="alarm">{state.error}</Notice>}
      <button type="submit" disabled={pending} className={buttonClass("primary")}>
        {pending ? "Making the link…" : "Make the link"}
      </button>
    </form>
  );
}

/** W-SHARE-04 board action "Copy as text". */
export function CopyText({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <span role="status" className="text-small">{copied ? "Summary copied as text." : ""}</span>
      <Button variant="on-board" onClick={() => void navigator.clipboard?.writeText(text).then(() => setCopied(true))}>
        <Copy aria-hidden size={16} /> Copy as text
      </Button>
    </>
  );
}

/** "Copy link" with its confirmation in place of a toast (0.5 Feedback: announced politely). */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <Button size="s" onClick={() => void navigator.clipboard?.writeText(url).then(() => setCopied(true))}>
        <Copy aria-hidden size={16} /> Copy link
      </Button>
      <span role="status" className="text-small text-ink-3">{copied ? "Link copied." : ""}</span>
    </>
  );
}

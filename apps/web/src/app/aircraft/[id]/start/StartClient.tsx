"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Urgency } from "@/lib/compliance";
import { rasterizeFile, isSupportedFile } from "@/lib/capture/importFiles";
import { makeThumbnail } from "@/lib/capture/thumbnail";
import { confirmAnnual, pageEntries, saveStartHours, setItemDate, type ExtractedEntry } from "./actions";

export type StatusRow = { kind: string; label: string; urgency: Urgency | "none"; due: string; known: boolean };

const DOT: Record<string, string> = { overdue: "var(--red)", due_soon: "var(--amb)", upcoming: "var(--grn)", none: "var(--line2)" };
const STEPS = ["Current hours", "Last annual", "Your status"];
const btn = "rounded-[9px] bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-bg hover:opacity-90 disabled:opacity-50";
const btn2 = "rounded-[9px] border border-line2 bg-panel2 px-4 py-2.5 text-[13.5px] text-ink hover:border-accent disabled:opacity-50";
const input = "rounded-lg border border-line2 bg-bg px-3 py-2 font-mono text-[14px] text-ink";
const num = (v: string) => (v.trim() === "" ? null : Number(v));
const today = () => new Date().toISOString().slice(0, 10);

export function StartClient(props: {
  aircraftId: string;
  tail: string;
  step: 1 | 2 | 3;
  airframeLogbookId: string | null;
  tach: number | null;
  hobbs: number | null;
  rows: StatusRow[];
}) {
  return (
    <div className="flex flex-col gap-5">
      <ol className="flex gap-2" aria-label="Progress">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const state = n < props.step ? "done" : n === props.step ? "current" : "todo";
          return (
            <li
              key={label}
              aria-current={state === "current" ? "step" : undefined}
              className={`flex-1 border-t-[3px] pt-1.5 text-[12px] ${
                state === "done" ? "border-annun-green text-dim" : state === "current" ? "border-accent text-ink" : "border-line2 text-faint"
              }`}
            >
              {n}. {label}
              {state === "done" && " ✓"}
            </li>
          );
        })}
      </ol>
      <section className="panel p-5">
        {props.step === 1 && <HoursStep {...props} />}
        {props.step === 2 && <AnnualStep {...props} />}
        {props.step === 3 && <StatusStep {...props} />}
      </section>
    </div>
  );
}

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: true } | { error: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if ("error" in r) setError(r.error);
      else router.refresh();
    });
  return { pending, error, setError, run };
}

function HoursStep({ aircraftId, tach, hobbs }: { aircraftId: string; tach: number | null; hobbs: number | null }) {
  const [t, setT] = useState(tach?.toString() ?? "");
  const [h, setH] = useState(hobbs?.toString() ?? "");
  const { pending, error, setError, run } = useAction();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const tv = num(t);
        const hv = num(h);
        if (tv == null && hv == null) return setError("Enter the tach, the hobbs, or both.");
        run(() => saveStartHours(aircraftId, { tach: tv, hobbs: hv }));
      }}
    >
      <h2 className="font-display text-[18px] font-semibold">What do the meters read today?</h2>
      <p className="mt-1 text-[13px] text-dim">Hour-based items count down from these. The tach is enough if you don&apos;t have a hobbs.</p>
      <div className="mt-4 flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 text-[12px] text-dim" htmlFor="start-tach">
          Tach
          <input id="start-tach" className={input} inputMode="decimal" value={t} onChange={(e) => setT(e.target.value)} placeholder="2214.7" />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-dim" htmlFor="start-hobbs">
          Hobbs
          <input id="start-hobbs" className={input} inputMode="decimal" value={h} onChange={(e) => setH(e.target.value)} placeholder="3118.2" />
        </label>
      </div>
      {error && <p className="mt-3 text-[13px] text-annun-red">{error}</p>}
      <button className={`${btn} mt-5`} disabled={pending}>{pending ? "Saving…" : "Save hours"}</button>
    </form>
  );
}

type Phase =
  | { at: "choose" }
  | { at: "working"; message: string }
  | { at: "pick"; entries: ExtractedEntry[] }
  | { at: "type" };

function AnnualStep({ aircraftId, airframeLogbookId }: { aircraftId: string; airframeLogbookId: string | null }) {
  const [phase, setPhase] = useState<Phase>({ at: "choose" });
  const { pending, error, setError, run } = useAction();

  async function onFile(file: File | undefined) {
    if (!file || !airframeLogbookId) return;
    if (!isSupportedFile(file)) return setError("Use a photo (JPEG or PNG) or a PDF.");
    setError(null);
    try {
      setPhase({ at: "working", message: "Preparing the photo…" });
      let blob: Blob | null = null;
      // shortcut: first page only; a multi-page PDF belongs in Capture pages. Read every page when owners
      // drop multi-page PDFs here instead of using Capture (support mail is the signal).
      await rasterizeFile(file, async (p, i) => {
        if (i === 1) blob = p.blob;
      });
      if (!blob) throw new Error("Couldn't read that file.");
      const pageId = crypto.randomUUID();
      const fd = new FormData();
      fd.set("image", blob, `${pageId}.jpg`);
      fd.set("thumbnail", await makeThumbnail(blob), `${pageId}_thumb.jpg`);
      fd.set("pageId", pageId);
      fd.set("logbookId", airframeLogbookId);
      fd.set("capturedAt", new Date().toISOString());
      fd.set("isHandwritten", "true"); // unknown → the stronger reading path
      setPhase({ at: "working", message: "Uploading…" });
      const up = await fetch(`/api/aircraft/${aircraftId}/capture`, { method: "POST", body: fd });
      if (!up.ok) throw new Error("The upload didn't go through. Check your connection and try again.");

      setPhase({ at: "working", message: "Reading the page. This can take up to a minute…" });
      const ex = await fetch(`/api/pages/${pageId}/extract`, { method: "POST" });
      if (!ex.ok) {
        const body = (await ex.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Couldn't read the page.");
      }
      const found = await pageEntries(aircraftId, pageId);
      if (found.length === 0) throw new Error("No entries were found on that page. Try a sharper photo, or type the date.");
      setPhase({ at: "pick", entries: found });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setPhase({ at: "choose" });
    }
  }

  return (
    <div>
      <h2 className="font-display text-[18px] font-semibold">When was your last annual?</h2>
      <p className="mt-1 text-[13px] text-dim">
        Photograph the page with your most recent annual sign-off. It&apos;s usually the last
        inspection entry in the airframe logbook. We&apos;ll read it and you confirm it.
      </p>

      {phase.at === "choose" && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {airframeLogbookId ? (
            <label className={`${btn} cursor-pointer`}>
              Photograph or upload the page
              <input
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                capture="environment"
                className="sr-only"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </label>
          ) : (
            <p className="text-[13px] text-faint">This aircraft has no airframe logbook to add the page to.</p>
          )}
          <button type="button" className={btn2} onClick={() => setPhase({ at: "type" })}>Type the date instead</button>
        </div>
      )}

      {phase.at === "working" && (
        <p className="mt-4 text-[13.5px] text-dim" role="status">{phase.message}</p>
      )}

      {phase.at === "pick" && (
        <PickAnnual
          entries={phase.entries}
          pending={pending}
          onConfirm={(entryId, date) => run(() => confirmAnnual(aircraftId, { entryId, date }))}
          onType={() => setPhase({ at: "type" })}
        />
      )}

      {phase.at === "type" && (
        <TypeDate
          pending={pending}
          onSave={(date) => run(() => setItemDate(aircraftId, { kind: "annual", date }))}
          onBack={() => setPhase({ at: "choose" })}
        />
      )}

      {error && <p className="mt-3 text-[13px] text-annun-red">{error}</p>}
    </div>
  );
}

const looksAnnual = (t: string) => /\bannual\b/i.test(t);

function PickAnnual({
  entries,
  pending,
  onConfirm,
  onType,
}: {
  entries: ExtractedEntry[];
  pending: boolean;
  onConfirm: (entryId: string, date: string) => void;
  onType: () => void;
}) {
  const initial = entries.find((e) => looksAnnual(e.text)) ?? entries[0];
  const [id, setId] = useState(initial.id);
  const chosen = entries.find((e) => e.id === id)!;
  const [date, setDate] = useState(chosen.entry_date ?? "");
  return (
    <div className="mt-4">
      <p className="text-[13px] text-dim">Which entry is the annual? Check the date against the page.</p>
      <div className="mt-2 flex flex-col gap-2" role="radiogroup" aria-label="Entries on this page">
        {entries.map((e) => (
          <label
            key={e.id}
            className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-[13px] ${e.id === id ? "border-accent bg-accent-soft" : "border-line"}`}
          >
            <input
              type="radio"
              name="annual-entry"
              checked={e.id === id}
              onChange={() => {
                setId(e.id);
                setDate(e.entry_date ?? "");
              }}
            />
            <span className="readout w-[86px] shrink-0 text-dim">{e.entry_date ?? "no date"}</span>
            <span className="min-w-0 flex-1">{e.text || "—"}</span>
          </label>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[12px] text-dim" htmlFor="annual-date">
          Annual date
          <input id="annual-date" type="date" className={input} value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button type="button" className={btn} disabled={pending || !date} onClick={() => onConfirm(id, date)}>
          {pending ? "Saving…" : "Confirm annual"}
        </button>
        <button type="button" className="text-[13px] text-faint hover:text-ink" onClick={onType}>None of these</button>
      </div>
      <p className="mt-2 text-[11.5px] text-faint">Confirming marks this entry reviewed. The page&apos;s other entries wait in Review.</p>
    </div>
  );
}

function TypeDate({ pending, onSave, onBack }: { pending: boolean; onSave: (date: string) => void; onBack: () => void }) {
  const [date, setDate] = useState("");
  return (
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-[12px] text-dim" htmlFor="annual-typed">
        Date of the last annual
        <input id="annual-typed" type="date" className={input} value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
      </label>
      <button type="button" className={btn} disabled={pending || !date} onClick={() => onSave(date)}>
        {pending ? "Saving…" : "Save"}
      </button>
      <button type="button" className="text-[13px] text-faint hover:text-ink" onClick={onBack}>Back</button>
    </div>
  );
}

function StatusStep({ aircraftId, tail, rows }: { aircraftId: string; tail: string; rows: StatusRow[] }) {
  const attention = rows.filter((r) => r.urgency === "overdue" || r.urgency === "due_soon").length;
  const headline =
    rows.some((r) => r.urgency === "overdue")
      ? `${tail} has an overdue item.`
      : attention > 0
        ? `${tail}: ${attention} item${attention > 1 ? "s" : ""} due soon.`
        : `${tail} is current on what we know so far.`;
  return (
    <div>
      <h2 className="font-display text-[18px] font-semibold">{headline}</h2>
      <div className="mt-3">
        {rows.map((r) => (
          <StatusLine key={r.kind} aircraftId={aircraftId} row={r} />
        ))}
      </div>
      <div className="mt-5 rounded-lg border border-line bg-panel2 p-4">
        <p className="text-[13px]">
          <b>Next: work backward through the airframe logbook.</b>{" "}
          <span className="text-dim">Reminders go out by email before anything comes due; adjust them in Profile.</span>
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={`/aircraft/${aircraftId}/capture`} className={btn}>Scan more pages</Link>
          <Link href={`/aircraft/${aircraftId}`} className={btn2}>Go to overview</Link>
        </div>
      </div>
    </div>
  );
}

function StatusLine({ aircraftId, row }: { aircraftId: string; row: StatusRow }) {
  const [date, setDate] = useState("");
  const { pending, error, run } = useAction();
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line py-2.5 last:border-0">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: DOT[row.urgency] }} aria-hidden />
      <span className="min-w-0 flex-1 text-[13.5px]">
        {row.label}
        {!row.known && <span className="text-faint"> · last done?</span>}
      </span>
      {row.known ? (
        <span className="readout text-[12px] text-dim">{row.due}</span>
      ) : (
        <span className="flex items-center gap-2">
          <input
            type="date"
            aria-label={`${row.label} last done`}
            className={`${input} py-1 text-[12px]`}
            value={date}
            max={today()}
            onChange={(e) => setDate(e.target.value)}
          />
          <button type="button" className="text-[12.5px] text-accent disabled:opacity-50" disabled={!date || pending} onClick={() => run(() => setItemDate(aircraftId, { kind: row.kind, date }))}>
            {pending ? "…" : "Save"}
          </button>
        </span>
      )}
      {error && <span className="w-full text-[12px] text-annun-red">{error}</span>}
    </div>
  );
}

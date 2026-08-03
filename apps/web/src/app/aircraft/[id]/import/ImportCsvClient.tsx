"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { IMPORT_FIELDS, FIELD_LABEL, type ImportField } from "@/lib/csv/fields";

type Logbook = { id: string; label: string };

type DateDetection =
  | { kind: "resolved"; format: "iso" | "mdy" | "dmy" }
  | { kind: "ambiguous"; samples: { raw: string; mdy: string; dmy: string }[] }
  | { kind: "conflict"; mdyRows: number[]; dmyRows: number[] }
  | { kind: "unrecognized"; samples: string[] };

type Analysis = {
  header: string[];
  sampleRows: string[][];
  rowCount: number;
  delimiter: string;
  columns: { index: number; field: ImportField; confidence: number }[];
  dates: DateDetection | null;
};

type Preview = {
  willCreate: number;
  skipped: number;
  errors: { row: number; message: string }[];
  dateFormat: string;
};

const DELIM_LABEL: Record<string, string> = { ",": "comma", ";": "semicolon", "\t": "tab", "|": "pipe" };

const btn = "rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-50";
const btnGhost = "rounded-md border border-line px-4 py-2 text-sm text-dim hover:border-line2 hover:text-ink disabled:opacity-50";
const select = "rounded-md border border-line bg-panel2 px-2 py-1.5 text-sm text-ink outline-hidden focus:border-accent";

export function ImportCsvClient({
  aircraftId,
  logbooks,
  existingEntries,
}: {
  aircraftId: string;
  logbooks: Logbook[];
  existingEntries: number;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [logbookId, setLogbookId] = useState(logbooks[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [mapping, setMapping] = useState<ImportField[]>([]);
  const [dates, setDates] = useState<DateDetection | null>(null);
  const [dateFormat, setDateFormat] = useState<"mdy" | "dmy" | "">("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState<{ inserted: number; skipped: number } | null>(null);

  // The file is re-posted each step: it's capped at 5 MB, and a stateless route
  // has no half-finished upload to expire or clean up.
  async function post(step: "analyze" | "preview" | "import") {
    if (!file) return null;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("step", step);
    if (step !== "analyze") {
      fd.set("mapping", JSON.stringify(mapping));
      if (dateFormat) fd.set("dateFormat", dateFormat);
      fd.set("logbookId", logbookId);
    }
    const res = await fetch(`/api/aircraft/${aircraftId}/import/csv`, { method: "POST", body: fd });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      setError(String(body.error ?? "Import failed."));
      if (body.dates) setDates(body.dates as DateDetection);
      return null;
    }
    return body;
  }

  async function run(step: "analyze" | "preview" | "import") {
    setBusy(true);
    setError(null);
    const body = await post(step);
    setBusy(false);
    if (!body) return;
    if (step === "analyze") {
      const a = body as unknown as Analysis;
      setAnalysis(a);
      setMapping(a.columns.map((c) => c.field));
      setDates(a.dates);
      setPreview(null);
    } else if (step === "preview") {
      setPreview(body as unknown as Preview);
    } else {
      setDone({ inserted: Number(body.inserted ?? 0), skipped: Number(body.skipped ?? 0) });
    }
  }

  function chooseFile(f: File | null) {
    setFile(f);
    setAnalysis(null);
    setPreview(null);
    setDone(null);
    setDates(null);
    setDateFormat("");
    setError(null);
  }

  function setColumn(i: number, field: ImportField) {
    setPreview(null);
    setMapping((m) => {
      const next = [...m];
      // A field maps to at most one column — claiming it releases the other.
      if (field !== "ignore") {
        for (let j = 0; j < next.length; j++) if (j !== i && next[j] === field) next[j] = "ignore";
      }
      next[i] = field;
      return next;
    });
  }

  if (done) {
    return (
      <div className="panel flex flex-col gap-3 p-5">
        <h2 className="text-lg font-semibold text-ink">
          Imported {done.inserted} {done.inserted === 1 ? "entry" : "entries"}
        </h2>
        <p className="text-sm text-dim">
          They&apos;re in the review queue, <span className="font-medium">unconfirmed</span> — check
          them against your own records before they drive any reminder or forecast.
          {done.skipped > 0 && ` ${done.skipped} row${done.skipped === 1 ? "" : "s"} couldn't be read and ${done.skipped === 1 ? "was" : "were"} skipped.`}
        </p>
        {existingEntries > 0 && (
          <p className="rounded-md border border-annun-amber/40 px-3 py-2 text-xs text-annun-amber" style={{ background: "var(--amb-bg)" }}>
            This aircraft already had {existingEntries} {existingEntries === 1 ? "entry" : "entries"}
            {" "}before the import — the usual way to end up with duplicates. Run{" "}
            <Link href={`/aircraft/${aircraftId}/duplicates`} className="underline">
              Fix duplicates
            </Link>{" "}
            to check.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Link href={`/aircraft/${aircraftId}/review`} className={btn}>
            Review the imported entries
          </Link>
          <Link href={`/aircraft/${aircraftId}/duplicates`} className={btnGhost}>
            Fix duplicates
          </Link>
          <button onClick={() => chooseFile(null)} className={btnGhost}>
            Import another file
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Step 1 — the file and its logbook */}
      <section className="panel flex flex-col gap-3 p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Which logbook do these entries belong to?</span>
          <span className="text-xs text-faint">
            Required — every entry belongs to a logbook, and a spreadsheet doesn&apos;t say which.
          </span>
          <select
            aria-label="Logbook"
            value={logbookId}
            onChange={(e) => setLogbookId(e.target.value)}
            className={`${select} mt-1 max-w-xs`}
          >
            {logbooks.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="text/csv,.csv,.tsv"
            aria-label="CSV file"
            onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
            className="text-sm text-dim file:mr-3 file:rounded-md file:border file:border-line file:bg-panel2 file:px-3 file:py-1.5 file:text-sm file:text-ink"
          />
          <button onClick={() => run("analyze")} disabled={!file || !logbookId || busy} className={btn}>
            {busy && !analysis ? "Reading columns…" : "Read the columns"}
          </button>
        </div>
        <p className="text-xs text-faint">
          CSV only (up to 5 MB / 5,000 rows). Any spreadsheet saves as CSV in one step.
        </p>
      </section>

      {error && <p className="text-sm text-annun-red">{error}</p>}

      {/* Step 2 — confirm the mapping */}
      {analysis && (
        <section className="panel flex flex-col gap-3 p-4">
          <div>
            <h2 className="text-sm font-semibold text-ink">Check what each column means</h2>
            <p className="mt-0.5 text-xs text-faint">
              {analysis.rowCount} rows · {analysis.header.length} columns ·{" "}
              {DELIM_LABEL[analysis.delimiter] ?? "custom"}-separated. Correct anything that&apos;s
              wrong — this mapping is then applied to every row identically.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-faint">
                  <th className="py-1.5 pr-3 font-medium">Column</th>
                  <th className="py-1.5 pr-3 font-medium">First value</th>
                  <th className="py-1.5 font-medium">Import as</th>
                </tr>
              </thead>
              <tbody>
                {analysis.header.map((h, i) => {
                  const conf = analysis.columns[i]?.confidence ?? 0;
                  const low = mapping[i] !== "ignore" && conf < 0.75;
                  return (
                    <tr key={`${h}-${i}`} className="border-b border-line/60">
                      <td className="py-1.5 pr-3 align-top">
                        <span className="font-medium text-ink">{h || <em className="text-faint">unnamed</em>}</span>
                        {low && (
                          <span className="ml-1.5 readout rounded px-1 text-[10px] text-annun-amber" style={{ background: "var(--amb-bg)" }}>
                            {Math.round(conf * 100)}%
                          </span>
                        )}
                      </td>
                      <td className="max-w-[12rem] truncate py-1.5 pr-3 align-top text-dim">
                        {analysis.sampleRows[0]?.[i] ?? ""}
                      </td>
                      <td className="py-1.5 align-top">
                        <select
                          aria-label={`Import "${h}" as`}
                          value={mapping[i] ?? "ignore"}
                          onChange={(e) => setColumn(i, e.target.value as ImportField)}
                          className={select}
                        >
                          {IMPORT_FIELDS.map((f) => (
                            <option key={f} value={f}>{FIELD_LABEL[f]}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Dates: only ever asked about when EVERY row reads both ways. */}
          {dates?.kind === "ambiguous" && (
            <div className="rounded-md border border-annun-amber/40 px-3 py-2.5 text-xs text-annun-amber" style={{ background: "var(--amb-bg)" }}>
              <p className="font-medium">Which way round are these dates?</p>
              <p className="mt-0.5">
                Every date in this file reads both ways, so we can&apos;t tell. Getting it wrong
                shifts maintenance dates by up to eleven months.
              </p>
              <div className="mt-2 flex flex-col gap-1">
                {dates.samples.slice(0, 3).map((s) => (
                  <div key={s.raw} className="readout text-[11px]">
                    <span className="text-ink">{s.raw}</span> → {s.mdy} (month/day) or {s.dmy} (day/month)
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                {(["mdy", "dmy"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => { setDateFormat(f); setPreview(null); }}
                    aria-pressed={dateFormat === f}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                      dateFormat === f ? "border-accent bg-accent text-bg" : "border-annun-amber/60 text-annun-amber"
                    }`}
                  >
                    {f === "mdy" ? "Month/day/year (US)" : "Day/month/year"}
                  </button>
                ))}
              </div>
            </div>
          )}
          {dates?.kind === "resolved" && (
            <p className="text-xs text-faint">
              Dates read as{" "}
              {dates.format === "iso" ? "YYYY-MM-DD" : dates.format === "mdy" ? "month/day/year" : "day/month/year"}
              {dates.format !== "iso" && " — settled by a day past the 12th somewhere in the file, not guessed"}.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => run("preview")}
              disabled={busy || (dates?.kind === "ambiguous" && !dateFormat)}
              className={btn}
            >
              {busy ? "Checking…" : "Check what will be created"}
            </button>
          </div>
        </section>
      )}

      {/* Step 3 — the count, before anything is written */}
      {preview && (
        <section className="panel flex flex-col gap-3 p-4">
          <h2 className="text-sm font-semibold text-ink">
            {preview.willCreate} {preview.willCreate === 1 ? "entry" : "entries"} will be created
          </h2>
          {preview.skipped > 0 && (
            <details className="text-xs text-dim">
              {/* One text node: an expression that renders "" between two
                  literals eats the space around it. */}
              <summary className="cursor-pointer text-annun-amber">
                {`${preview.skipped} row${preview.skipped === 1 ? "" : "s"} can't be read and will be skipped`}
              </summary>
              <ul className="mt-1.5 flex flex-col gap-0.5">
                {preview.errors.map((e) => (
                  <li key={e.row} className="readout text-[11px]">Row {e.row}: {e.message}</li>
                ))}
              </ul>
            </details>
          )}
          {existingEntries > 0 && (
            <p className="text-xs text-faint">
              This aircraft already has {existingEntries} {existingEntries === 1 ? "entry" : "entries"}.
              If some of this file is already in there you&apos;ll get duplicates — the{" "}
              <Link href={`/aircraft/${aircraftId}/duplicates`} className="underline">Fix duplicates</Link>{" "}
              screen is the cleanup.
            </p>
          )}
          <div>
            <button onClick={() => run("import")} disabled={busy || preview.willCreate === 0} className={btn}>
              {busy ? "Importing…" : `Import ${preview.willCreate} ${preview.willCreate === 1 ? "entry" : "entries"}`}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

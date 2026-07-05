"use client";

import { useState } from "react";
import Link from "next/link";
import { SearchIcon } from "@/components/icons";

type Citation = {
  id: string;
  date: string | null;
  label: string;
  snippet: string;
  pageId: string | null;
};

const SUGGESTIONS = [
  "When was the last annual inspection?",
  "When was the engine last overhauled?",
  "What ADs have been complied with?",
  "When was the transponder last certified?",
  "What avionics have been installed?",
];

const TRUST_POINTS = [
  <>
    Answers only from <b className="text-ink">your</b> extracted entries — never the open
    internet.
  </>,
  <>
    Every claim links back to the <b className="text-ink">source entry</b> you can open.
  </>,
  <>Still an index — the paper logbook stays the record.</>,
];

export function AskClient({
  aircraftId,
  configured,
}: {
  aircraftId: string;
  configured: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState<string | null>(null);

  async function ask(q: string) {
    const query = q.trim();
    if (!query || busy) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    setCitations([]);
    setAsked(query);
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: query }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "The request failed.");
        return;
      }
      setAnswer(data.answer ?? "");
      setCitations(data.citations ?? []);
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  if (!configured) {
    return (
      <p className="rounded-lg border border-dashed border-line px-5 py-8 text-center text-sm text-faint">
        AI Q&amp;A needs <code>ANTHROPIC_API_KEY</code> configured on the server.
      </p>
    );
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_300px]">
      <div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
          className="mb-3.5 flex gap-2.5"
        >
          <div className="flex flex-1 items-center gap-2.5 rounded-[10px] border border-line2 bg-panel px-3.5 py-2.5">
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px] border-faint"
            />
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. When was the last annual?"
              aria-label="Ask a question about this aircraft's logbook"
              className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
            />
          </div>
          <button
            type="submit"
            disabled={busy || !question.trim()}
            className="inline-flex items-center gap-1.5 rounded-[10px] bg-accent px-[18px] text-[13.5px] font-semibold text-bg hover:opacity-90 disabled:opacity-50"
          >
            <SearchIcon />
            {busy ? "Asking…" : "Ask"}
          </button>
        </form>

        <div className="mb-[22px] flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setQuestion(s);
                ask(s);
              }}
              disabled={busy}
              className="rounded-full border border-line px-3 py-1 text-xs text-dim hover:border-line2 hover:text-ink disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>

        {error && <p className="mb-3 text-sm text-annun-red">{error}</p>}

        {busy && (
          <p className="mb-3 text-sm text-faint">
            Reading {asked ? `for “${asked}”` : "your entries"}…
          </p>
        )}

        {answer != null && !busy && (
          <section className="flex flex-col gap-[18px]">
            <div className="panel-raised rounded-[14px] p-5">
              {asked && <div className="mb-2.5 text-[11px] text-accent">{asked}</div>}
              <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-ink">
                {answer}
              </p>
            </div>

            {citations.length > 0 && (
              <div>
                <div className="eyebrow mb-2.5">Cited entries</div>
                <ul className="flex flex-col gap-2">
                  {citations.map((c) => {
                    const body = (
                      <div
                        className="flex gap-3.5 rounded-[10px] border border-line bg-panel px-4 py-3.5"
                        style={{ borderLeft: "2px solid var(--accent)" }}
                      >
                        <div className="w-[78px] shrink-0">
                          <div className="readout text-xs text-dim">{c.date ?? "undated"}</div>
                          <div className="mt-0.5 text-[10.5px] text-faint">{c.label}</div>
                        </div>
                        <div className="flex-1 text-[12.5px] leading-relaxed text-dim">
                          {c.snippet}
                        </div>
                      </div>
                    );
                    return (
                      <li key={c.id}>
                        {c.pageId ? (
                          <Link
                            href={`/aircraft/${aircraftId}/pages/${c.pageId}/review`}
                            className="block transition hover:opacity-80"
                          >
                            {body}
                          </Link>
                        ) : (
                          body
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <p className="text-[11px] leading-relaxed text-faint">
              AI answers can be wrong — confirm against the physical logbook before
              relying on any date, hour, or compliance claim.
            </p>
          </section>
        )}
      </div>

      <div className="panel sticky top-20 p-4">
        <div className="eyebrow mb-3">Why it&apos;s trustworthy</div>
        <div className="flex flex-col gap-3">
          {TRUST_POINTS.map((point, i) => (
            <div key={i} className="flex gap-2.5">
              <span className="text-[13px] text-accent">◆</span>
              <span className="text-xs leading-relaxed text-dim">{point}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

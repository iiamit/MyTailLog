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
      <p className="rounded-lg border border-dashed border-slate-300 px-5 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        AI Q&amp;A needs <code>ANTHROPIC_API_KEY</code> configured on the server.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="flex gap-2"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. When was the last annual?"
          className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        <button
          type="submit"
          disabled={busy || !question.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
        >
          <SearchIcon />
          {busy ? "Asking…" : "Ask"}
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => {
              setQuestion(s);
              ask(s);
            }}
            disabled={busy}
            className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:border-slate-500 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
          >
            {s}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {busy && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Reading {asked ? `for “${asked}”` : "your entries"}…
        </p>
      )}

      {answer != null && !busy && (
        <section className="flex flex-col gap-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            {asked && (
              <p className="mb-1 text-xs font-medium text-slate-400 dark:text-slate-500">
                {asked}
              </p>
            )}
            <p className="whitespace-pre-wrap text-sm">{answer}</p>
          </div>

          {citations.length > 0 && (
            <div>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Cited entries
              </h2>
              <ul className="flex flex-col gap-2">
                {citations.map((c) => {
                  const body = (
                    <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                      <div className="mb-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-medium">{c.date ?? "undated"}</span>
                        <span>· {c.label}</span>
                      </div>
                      <p className="line-clamp-2 text-slate-700 dark:text-slate-200">{c.snippet}</p>
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

          <p className="text-xs text-slate-400 dark:text-slate-500">
            AI answers can be wrong — confirm against the physical logbook before
            relying on any date, hour, or compliance claim.
          </p>
        </section>
      )}
    </div>
  );
}

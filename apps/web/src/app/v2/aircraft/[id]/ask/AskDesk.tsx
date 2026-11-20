"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Leaf, Leaves, SourceMat } from "@/ui/Board";
import { buttonClass } from "@/ui/Button";
import { fieldClass } from "@/ui/Form";

type Citation = { id: string; date: string | null; label: string; snippet: string; pageId: string | null };
type Match = { id: string; entry_date: string | null; description: string | null; work_performed: string | null };
const SUGGESTIONS = [
  "When was the last annual inspection?",
  "When was the engine last overhauled?",
  "What ADs have been complied with?",
  "When was the transponder last certified?",
  "What avionics have been installed?",
];

export function AskDesk({ aircraftId, initialQuestion }: { aircraftId: string; initialQuestion: string }) {
  const [question, setQuestion] = useState(initialQuestion);
  const [asked, setAsked] = useState("");
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState<Citation[]>([]);
  const [selected, setSelected] = useState<Citation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [searchError, setSearchError] = useState("");
  const [searching, setSearching] = useState(Boolean(initialQuestion.trim()));
  const opened = useRef(false);
  const a = `/aircraft/${aircraftId}`;

  useEffect(() => {
    const q = question.trim();
    if (!q) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data, error } = await createClient().rpc("search_log_entries", { target_aircraft: aircraftId, q })
        .eq("owner_confirmed", true).limit(20);
      if (cancelled) return;
      setMatches((data ?? []) as Match[]);
      setSearchError(error?.message ?? "");
      setSearching(false);
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [aircraftId, question]);

  const ask = useCallback(async (raw: string) => {
    const q = raw.trim();
    if (!q || busy) return;
    setQuestion(q); setAsked(q); setBusy(true); setError(""); setAnswer(""); setCitations([]); setSelected(null); setMatches([]); setSearchError(""); setSearching(true);
    try {
      const response = await fetch(`/api/aircraft/${aircraftId}/ask`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The reader could not answer. Try again.");
      const sources: Citation[] = result.citations ?? [];
      setAnswer(result.answer ?? ""); setCitations(sources); setSelected(sources.find((c) => c.pageId) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reach the reader. Try again.");
    } finally { setBusy(false); }
  }, [aircraftId, busy]);

  useEffect(() => {
    if (opened.current || !initialQuestion.trim()) return;
    if (/^(who|what|when|where|why|how|which|did|has|is|was|were|does)\b|\?$/i.test(initialQuestion.trim())) {
      const timer = setTimeout(() => { opened.current = true; void ask(initialQuestion); }, 0);
      return () => clearTimeout(timer);
    }
  }, [ask, initialQuestion]);

  return <Leaves split="1.6fr 1fr">
    <Leaf label="Ask your logbook">
      <form onSubmit={(e) => { e.preventDefault(); void ask(question); }} className="flex flex-wrap items-end gap-2">
        <label className="min-w-[220px] flex-1 text-label">Search the logbooks, or ask a question
          <input className={fieldClass} type="search" maxLength={2000} value={question} onChange={(e) => { setQuestion(e.target.value); setMatches([]); setSearchError(""); setSearching(Boolean(e.target.value.trim())); }} placeholder="When was the last annual inspection?" />
        </label>
        <button className={buttonClass("primary")} type="submit" disabled={busy || !question.trim()}>{busy ? "Reading…" : "Ask"}</button>
      </form>
      <p className="mt-2 text-small text-ink-3">Answers come only from confirmed entries. Check the source page before relying on a date or hour.</p>
      <div className="mt-4 flex flex-wrap gap-2" aria-label="Suggested questions">
        {SUGGESTIONS.map((q) => <button key={q} type="button" disabled={busy} onClick={() => void ask(q)} className="state-layer rounded-pill border border-control-border px-3 py-1.5 text-small text-ink-2 disabled:opacity-50">{q}</button>)}
      </div>
      {error && <p role="alert" className="mt-5 text-body text-alarm-text">{error} Search still works in the <Link className="underline" href={`${a}/logbooks/list`}>entries list</Link>.</p>}
      {busy && <p role="status" className="mt-6 text-body">Reading for “{asked}”…</p>}
      {answer && <section aria-label="Answer" className="mt-6 border-t-2 border-ink pt-4">
        <h2 className="text-heading">Answer</h2>
        <p className="mt-2 whitespace-pre-wrap text-body text-ink-2">{answer}</p>
        {citations.length > 0 && <><h3 className="mt-5 text-section">Source entries</h3><ul className="mt-2 space-y-2">{citations.map((c) => <li key={c.id}>
          <button type="button" onClick={() => setSelected(c)} className="state-layer w-full rounded-control border border-control-border p-3 text-left" aria-pressed={selected?.id === c.id}>
            <span className="text-label">{c.label} · {c.date ?? "Undated"}</span><span className="mt-1 block text-small text-ink-2">{c.snippet}</span>
          </button>
          <Link href={`${a}/logbooks/entries/${c.id}`} className="mt-1 inline-block text-small text-board-ink underline">Open entry</Link>
        </li>)}</ul></>}
      </section>}
      {question.trim() && searchError && <p role="alert" className="mt-4 text-small text-alarm-text">Couldn&apos;t search entries: {searchError}</p>}
      {question.trim() && !searchError && <section aria-label="Matching entries" className="mt-6 border-t border-rule pt-4">
        <h2 className="text-heading">Matching entries</h2>
        {searching ? <p role="status" className="mt-2 text-small text-ink-3">Searching confirmed entries…</p> : matches.length ? <ul className="mt-2 space-y-2">{matches.map((m) => <li key={m.id}><Link href={`${a}/logbooks/entries/${m.id}`} className="block rounded-control border border-control-border p-3 text-small hover:bg-leaf-2"><strong>{m.entry_date ?? "Undated"}</strong><span className="mt-1 block text-ink-2">{(m.description || m.work_performed || "Entry").slice(0, 220)}</span></Link></li>)}</ul> : <p className="mt-2 text-small text-ink-3">No confirmed entries match these words.</p>}
      </section>}
      <Link href={`${a}/logbooks/list${question.trim() ? `?q=${encodeURIComponent(question.trim())}` : ""}`} className="mt-6 inline-block text-small font-semibold text-board-ink underline">Search matching entries instead</Link>
    </Leaf>
    {selected?.pageId ? <SourceMat title={`${selected.label} · ${selected.date ?? "Undated"}`} meta="Read the original page before relying on this answer.">
      {/* eslint-disable-next-line @next/next/no-img-element -- per-user image endpoint */}
      <img src={`/api/page/${selected.pageId}/image`} alt={`Original scanned page cited by ${selected.label}`} className="w-full rounded-control" />
      <Link href={`${a}/logbooks/entries/${selected.id}`} className={buttonClass("on-mat")}>Open entry</Link>
    </SourceMat> : <SourceMat title="Source page"><p className="m-auto text-body text-on-cover-2">Ask a question, then select a cited entry to inspect its page.</p></SourceMat>}
  </Leaves>;
}

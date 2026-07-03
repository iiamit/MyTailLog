"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { exploreApplicableADs, trackCandidate, type CandidateAd } from "./actions";

export function ExploreClient({
  aircraftId,
  suggestedMakes,
}: {
  aircraftId: string;
  suggestedMakes: string[];
}) {
  const router = useRouter();
  const [extra, setExtra] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [terms, setTerms] = useState<string[] | null>(null);
  const [candidates, setCandidates] = useState<CandidateAd[]>([]);
  const [tracked, setTracked] = useState<Set<string>>(new Set());

  async function run() {
    setLoading(true);
    setError(null);
    const extraTerms = extra.split(",").map((s) => s.trim()).filter(Boolean);
    const res = await exploreApplicableADs(aircraftId, extraTerms);
    setLoading(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setTerms(res.terms);
    setCandidates(res.candidates);
  }

  async function track(ad: CandidateAd) {
    if (!ad.adNumber) return;
    setTracked((prev) => new Set(prev).add(ad.adNumber!));
    const res = await trackCandidate(aircraftId, ad.adNumber);
    if ("error" in res) {
      setError(res.error);
      setTracked((prev) => {
        const next = new Set(prev);
        next.delete(ad.adNumber!);
        return next;
      });
    } else {
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm">
          Manufacturers to search:{" "}
          {suggestedMakes.length > 0 ? (
            <span className="font-medium">{suggestedMakes.join(", ")}</span>
          ) : (
            <span className="text-slate-500">
              none yet — set the aircraft make or add equipment with a manufacturer
            </span>
          )}
        </p>
        <label className="mt-3 block text-xs font-medium text-slate-600 dark:text-slate-300">
          Additional terms (optional, comma-separated)
          <input
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder="Lycoming, Hartzell, Garmin…"
            className="mt-1 w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>
        <button
          onClick={run}
          disabled={loading}
          className="mt-3 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          {loading ? "Searching Federal Register…" : "Find candidate ADs"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {terms !== null && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {candidates.length} candidate AD{candidates.length === 1 ? "" : "s"} for{" "}
          {terms.join(", ")} (excluding ones you already track).
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {candidates.map((ad) => (
          <li
            key={ad.documentNumber}
            className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] font-medium text-white dark:bg-slate-700">
                AD
              </span>
              <span className="font-semibold">{ad.adNumber}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {ad.term}
              </span>
              {ad.effectiveOn && (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  effective {ad.effectiveOn}
                </span>
              )}
            </div>
            {ad.title && <p className="mt-1 text-sm">{ad.title}</p>}
            {ad.abstract && (
              <p className="mt-1 line-clamp-3 text-xs text-slate-500 dark:text-slate-400">
                {ad.abstract}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                onClick={() => track(ad)}
                disabled={!ad.adNumber || (ad.adNumber ? tracked.has(ad.adNumber) : false)}
                className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
              >
                {ad.adNumber && tracked.has(ad.adNumber) ? "Tracking ✓" : "Track this AD"}
              </button>
              {ad.htmlUrl && (
                <a href={ad.htmlUrl} target="_blank" rel="noreferrer" className="text-xs text-sky-600 underline dark:text-sky-400">
                  Federal Register ↗
                </a>
              )}
              {ad.pdfUrl && (
                <a href={ad.pdfUrl} target="_blank" rel="noreferrer" className="text-xs text-sky-600 underline dark:text-sky-400">
                  PDF ↗
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

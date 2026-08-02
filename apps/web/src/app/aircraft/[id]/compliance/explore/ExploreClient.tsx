"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { searchADs, type FaaAd } from "@/lib/faa/federalRegister";
import { extractModels, matchedModels } from "@/lib/faa/applicability";
import {
  getExploreTargets,
  trackCandidate,
  type CandidateAd,
  type TrackOptions,
} from "./actions";

const inputClass =
  "mt-1 w-full rounded-md border border-line bg-panel2 px-2.5 py-1.5 text-sm text-ink outline-hidden focus:border-accent";

const ONE_TIME: TrackOptions = {
  recurring: false,
  intervalHours: null,
  intervalMonths: null,
  nextDueDate: null,
  nextDueHours: null,
};

type Draft = {
  recurring: boolean;
  intervalHours: string;
  intervalMonths: string;
  nextDueDate: string;
  nextDueHours: string;
};

const EMPTY_DRAFT: Draft = {
  recurring: true,
  intervalHours: "",
  intervalMonths: "",
  nextDueDate: "",
  nextDueHours: "",
};

export function ExploreClient({
  aircraftId,
  suggestedMakes,
  aircraftModel,
}: {
  aircraftId: string;
  suggestedMakes: string[];
  aircraftModel: string;
}) {
  const router = useRouter();
  const [model, setModel] = useState(aircraftModel);
  const [extra, setExtra] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [candidates, setCandidates] = useState<CandidateAd[]>([]);
  const [tracked, setTracked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [openDraft, setOpenDraft] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  async function run() {
    setLoading(true);
    setError(null);
    const keywords = extra.split(",").map((s) => s.trim()).filter(Boolean);
    // The server resolves the terms, the already-tracked numbers, and the DRS
    // hits (DRS needs a server-side session and isn't CORS-enabled)…
    const res = await getExploreTargets(aircraftId, { model, keywords });
    if ("error" in res) {
      setLoading(false);
      setError(res.error);
      return;
    }
    // …but the Federal Register fetch runs here in the browser (the datacenter
    // egress IP is 403'd by GPO's origin; the FR API is CORS-enabled).
    const trackedSet = new Set(res.tracked);
    const byNumber = new Map<string, CandidateAd>();
    let frFailures = 0;
    try {
      for (const { term, kind } of res.terms) {
        let ads: FaaAd[] = [];
        try {
          ({ ads } = await searchADs(term, { perPage: 40 }));
        } catch {
          frFailures++;
          continue; // one bad term shouldn't sink the whole explore
        }
        for (const ad of ads) {
          if (!ad.adNumber) continue;
          const key = ad.adNumber.replace(/\s+/g, "").toLowerCase();
          if (trackedSet.has(key) || byNumber.has(key)) continue;
          const models = extractModels(ad.title, ad.abstract);
          byNumber.set(key, {
            ...ad,
            term,
            kind,
            source: "federal_register",
            models,
            matched: matchedModels(models, res.model ?? model),
            documentStatus: null,
          });
        }
      }
    } finally {
      setLoading(false);
    }
    // DRS fills in what the FR archive can't hold: pre-1994 legacy ADs. The FR
    // copy wins on a duplicate — it carries the abstract and the official links.
    for (const ad of res.drs) {
      const key = (ad.adNumber ?? "").replace(/\s+/g, "").toLowerCase();
      if (key && !byNumber.has(key)) byNumber.set(key, ad);
    }

    if (frFailures === res.terms.length && res.drs.length === 0) {
      setError("Couldn't reach the Federal Register or DRS just now — try again.");
    }
    setSearched(true);
    setCandidates(
      [...byNumber.values()].sort(
        (a, b) =>
          // ADs that name this aircraft's model float to the top.
          (b.matched.length ? 1 : 0) - (a.matched.length ? 1 : 0) ||
          (b.effectiveOn ?? "").localeCompare(a.effectiveOn ?? ""),
      ),
    );
  }

  async function track(ad: CandidateAd, options: TrackOptions) {
    if (!ad.adNumber) return;
    const number = ad.adNumber;
    setBusy(number);
    setError(null);
    const res = await trackCandidate(aircraftId, ad, options);
    setBusy(null);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setTracked((prev) => new Set(prev).add(number));
    setOpenDraft(null);
    setDraft(EMPTY_DRAFT);
    router.refresh();
  }

  const matchCount = candidates.filter((c) => c.matched.length > 0).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="panel p-4">
        <p className="text-sm">
          Manufacturers to search:{" "}
          {suggestedMakes.length > 0 ? (
            <span className="font-medium">{suggestedMakes.join(", ")}</span>
          ) : (
            <span className="text-faint">
              none yet — set the aircraft make or add equipment with a manufacturer
            </span>
          )}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-dim">
            Model
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="172N"
              className={inputClass}
            />
            <span className="mt-1 block text-[11px] text-faint">
              Searched on its own and with the make — and used to flag results
              that name your variant.
            </span>
          </label>
          <label className="block text-xs font-medium text-dim">
            Keywords (optional, comma-separated)
            <input
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="fuel selector, Hartzell, seat rail…"
              className={inputClass}
            />
            <span className="mt-1 block text-[11px] text-faint">
              Free text — a part, a system, or another manufacturer.
            </span>
          </label>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="mt-3 rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Searching FAA sources…" : "Find candidate ADs"}
        </button>
      </div>

      {error && <p className="text-sm text-annun-red">{error}</p>}

      {searched && (
        <p className="text-sm text-faint">
          {candidates.length} candidate AD{candidates.length === 1 ? "" : "s"}{" "}
          (excluding ones you already track)
          {model.trim() && (
            <>
              {" "}
              — <span className="text-ink">{matchCount}</span> name a model
              matching <span className="text-ink">{model.trim()}</span>
            </>
          )}
          . A candidate is a lead to check, not a determination that it applies.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {candidates.map((ad) => {
          const number = ad.adNumber ?? "";
          const isTracked = tracked.has(number);
          return (
            <li key={`${ad.source}:${ad.documentNumber}`} className="panel p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-sm bg-panel2 px-1.5 py-0.5 text-[11px] font-medium text-ink">
                  AD
                </span>
                <span className="font-semibold">{ad.adNumber}</span>
                <span className="rounded-full bg-panel2 px-2 py-0.5 text-xs text-dim">
                  {ad.term}
                </span>
                {ad.source === "drs" && (
                  <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-faint">
                    DRS legacy{ad.documentStatus ? ` · ${ad.documentStatus}` : ""}
                  </span>
                )}
                {ad.matched.length > 0 && (
                  <span className="rounded-full border border-accent/40 px-2 py-0.5 text-[11px] font-medium text-accent">
                    names your model
                  </span>
                )}
                {ad.effectiveOn && (
                  <span className="text-xs text-faint">effective {ad.effectiveOn}</span>
                )}
              </div>
              {ad.title && <p className="mt-1 text-sm">{ad.title}</p>}
              {ad.abstract && (
                <p className="mt-1 line-clamp-3 text-xs text-faint">{ad.abstract}</p>
              )}

              <div className="mt-2 text-xs">
                <span className="text-faint">Models named: </span>
                {ad.models.length > 0 ? (
                  <span className="inline-flex flex-wrap gap-1 align-middle">
                    {ad.models.map((m) => (
                      <span
                        key={m}
                        className={
                          ad.matched.includes(m)
                            ? "rounded-sm border border-accent/40 bg-panel2 px-1.5 py-0.5 font-medium text-accent"
                            : "rounded-sm bg-panel2 px-1.5 py-0.5 text-dim"
                        }
                      >
                        {m}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="text-faint">
                    none parsed — read the AD&apos;s applicability paragraph
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => track(ad, ONE_TIME)}
                  disabled={!number || isTracked || busy === number}
                  className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-bg hover:opacity-90 disabled:opacity-50"
                >
                  {isTracked ? "Tracking ✓" : busy === number ? "Tracking…" : "Track this AD"}
                </button>
                {!isTracked && (
                  <button
                    onClick={() => {
                      setDraft(EMPTY_DRAFT);
                      setOpenDraft(openDraft === number ? null : number);
                    }}
                    className="text-xs text-accent underline hover:opacity-80"
                  >
                    {openDraft === number ? "Cancel" : "Track with an interval…"}
                  </button>
                )}
                {ad.htmlUrl && (
                  <a
                    href={ad.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-accent underline hover:opacity-80"
                  >
                    {ad.source === "drs" ? "DRS ↗" : "Federal Register ↗"}
                  </a>
                )}
                {ad.pdfUrl && (
                  <a
                    href={ad.pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-accent underline hover:opacity-80"
                  >
                    PDF ↗
                  </a>
                )}
              </div>

              {openDraft === number && (
                <div className="mt-3 rounded-md border border-line bg-panel2 p-3">
                  <div className="flex flex-wrap gap-4 text-xs font-medium text-dim">
                    <label className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        checked={!draft.recurring}
                        onChange={() => setDraft({ ...draft, recurring: false })}
                      />
                      One-time
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        checked={draft.recurring}
                        onChange={() => setDraft({ ...draft, recurring: true })}
                      />
                      Recurring
                    </label>
                  </div>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {draft.recurring && (
                      <>
                        <label className="text-xs font-medium text-dim">
                          Interval (hours)
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={draft.intervalHours}
                            onChange={(e) =>
                              setDraft({ ...draft, intervalHours: e.target.value })
                            }
                            className={inputClass}
                          />
                        </label>
                        <label className="text-xs font-medium text-dim">
                          Interval (months)
                          <input
                            type="number"
                            min="0"
                            value={draft.intervalMonths}
                            onChange={(e) =>
                              setDraft({ ...draft, intervalMonths: e.target.value })
                            }
                            className={inputClass}
                          />
                        </label>
                      </>
                    )}
                    <label className="text-xs font-medium text-dim">
                      Next due (date)
                      <input
                        type="date"
                        value={draft.nextDueDate}
                        onChange={(e) => setDraft({ ...draft, nextDueDate: e.target.value })}
                        className={inputClass}
                      />
                    </label>
                    <label className="text-xs font-medium text-dim">
                      Next due (hours)
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={draft.nextDueHours}
                        onChange={(e) => setDraft({ ...draft, nextDueHours: e.target.value })}
                        className={inputClass}
                      />
                    </label>
                  </div>
                  <p className="mt-2 text-[11px] text-faint">
                    Read these off the AD. Once you record compliance on the
                    compliance page, next-due is recomputed from the interval.
                  </p>
                  <button
                    onClick={() =>
                      track(ad, {
                        recurring: draft.recurring,
                        intervalHours: draft.intervalHours ? Number(draft.intervalHours) : null,
                        intervalMonths: draft.intervalMonths
                          ? Number(draft.intervalMonths)
                          : null,
                        nextDueDate: draft.nextDueDate || null,
                        nextDueHours: draft.nextDueHours ? Number(draft.nextDueHours) : null,
                      })
                    }
                    disabled={busy === number}
                    className="mt-2 rounded-md bg-accent px-3 py-1 text-xs font-medium text-bg hover:opacity-90 disabled:opacity-50"
                  >
                    {busy === number ? "Tracking…" : "Track with these"}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

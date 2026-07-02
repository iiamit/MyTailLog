"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { FormattedEntry } from "@/components/FormattedEntry";
import { ZoomableImage } from "@/components/ZoomableImage";
import { LOGBOOK_TYPES, LOGBOOK_LABEL } from "@/lib/logbooks";

export type TimelineEntry = {
  id: string;
  pageId: string | null;
  logbookId: string;
  logbookLabel: string;
  logbookType: string;
  entryDate: string | null;
  hobbs: number | null;
  tach: number | null;
  description: string | null;
  workPerformed: string | null;
  parts: string | null;
  adRefs: string[];
  sbRefs: string[];
  confidence: number | null;
  ownerConfirmed: boolean;
  thumbnailUrl: string | null;
};

export type LogbookMeta = { label: string; type: string };

const TYPE_COLOR: Record<string, string> = {
  airframe: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  engine: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  prop: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  avionics: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
};
const typeColor = (t: string) =>
  TYPE_COLOR[t] ?? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";

function EntryRow({
  aircraftId,
  e,
}: {
  aircraftId: string;
  e: TimelineEntry;
}) {
  const refs = [...e.adRefs.map((r) => `AD ${r}`), ...e.sbRefs.map((r) => `SB ${r}`)];
  // Prefer the description; append work_performed if it adds detail.
  const body =
    e.description && e.workPerformed && e.workPerformed.trim() !== e.description.trim()
      ? `${e.description}\n${e.workPerformed}`
      : e.description || e.workPerformed || null;
  return (
    <li className="flex gap-3 px-4 py-3">
      {e.thumbnailUrl ? (
        <ZoomableImage
          src={e.thumbnailUrl}
          alt={`${e.logbookLabel} page`}
          className="h-14 w-14 shrink-0 rounded border border-slate-200 object-cover dark:border-slate-700"
        />
      ) : (
        <div className="h-14 w-14 shrink-0 rounded bg-slate-100 dark:bg-slate-800" />
      )}
      <div className="w-20 shrink-0 text-sm text-slate-500 dark:text-slate-400">
        {e.entryDate ?? "undated"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs ${typeColor(e.logbookType)}`}>
            {e.logbookLabel}
          </span>
          {e.ownerConfirmed ? (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">✓ confirmed</span>
          ) : e.confidence != null ? (
            <span className="text-xs text-slate-400">
              {Math.round(e.confidence * 100)}% · unconfirmed
            </span>
          ) : null}
          {(e.hobbs != null || e.tach != null) && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {e.hobbs != null ? `Hobbs ${e.hobbs}` : ""}
              {e.hobbs != null && e.tach != null ? " · " : ""}
              {e.tach != null ? `Tach ${e.tach}` : ""}
            </span>
          )}
        </div>
        {body ? (
          <FormattedEntry text={body} />
        ) : (
          <p className="text-sm italic text-slate-400">no description</p>
        )}
        {refs.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {refs.map((r) => (
              <span
                key={r}
                className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              >
                {r}
              </span>
            ))}
          </div>
        )}
      </div>
      {e.pageId && (
        <Link
          href={`/aircraft/${aircraftId}/pages/${e.pageId}/review`}
          className="shrink-0 self-start text-xs text-slate-500 underline hover:text-slate-700 dark:text-slate-400"
        >
          source
        </Link>
      )}
    </li>
  );
}

function yearOf(e: TimelineEntry): string {
  return e.entryDate ? e.entryDate.slice(0, 4) : "Undated";
}

export function TimelineClient({
  aircraftId,
  entries,
  logbookMap,
  thumbnailByPageId,
}: {
  aircraftId: string;
  entries: TimelineEntry[];
  logbookMap: Record<string, LogbookMeta>;
  thumbnailByPageId: Record<string, string>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TimelineEntry[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced full-text search via the search_log_entries RPC (uses the FTS
  // index under RLS). Empty query falls back to the full timeline.
  useEffect(() => {
    const q = query.trim();
    if (q === "") {
      setResults(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("search_log_entries", {
        target_aircraft: aircraftId,
        q,
      });
      if (cancelled) return;
      setSearching(false);
      if (error) {
        setError(error.message);
        setResults([]);
        return;
      }
      setError(null);
      setResults(
        (data ?? []).map((r) => ({
          id: r.id,
          pageId: r.page_id,
          logbookId: r.logbook_id,
          logbookLabel: logbookMap[r.logbook_id]?.label ?? "Logbook",
          logbookType: logbookMap[r.logbook_id]?.type ?? "",
          entryDate: r.entry_date,
          hobbs: r.hobbs,
          tach: r.tach,
          description: r.description,
          workPerformed: r.work_performed,
          parts: r.parts,
          adRefs: r.ad_refs ?? [],
          sbRefs: r.sb_refs ?? [],
          confidence: r.confidence,
          ownerConfirmed: r.owner_confirmed,
          thumbnailUrl: r.page_id ? thumbnailByPageId[r.page_id] ?? null : null,
        })),
      );
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, aircraftId, logbookMap, thumbnailByPageId]);

  // Logbook types present in the data, in canonical order, for the filter row.
  const availableTypes = useMemo(
    () => LOGBOOK_TYPES.filter((t) => entries.some((e) => e.logbookType === t)),
    [entries],
  );
  // Which types are currently shown (default: all).
  const [activeTypes, setActiveTypes] = useState<Set<string>>(
    () => new Set(availableTypes),
  );
  const toggleType = (t: string) =>
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const searchActive = results !== null;
  const shown = (results ?? entries).filter((e) => activeTypes.has(e.logbookType));

  // Group consecutively by year (entries arrive date-desc).
  const groups: { year: string; items: TimelineEntry[] }[] = [];
  for (const e of shown) {
    const y = yearOf(e);
    const last = groups[groups.length - 1];
    if (last && last.year === y) last.items.push(e);
    else groups.push({ year: y, items: [e] });
  }

  // Collapse older years: the first (most recent) group is expanded, prior
  // years collapsed until clicked. `toggledYears` holds years the user flipped
  // from their default, so filtering never leaves everything collapsed. While
  // searching, expand everything so results show.
  const [toggledYears, setToggledYears] = useState<Set<string>>(new Set());
  const toggleYear = (y: string) =>
    setToggledYears((prev) => {
      const next = new Set(prev);
      if (next.has(y)) next.delete(y);
      else next.add(y);
      return next;
    });
  // index 0 (most recent) defaults open; a toggle flips the default.
  const isExpanded = (index: number, y: string) =>
    searchActive || (index === 0) !== toggledYears.has(y);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search entries — e.g. oil change, magneto, AD 2015-19-07"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {searchActive
            ? searching
              ? "Searching…"
              : `${shown.length} result${shown.length === 1 ? "" : "s"} for “${query.trim()}”`
            : `${shown.length} entr${shown.length === 1 ? "y" : "ies"}${
                activeTypes.size < availableTypes.length ? " (filtered)" : " across all logbooks"
              }`}
          {error && <span className="text-red-600 dark:text-red-400"> · {error}</span>}
        </p>
      </div>

      {/* Logbook-type filter toggles */}
      {availableTypes.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {availableTypes.map((t) => {
            const on = activeTypes.has(t);
            return (
              <button
                key={t}
                onClick={() => toggleType(t)}
                aria-pressed={on}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  on
                    ? `${typeColor(t)} border-transparent`
                    : "border-slate-300 text-slate-400 hover:border-slate-400 dark:border-slate-700 dark:text-slate-500"
                }`}
              >
                {LOGBOOK_LABEL[t as keyof typeof LOGBOOK_LABEL] ?? t}
              </button>
            );
          })}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 px-5 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {searchActive
            ? "No entries match your search."
            : activeTypes.size === 0
              ? "No logbooks selected — enable a filter above."
              : "No entries yet. Extract some pages to build the timeline."}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((g, gi) => {
            const open = isExpanded(gi, g.year);
            return (
              <section key={g.year}>
                <button
                  onClick={() => toggleYear(g.year)}
                  disabled={searchActive}
                  className="flex w-full items-center gap-2 rounded-md py-1 text-left text-sm font-semibold text-slate-600 hover:text-slate-900 disabled:cursor-default dark:text-slate-300 dark:hover:text-slate-100"
                >
                  <span className={`text-xs transition-transform ${open ? "rotate-90" : ""}`}>
                    ▶
                  </span>
                  {g.year}
                  <span className="font-normal text-slate-400 dark:text-slate-500">
                    {g.items.length} {g.items.length === 1 ? "entry" : "entries"}
                  </span>
                </button>
                {open && (
                  <ul className="mt-1 divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                    {g.items.map((e) => (
                      <EntryRow key={e.id} aircraftId={aircraftId} e={e} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

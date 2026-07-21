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
  fullUrl: string | null;
};

export type LogbookMeta = { label: string; type: string };

const TYPE_COLOR: Record<string, string> = {
  airframe: "bg-book-airframe/15 text-book-airframe",
  engine: "bg-book-engine/15 text-book-engine",
  prop: "bg-book-prop/15 text-book-prop",
  avionics: "bg-book-avionics/15 text-book-avionics",
};
const typeColor = (t: string) => TYPE_COLOR[t] ?? "bg-book-other/15 text-book-other";

// Logbook-type accent for the entry's left rail, as a CSS color value.
const BOOK_ACCENT: Record<string, string> = {
  airframe: "var(--book-airframe)",
  engine: "var(--book-engine)",
  prop: "var(--book-prop)",
  avionics: "var(--book-avionics)",
};
const bookAccent = (t: string) => BOOK_ACCENT[t] ?? "var(--book-other)";

function EntryRow({
  aircraftId,
  e,
}: {
  aircraftId: string;
  e: TimelineEntry;
}) {
  const refs = [...e.adRefs.map((r) => `AD ${r}`), ...e.sbRefs.map((r) => `SB ${r}`)];
  // Parts as chips — split the free-text field on common separators, keeping
  // only token-length values (skip whole sentences).
  const partChips = (e.parts ?? "")
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length <= 40)
    .slice(0, 12);
  // Prefer the description; append work_performed if it adds detail.
  const body =
    e.description && e.workPerformed && e.workPerformed.trim() !== e.description.trim()
      ? `${e.description}\n${e.workPerformed}`
      : e.description || e.workPerformed || null;
  return (
    <li className="flex gap-4 border-b border-line py-3.5 last:border-b-0">
      {e.thumbnailUrl ? (
        <ZoomableImage
          src={e.thumbnailUrl}
          fullSrc={e.fullUrl}
          alt={`${e.logbookLabel} page`}
          className="h-12 w-12 shrink-0 rounded-sm border border-line object-cover"
        />
      ) : (
        <div className="h-12 w-12 shrink-0 rounded-sm bg-panel2" />
      )}
      <div className="w-[76px] shrink-0 text-right">
        <div className="readout text-xs text-dim">{e.entryDate ?? "undated"}</div>
        {e.tach != null && (
          <div className="readout mt-[3px] text-[10px] text-faint">tach {e.tach}</div>
        )}
      </div>
      <div
        className="w-0.5 shrink-0 rounded-full opacity-50"
        style={{ background: bookAccent(e.logbookType) }}
      />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] ${typeColor(e.logbookType)}`}>
            {e.logbookLabel}
          </span>
          {e.ownerConfirmed ? (
            <span className="flex items-center gap-1 text-[10.5px] text-annun-green">
              <span className="h-[5px] w-[5px] rounded-full bg-annun-green" />
              confirmed
            </span>
          ) : e.confidence != null ? (
            <span className="readout text-[10.5px] text-faint">
              {Math.round(e.confidence * 100)}% · unconfirmed
            </span>
          ) : null}
          {e.hobbs != null && (
            <span className="readout text-[10.5px] text-dim">Hobbs {e.hobbs}</span>
          )}
        </div>
        {body ? (
          <FormattedEntry text={body} />
        ) : (
          <p className="text-sm italic text-faint">no description</p>
        )}
        {refs.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {refs.map((r) => (
              <span
                key={r}
                className="rounded-sm bg-panel2 px-1.5 py-0.5 text-[11px] text-dim"
              >
                {r}
              </span>
            ))}
          </div>
        )}
        {partChips.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {partChips.map((p, i) => (
              <span
                key={`${p}-${i}`}
                className="rounded-sm bg-accent-soft px-1.5 py-0.5 text-[11px] text-accent"
                title="Part"
              >
                {p}
              </span>
            ))}
          </div>
        )}
      </div>
      {e.pageId && (
        <Link
          href={`/aircraft/${aircraftId}/pages/${e.pageId}/review`}
          className="shrink-0 self-start text-[11px] text-dim underline hover:text-ink"
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
  fullByPageId,
}: {
  aircraftId: string;
  entries: TimelineEntry[];
  logbookMap: Record<string, LogbookMeta>;
  thumbnailByPageId: Record<string, string>;
  fullByPageId: Record<string, string>;
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- debounced search effect: reflect the (empty) query state synchronously
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
          fullUrl: r.page_id ? fullByPageId[r.page_id] ?? null : null,
        })),
      );
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, aircraftId, logbookMap, thumbnailByPageId, fullByPageId]);

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

  // "At a glance" sidebar stats — derived from the full (unfiltered) entry set.
  const stats = useMemo(() => {
    const years = entries
      .map((e) => (e.entryDate ? Number(e.entryDate.slice(0, 4)) : null))
      .filter((y): y is number => y != null && !Number.isNaN(y));
    return {
      total: entries.length,
      span: years.length ? `${Math.min(...years)}–${Math.max(...years)}` : "—",
      logbooks: Object.keys(logbookMap).length,
    };
  }, [entries, logbookMap]);

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_296px]">
      <div>
        {shown.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line py-10 text-center text-[13px] text-faint">
            {searchActive
              ? `No entries match “${query.trim()}”.`
              : activeTypes.size === 0
                ? "No logbooks selected — enable a filter."
                : "No entries yet. Extract some pages to build the timeline."}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {groups.map((g, gi) => {
              const open = isExpanded(gi, g.year);
              return (
                <section key={g.year}>
                  <div
                    className="sticky top-0 z-5 mb-1 flex items-center gap-2.5 py-2"
                    style={{ background: "linear-gradient(180deg, var(--bg) 70%, transparent)" }}
                  >
                    <button
                      onClick={() => toggleYear(g.year)}
                      disabled={searchActive}
                      className="readout flex items-center gap-2 text-[15px] font-semibold text-ink disabled:cursor-default"
                    >
                      <span className={`text-[10px] text-faint transition-transform ${open ? "rotate-90" : ""}`}>
                        ▶
                      </span>
                      {g.year}
                    </button>
                    <span className="text-[11px] text-faint">{g.items.length}</span>
                    <div className="h-px flex-1 bg-line" />
                  </div>
                  {open && (
                    <ul>
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

      <div className="flex flex-col gap-3.5 lg:sticky lg:top-4">
        <div className="panel p-4">
          <div className="mb-3 flex items-center gap-2 rounded-[9px] border border-line2 bg-bg px-2.5 py-2">
            <span className="h-[13px] w-[13px] shrink-0 rounded-full border-[1.5px] border-faint" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search all entries…"
              className="w-full flex-1 bg-transparent text-[13px] text-ink outline-hidden placeholder:text-faint"
            />
          </div>
          <p className="mb-3 text-[11px] text-faint">
            {searchActive
              ? searching
                ? "Searching…"
                : `${shown.length} result${shown.length === 1 ? "" : "s"} for “${query.trim()}”`
              : `${shown.length} entr${shown.length === 1 ? "y" : "ies"}${
                  activeTypes.size < availableTypes.length ? " (filtered)" : " across all logbooks"
                }`}
            {error && <span className="text-annun-red"> · {error}</span>}
          </p>

          {/* Logbook-type filter toggles */}
          {availableTypes.length > 1 && (
            <>
              <div className="eyebrow mb-2">Filter by logbook</div>
              <div className="flex flex-wrap gap-1.5">
                {availableTypes.map((t) => {
                  const on = activeTypes.has(t);
                  return (
                    <button
                      key={t}
                      onClick={() => toggleType(t)}
                      aria-pressed={on}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                        on
                          ? `${typeColor(t)} border-transparent`
                          : "border-line text-faint hover:border-line2"
                      }`}
                    >
                      {LOGBOOK_LABEL[t as keyof typeof LOGBOOK_LABEL] ?? t}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="panel p-4">
          <div className="eyebrow mb-3">At a glance</div>
          <div className="flex items-center justify-between border-b border-line py-1.5 text-[12.5px] text-dim">
            <span>Total entries</span>
            <span className="readout text-[13px] text-ink">{stats.total}</span>
          </div>
          <div className="flex items-center justify-between border-b border-line py-1.5 text-[12.5px] text-dim">
            <span>Span</span>
            <span className="readout text-[13px] text-ink">{stats.span}</span>
          </div>
          <div className="flex items-center justify-between py-1.5 text-[12.5px] text-dim">
            <span>Logbooks</span>
            <span className="readout text-[13px] text-ink">{stats.logbooks}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

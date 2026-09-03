import { useEffect, useState } from "react";
import { color, text, radius, display, hit } from "./tokens";
import { Documents } from "./documents-screen";
import { Entries, Pages } from "./screens";
import { PageManager } from "./page-manager";
import { WeightBalance } from "./wb-view";
import { OilRecords } from "./oil-view";
import { AskPane } from "./ask-pane";
import { RecordsSheet } from "./document-upload";
import { getByAircraft } from "./db";
import { computeAirworthiness, shortDate } from "./airworthiness";
import { buildHistory } from "./history";
import { maintenanceSummaryText } from "@/lib/summaryShare";
import { usefulLoad } from "@/lib/weightBalance";
import { urgencyLabel } from "@/lib/compliance";
import { NO_FILTER, yearsOf, type HistoryFilter } from "./records-filter";
import { fabBottom, useSizeClass } from "./layout";
import { CameraIcon, ChevronRightIcon } from "./icons";
import { accentGradient } from "./tokens";
import type { Segment } from "./App";
import type { Aircraft, LogEntry, Page } from "./types";

// Records — one tab, three segments.
//
// Documents, Scans and Maintenance history used to be three of five look-alike
// buttons on the aircraft home. They are all "the paperwork", reached for the
// same reason, so they collapse behind one tab with a segmented control instead
// of competing for space with Status and Log.

const SEGMENTS: { id: Segment; label: string }[] = [
  { id: "documents", label: "Documents" },
  { id: "scans", label: "Scans" },
  { id: "history", label: "History" },
];

/** Full-screen surfaces reached FROM Records rather than living in a segment. */
type Extra = "wb" | "oil" | "ask" | null;

export function Records({
  aircraft,
  segment,
  onSegment,
  onOpenEntry,
  onOpenPage,
  onOpenPdf,
  onCapture,
  onZoom,
  onChanged,
}: {
  aircraft: Aircraft;
  segment: Segment;
  onSegment: (s: Segment) => void;
  onOpenEntry: (e: LogEntry) => void;
  onOpenPage: (pages: Page[], index: number) => void;
  onOpenPdf: (doc: { id: string; title: string }) => void;
  onCapture: () => void;
  onZoom: (src: string) => void;
  /** Sync + refresh after a write is queued here. */
  onChanged?: () => void | Promise<void>;
}) {
  const [extra, setExtra] = useState<Extra>(null);
  const [managing, setManaging] = useState(false);
  const [shared, setShared] = useState<string | null>(null);
  const [filter, setFilter] = useState<HistoryFilter>(NO_FILTER);
  const size = useSizeClass();
  // The year chips need the years that exist. Same local rows Entries reads,
  // through the same buildHistory, so the two lists can never disagree.
  const [years, setYears] = useState<string[]>([]);
  useEffect(() => {
    if (segment !== "history") return;
    getByAircraft<LogEntry>("log_entry", aircraft.id).then((rows) => setYears(yearsOf(buildHistory(rows))));
  }, [aircraft.id, segment]);

  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 16 }}>
        <h1 style={{ ...text.screenTitle, color: color.ink, margin: 0 }}>Records</h1>
        <span style={{ ...text.meta, color: color.faint, marginLeft: "auto" }}>{aircraft.tail_number}</span>
      </div>

      {/* Segmented control: track `surface`, selected segment lifts to `surfaceRaised`. */}
      <div
        role="tablist"
        style={{
          display: "flex",
          gap: 3,
          background: color.surface,
          border: `1px solid ${color.hairline}`,
          borderRadius: radius.control,
          padding: 3,
          marginBottom: 18,
        }}
      >
        {SEGMENTS.map((s) => {
          const on = s.id === segment;
          return (
            <button
              key={s.id}
              role="tab"
              aria-selected={on}
              onClick={() => onSegment(s.id)}
              style={{
                flex: 1,
                minHeight: 36,
                background: on ? color.surfaceRaised : "transparent",
                border: "none",
                borderRadius: radius.chip,
                color: on ? color.ink : color.dim,
                fontFamily: text.rowTitle.fontFamily,
                fontSize: 13.5,
                fontWeight: on ? 600 : 500,
                cursor: "pointer",
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {segment === "documents" && (
        <>
          <Documents aircraft={aircraft} onZoom={onZoom} onOpenPdf={onOpenPdf} onChanged={onChanged} />

          {/* The rest of the record that isn't a file in the vault. Rows rather
              than more segments: these are read on purpose, not browsed. */}
          <div style={{ ...text.sectionLabel, color: color.faint, margin: "22px 0 10px" }}>More records</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <MoreRow
              title="Weight & balance"
              detail="The current weighing, and what has changed since"
              onClick={() => setExtra("wb")}
            />
            <MoreRow
              title="Oil"
              detail="Hours per quart, and what the lab found in it"
              onClick={() => setExtra("oil")}
            />
            <MoreRow
              title="Ask the logbooks"
              detail="A question about what is written in the books"
              onClick={() => setExtra("ask")}
            />
            <MoreRow
              title="Share a summary"
              detail="One page for a buyer, an insurer, or your IA"
              onClick={async () => setShared(await shareSummary(aircraft))}
            />
          </div>
          {shared && <p style={{ ...text.secondary, color: color.dim, marginTop: 12 }}>{shared}</p>}
        </>
      )}

      {segment === "scans" && (
        <>
          {/* Browsing and re-ordering are different jobs: one is done in flight
              order, the other with both thumbs and full attention. */}
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            <ModeButton on={!managing} onClick={() => setManaging(false)}>Browse</ModeButton>
            <ModeButton on={managing} onClick={() => setManaging(true)}>Manage</ModeButton>
          </div>

          {managing ? (
            <PageManager aircraft={aircraft} onOpen={onOpenPage} onChanged={onChanged} />
          ) : (
            <Pages aircraft={aircraft} onOpen={onOpenPage} />
          )}

          {/* Scanning belongs to the pages, so the FAB lives here rather than
              above the fleet where it used to sit. */}
          <button
            onClick={onCapture}
            style={{
              position: "fixed",
              right: 20,
              bottom: fabBottom(size),
              display: "flex",
              alignItems: "center",
              gap: 8,
              height: 50,
              padding: "0 18px",
              borderRadius: 999,
              border: "none",
              background: accentGradient,
              color: color.onAccent,
              fontFamily: display,
              fontSize: 14.5,
              fontWeight: 600,
              boxShadow: `0 10px 26px ${color.accent}57`,
              cursor: "pointer",
              zIndex: 30,
            }}
          >
            <CameraIcon size={18} color={color.onAccent} />
            Scan
          </button>
        </>
      )}

      {segment === "history" && (
        <>
          <HistoryFilters filter={filter} years={years} onChange={setFilter} />
          <Entries aircraft={aircraft} onOpen={onOpenEntry} filter={filter} />
        </>
      )}

      {extra && (
        <RecordsSheet
          title={extra === "wb" ? "Weight & balance" : extra === "oil" ? "Oil" : "Ask the logbooks"}
          onClose={() => setExtra(null)}
        >
          {extra === "wb" && <WeightBalance aircraft={aircraft} />}
          {extra === "oil" && <OilRecords aircraft={aircraft} />}
          {extra === "ask" && <AskPane aircraft={aircraft} />}
        </RecordsSheet>
      )}
    </>
  );
}

// ---- Share a summary --------------------------------------------------------

/**
 * The one-page picture of the aircraft, handed to the iOS share sheet.
 *
 * The text itself is `maintenanceSummaryText` — literally the same function the
 * web app's printable summary uses, so a buyer who gets one by message and one
 * by email is reading the same document. Everything it needs is already on the
 * device, so this works with the aircraft in a hangar and the phone on one bar.
 */
async function shareSummary(aircraft: Aircraft): Promise<string> {
  const [air, squawks, ads, components, wb] = await Promise.all([
    computeAirworthiness(aircraft.id),
    getByAircraft<{ status: string }>("squawk", aircraft.id),
    getByAircraft<{ id: string }>("ad_compliance", aircraft.id),
    getByAircraft<{ id: string; is_installed: boolean }>("component", aircraft.id),
    getByAircraft<{ revision_date: string; empty_weight: number | null; max_gross_weight: number | null }>(
      "weight_balance",
      aircraft.id,
    ),
  ]);

  const overdue = air.lines.filter((l) => l.urgency === "overdue");
  const dueSoon = air.lines.filter((l) => l.urgency === "due_soon");
  const current = [...wb].sort((a, b) => b.revision_date.localeCompare(a.revision_date))[0] ?? null;
  const load = current ? usefulLoad(current.empty_weight, current.max_gross_weight) : null;

  const meters = [
    air.meters.tach.tach != null ? `tach ${air.meters.tach.tach}${air.meters.tach.estimated ? " est." : ""}` : null,
    air.meters.hobbs.hobbs != null ? `hobbs ${air.meters.hobbs.hobbs}${air.meters.hobbs.estimated ? " est." : ""}` : null,
    air.meters.airframe.airframe != null ? `airframe ${air.meters.airframe.airframe}` : null,
  ].filter((m): m is string => !!m);

  const body = maintenanceSummaryText({
    tailNumber: aircraft.tail_number,
    description: [aircraft.make, aircraft.model].filter(Boolean).join(" "),
    generated: new Date().toISOString().slice(0, 10),
    meters,
    overdue: overdue.length,
    dueSoon: dueSoon.length,
    current: air.lines.length - overdue.length - dueSoon.length,
    openSquawks: squawks.filter((s) => s.status === "open").length,
    adCount: ads.length,
    equipmentCount: components.filter((c) => c.is_installed).length,
    attention: [...overdue, ...dueSoon].map((l) => ({
      label: l.item.label,
      status: urgencyLabel(l.urgency === "overdue" ? "overdue" : "due_soon"),
      nextDue: l.item.nextDueDate
        ? shortDate(l.item.nextDueDate)
        : l.item.nextDueForItem != null
          ? `${l.item.nextDueForItem} h`
          : "check records",
      remaining: l.due,
    })),
    weightBalance:
      current?.empty_weight != null
        ? `Weight & balance: empty ${current.empty_weight} lbs${load != null ? ` · useful load ${load} lbs` : ""}`
        : undefined,
  });

  const title = `${aircraft.tail_number} maintenance summary`;
  // navigator.share IS the iOS share sheet inside WKWebView. The clipboard is
  // the fallback so the summary is never trapped on the screen.
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text: body });
      return "";
    } catch {
      /* cancelled, or the sheet refused — fall through to the clipboard */
    }
  }
  try {
    await navigator.clipboard.writeText(body);
    return "Summary copied — paste it into a message or an email.";
  } catch {
    return "Couldn't open the share sheet on this device.";
  }
}

// ---- History filters --------------------------------------------------------

/**
 * Category, year and free text over the maintenance history.
 *
 * The list itself is `Entries` in screens.tsx, which belongs to the review-UI
 * stream — so the control lives here and the filtering is `filterHistory`, and
 * the two are joined by one prop on `Entries` (requested in this stream's PR).
 */
export function HistoryFilters({
  filter,
  years,
  onChange,
}: {
  filter: HistoryFilter;
  years: string[];
  onChange: (f: HistoryFilter) => void;
}) {
  const CATEGORIES: { id: HistoryFilter["category"]; label: string }[] = [
    { id: "all", label: "Everything" },
    { id: "inspection", label: "Inspections" },
    { id: "oil", label: "Oil" },
    { id: "avionics", label: "Avionics" },
    { id: "other", label: "Other" },
  ];

  return (
    <div style={{ marginBottom: 16 }}>
      <input
        value={filter.query}
        onChange={(e) => onChange({ ...filter, query: e.target.value })}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        enterKeyHint="search"
        type="search"
        placeholder="Search the history"
        style={{
          width: "100%", boxSizing: "border-box", minHeight: hit.min, marginBottom: 10,
          background: color.surface, border: `1px solid ${color.hairline}`, borderRadius: radius.control,
          padding: "0 13px", color: color.ink, fontFamily: text.rowTitle.fontFamily,
          // 16px minimum — WKWebView zooms a focused control below it (README).
          fontSize: 16,
        }}
      />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {CATEGORIES.map((c) => (
          <FilterChip
            key={c.id}
            on={filter.category === c.id}
            onClick={() => onChange({ ...filter, category: c.id })}
          >
            {c.label}
          </FilterChip>
        ))}
        {years.length > 1 && (
          <select
            value={filter.year}
            onChange={(e) => onChange({ ...filter, year: e.target.value })}
            aria-label="Year"
            style={{
              minHeight: hit.min, background: color.surfaceRaised,
              border: `1px solid ${filter.year === "all" ? color.hairline : color.accent}`,
              borderRadius: radius.chip, padding: "0 10px", color: color.ink,
              fontFamily: text.rowTitle.fontFamily, fontSize: 16,
            }}
          >
            <option value="all">Any year</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

function FilterChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      style={{
        minHeight: hit.min, padding: "8px 12px", borderRadius: radius.chip,
        background: on ? color.surfaceRaised : "transparent",
        border: `1px solid ${on ? color.accent : color.hairline}`,
        color: on ? color.ink : color.dim,
        fontFamily: text.rowTitle.fontFamily, fontSize: 12.5, fontWeight: on ? 600 : 500, cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function MoreRow({ title, detail, onClick }: { title: string; detail: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10, textAlign: "left", width: "100%",
        minHeight: hit.min, background: color.surface, border: `1px solid ${color.hairline}`,
        borderRadius: radius.row, padding: 14, cursor: "pointer",
      }}
    >
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ ...text.rowTitle, fontWeight: 500, color: color.ink, display: "block" }}>{title}</span>
        <span style={{ ...text.meta, color: color.faint, display: "block", marginTop: 3 }}>{detail}</span>
      </span>
      <ChevronRightIcon size={14} color={color.faint} />
    </button>
  );
}

function ModeButton({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      style={{
        flex: 1, minHeight: hit.min, borderRadius: radius.chip,
        background: on ? color.surfaceRaised : "transparent",
        border: `1px solid ${on ? color.accent : color.hairline}`,
        color: on ? color.ink : color.dim,
        fontFamily: text.rowTitle.fontFamily, fontSize: 13.5, fontWeight: on ? 600 : 500, cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

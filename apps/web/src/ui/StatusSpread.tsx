"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DueItem } from "@/lib/due/engine";
import { fmtDate } from "@/lib/due/engine";
import {
  FILTERS, FILTER_LABEL, GROUP_LABEL, LATER, calendarCell, filterCounts, firstBadge, groupItems, hoursCell, itemSummary,
  leftText, noPageReason, ringLabel, rowAction, splitPageLabel, type Filter,
} from "@/lib/v2/status";
import { Leaf, Leaves, SourceMat } from "@/ui/Board";
import { buttonClass } from "@/ui/Button";
import { LineAhead } from "@/ui/LineAhead";
import { FirstBadge, StatusMark, TrustMark, YourNote } from "@/ui/Marks";

const LATER_KEY = "mtl_status_later";

// The "Later" toggle is remembered per browser (W-STATUS-01); storage may be blocked, so it falls back to closed.
const laterListeners = new Set<() => void>();
let laterMemo = false;
function subscribeLater(fn: () => void) {
  laterListeners.add(fn);
  return () => laterListeners.delete(fn);
}
function readLater() {
  try {
    return localStorage.getItem(LATER_KEY) === "open";
  } catch {
    return laterMemo;
  }
}
function writeLater(open: boolean) {
  laterMemo = open;
  try {
    localStorage.setItem(LATER_KEY, open ? "open" : "closed");
  } catch {
    // blocked storage: laterMemo keeps the choice for this page view
  }
  laterListeners.forEach((fn) => fn());
}

export type SpreadProps = {
  aircraftId: string;
  today: string;
  items: DueItem[];
  lineAhead: { from: string; to: string; rings: { itemKey: string; line: string; date: string; dateKind: string; status: DueItem["status"] }[]; undated: string[] };
  lanes: string[];
  filter: Filter;
  canEdit: boolean;
  /** Verdict and notices, rendered by the server above the line ahead. */
  head: React.ReactNode;
  /** Footnote and reminders line, under the table. */
  foot: React.ReactNode;
};

/** W-STATUS-01's spread: line ahead, legend chips and due table on the left, the selected row's page on the right. */
export function StatusSpread({ aircraftId, today, items, lineAhead, lanes, filter, canEdit, head, foot }: SpreadProps) {
  const router = useRouter();
  const groups = useMemo(() => groupItems(items, today, filter), [items, today, filter]);
  const ordered = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const [selected, setSelected] = useState<string | null>(() => ordered.find((i) => i.lastDone?.pageId)?.key ?? ordered[0]?.key ?? null);
  const laterOpen = useSyncExternalStore(subscribeLater, readLater, () => false);
  const toggleLater = () => writeLater(!laterOpen);

  // j / k walk the rows, m opens the selected row's action (W-STATUS-01 Interactions).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest("input, textarea, select, [contenteditable]")) return;
      const at = ordered.findIndex((i) => i.key === selected);
      if (e.key === "j" || e.key === "k") {
        const next = ordered[Math.min(Math.max(at + (e.key === "j" ? 1 : -1), 0), ordered.length - 1)];
        if (next) {
          setSelected(next.key);
          document.getElementById(`row-${next.key}`)?.scrollIntoView({ block: "nearest" });
        }
      } else if (e.key === "m" && canEdit && at >= 0) {
        const action = rowAction(ordered[at], aircraftId);
        if (action) router.push(action.href);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ordered, selected, canEdit, aircraftId, router]);

  const byKey = new Map(items.map((i) => [i.key, i]));
  const counts = filterCounts(items);
  const rings = lineAhead.rings.flatMap((r) => {
    const item = byKey.get(r.itemKey);
    return item
      ? [{ key: r.itemKey, line: r.line, date: r.date, status: r.status, projected: r.dateKind === "projected", left: leftText(item), label: ringLabel(item, today), name: itemSummary(item) }]
      : [];
  });
  const undated = lineAhead.undated.map((k) => byKey.get(k)?.label).filter(Boolean);
  const laterCount = groups.filter((g) => LATER.includes(g.key)).reduce((n, g) => n + g.items.length, 0);
  const showLater = laterOpen || filter !== "all";
  const select = (key: string) => {
    setSelected(key);
    document.getElementById(`row-${key}`)?.scrollIntoView({ block: "nearest" });
  };
  const sel = selected ? byKey.get(selected) ?? null : null;

  return (
    <Leaves>
      <Leaf label="What's due">
        {head}
        {items.length > 0 && (
          <>
            <LineAhead
              from={lineAhead.from}
              to={lineAhead.to}
              lanes={lanes}
              rings={rings}
              selected={selected}
              onSelect={select}
              dim={filter === "all" ? undefined : (k) => byKey.get(k)?.status !== filter}
              summary={`${counts.overdue} overdue, ${counts.due_soon} due soon, ${counts.current} current.`}
            />
            {undated.length > 0 && <p className="mb-3 text-small text-ink-3">Not on the line: {undated.join(", ")}, needs a date.</p>}
            <nav aria-label="Filter by state" className="my-3 flex flex-wrap gap-2">
              {FILTERS.filter((f) => f === "all" || counts[f] > 0).map((f) => (
                <Link
                  key={f}
                  href={f === "all" ? `/aircraft/${aircraftId}/status` : `/aircraft/${aircraftId}/status?filter=${f}`}
                  replace
                  scroll={false}
                  aria-current={filter === f ? "true" : undefined}
                  className={`state-layer inline-flex min-h-[34px] items-center gap-2 rounded-pill border px-3 text-caption ${
                    filter === f ? "border-ink bg-ink text-leaf" : "border-control-border text-ink"
                  }`}
                >
                  {f === "all" ? FILTER_LABEL.all : <StatusMark kind={f} compact label={FILTER_LABEL[f]} />}
                  <span className="font-bold">{counts[f]}</span>
                </Link>
              ))}
            </nav>
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-left text-label text-ink-3">
                  <th scope="col" className="border-b border-rule-2 pr-3 pb-2 font-bold">Item</th>
                  <th scope="col" className="border-b border-rule-2 pr-3 pb-2 font-bold whitespace-nowrap">Calendar limit</th>
                  <th scope="col" className="border-b border-rule-2 pr-3 pb-2 font-bold whitespace-nowrap">Hours limit</th>
                  <th scope="col" className="border-b border-rule-2 pr-3 pb-2 text-right font-bold">Left</th>
                  <th scope="col" className="border-b border-rule-2 pr-3 pb-2 font-bold">State</th>
                  {canEdit && (
                    <th scope="col" className="border-b border-rule-2 pb-2">
                      <span className="sr-only">Action</span>
                    </th>
                  )}
                </tr>
              </thead>
              {groups.map((g, gi) => {
                const later = LATER.includes(g.key);
                const firstLater = later && groups.findIndex((x) => LATER.includes(x.key)) === gi;
                return (
                  <tbody key={g.key}>
                    {firstLater && filter === "all" && (
                      <tr>
                        <td colSpan={canEdit ? 6 : 5} className="pt-4">
                          <button
                            type="button"
                            aria-expanded={showLater}
                            onClick={toggleLater}
                            className="state-layer -mx-2 min-h-[34px] rounded-control px-2 text-body-strong"
                          >
                            Later · {laterCount} {laterCount === 1 ? "item" : "items"}
                          </button>
                        </td>
                      </tr>
                    )}
                    {(!later || showLater) && (
                      <>
                        <GroupRow label={GROUP_LABEL[g.key]} count={g.items.length} span={canEdit ? 6 : 5} first={gi === 0} />
                        {g.items.map((item) => (
                          <DueRow
                            key={item.key}
                            item={item}
                            today={today}
                            aircraftId={aircraftId}
                            canEdit={canEdit}
                            selected={item.key === selected}
                            onSelect={() => setSelected(item.key)}
                          />
                        ))}
                      </>
                    )}
                  </tbody>
                );
              })}
            </table>
          </>
        )}
        {foot}
      </Leaf>
      <ItemMat item={sel} aircraftId={aircraftId} />
    </Leaves>
  );
}

function GroupRow({ label, count, span, first }: { label: string; count: number; span: number; first: boolean }) {
  return (
    <tr>
      <th scope="rowgroup" colSpan={span} className={`border-b-2 border-ink pb-[7px] text-left text-body-strong ${first ? "pt-1" : "pt-[22px]"}`}>
        {label}
        <span className="ml-2 text-small text-ink-3">· {count}</span>
      </th>
    </tr>
  );
}

function DueRow({
  item,
  today,
  aircraftId,
  canEdit,
  selected,
  onSelect,
}: {
  item: DueItem;
  today: string;
  aircraftId: string;
  canEdit: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const cal = calendarCell(item);
  const hrs = hoursCell(item, today);
  const first = firstBadge(item);
  const action = rowAction(item, aircraftId);
  const cell = `border-b border-rule py-[11px] pr-3 align-top ${selected ? "bg-leaf-2" : "group-hover:bg-leaf-2"}`;
  const selRing = selected ? "shadow-[inset_0_2px_0_var(--board),inset_0_-2px_0_var(--board)]" : "";
  const href = `/aircraft/${aircraftId}/status/item/${item.key}`;
  const detail = [item.rule, item.ifrOnly ? "IFR only" : null].filter(Boolean).join(" · ");
  return (
    <tr id={`row-${item.key}`} className={`group cursor-pointer ${selRing}`} onClick={(e) => !(e.target as HTMLElement).closest("a,button") && onSelect()}>
      <td className={`${cell} ${selected ? "pl-3" : ""}`}>
        <Link href={href} aria-current={selected ? "true" : undefined} className="text-body-strong hover:underline">
          {item.label}
        </Link>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-small text-ink-3">
          {item.line && <LineChip line={item.line} />}
          {detail && <span>· {detail}</span>}
          <Cite item={item} onSelect={onSelect} />
        </div>
        {item.waitingEntryId && (
          <div className="mt-0.5 text-small text-ink-3">
            A newer entry is waiting for review.{" "}
            <Link href={`/aircraft/${aircraftId}/entries/${item.waitingEntryId}`} className="font-semibold text-board-ink underline decoration-dotted">
              Review it
            </Link>
          </div>
        )}
      </td>
      <td className={`${cell} whitespace-nowrap`}>
        {cal ? (
          <>
            <span className={first === "calendar" ? "font-semibold" : ""}>{cal.limit}</span>
            {first === "calendar" && <FirstBadge />}
            {cal.note && <div className="text-small text-ink-3">{cal.note}</div>}
          </>
        ) : item.status === "no_record" && !hrs ? (
          canEdit ? (
            <Link href={item.source === "document" ? `/aircraft/${aircraftId}/documents` : `${href}?panel=done`} className="text-small font-semibold text-board-ink underline decoration-dotted">
              Add date
            </Link>
          ) : (
            <span className="text-small text-ink-3">No date</span>
          )
        ) : (
          <span className="text-ink-3">none</span>
        )}
      </td>
      <td className={`${cell} whitespace-nowrap`}>
        {hrs ? (
          <>
            <span className={first === "hours" ? "font-semibold" : ""}>{hrs.limit}</span>
            {first === "hours" && <FirstBadge />}
            {hrs.note && <div className="max-w-[22ch] text-small whitespace-normal text-ink-3">{hrs.note}</div>}
          </>
        ) : (
          <span className="text-ink-3">none</span>
        )}
      </td>
      <td className={`${cell} text-right font-bold whitespace-nowrap ${item.status === "overdue" ? "text-alarm-text" : ""}`}>{leftText(item)}</td>
      <td className={cell}>
        <StatusMark kind={item.advisory && item.status === "current" ? "advisory" : item.status} />
      </td>
      {canEdit && (
        <td className={`${cell} pr-0 text-right`}>
          {action && (
            <Link href={action.href} className={buttonClass("secondary", "s")}>
              {action.label}
            </Link>
          )}
        </td>
      )}
    </tr>
  );
}

function LineChip({ line }: { line: string }) {
  const name = { airframe: "Airframe", engine: "Engine", prop: "Propeller", avionics: "Avionics" }[line] ?? "Other";
  const ink = { airframe: "bg-line-airframe", engine: "bg-line-engine", prop: "bg-line-propeller", avionics: "bg-line-avionics" }[line] ?? "bg-line-other";
  return (
    <span className="inline-flex items-center gap-1.5 text-caption text-ink-2">
      <span aria-hidden className={`inline-block h-[5px] w-4 rounded-[3px] ${ink}`} />
      {name}
    </span>
  );
}

/** PageCite (02 §5.4): on this two-leaf screen it shows the page on the mat, never navigates. */
function Cite({ item, onSelect }: { item: DueItem; onSelect: () => void }) {
  const ld = item.lastDone;
  if (!ld) return null;
  const page = splitPageLabel(ld.pageLabel);
  if (!ld.pageId || !page) return <span>· <YourNote /></span>;
  return (
    <span>
      ·{" "}
      <button
        type="button"
        onClick={onSelect}
        aria-label={`${page.book} logbook, page ${page.page}`}
        className="text-caption text-board-ink underline decoration-dotted underline-offset-[3px] hover:decoration-solid"
      >
        {ld.pageLabel}
      </button>
    </span>
  );
}

/** The right leaf: the selected row's last page, or why there is none (W-STATUS-01 "Row without a page"). */
export function ItemMat({ item, aircraftId }: { item: DueItem | null; aircraftId: string }) {
  if (!item) return <SourceMat />;
  const ld = item.lastDone;
  const page = splitPageLabel(ld?.pageLabel ?? null);
  if (ld?.pageId) {
    const src = `/api/page/${ld.pageId}/image`;
    return (
      <SourceMat title={page ? `${page.book} logbook, page ${page.page}` : "Logbook page"}>
        <p className="-mt-2 flex flex-wrap items-center gap-2 text-caption text-on-cover-2">
          {ld.date && <span>{fmtDate(ld.date)} ·</span>}
          {ld.trust && <TrustMark level={ld.trust} onMat />}
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element -- signed, per-user page image; next/image would cache it across users */}
        <img src={src} alt={`${page ? `${page.book} logbook, page ${page.page}` : "Logbook page"}, behind ${item.label}`} className="h-auto w-full rounded-s" />
        <div>
          <a href={src} target="_blank" rel="noopener" className={buttonClass("on-mat", "s")}>
            Zoom
          </a>
        </div>
      </SourceMat>
    );
  }
  const reason = noPageReason(item);
  return (
    <SourceMat title={item.label}>
      <div className="rounded-s bg-leaf-2 px-4 py-3.5 text-body text-ink">
        No page behind this yet. {reason.text}{" "}
        {reason.documents && (
          <Link href={`/aircraft/${aircraftId}/documents`} className="font-semibold underline">
            Open Documents
          </Link>
        )}
      </div>
    </SourceMat>
  );
}


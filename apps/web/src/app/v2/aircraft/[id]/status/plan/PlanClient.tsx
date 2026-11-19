"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addDays, addMonths, daysBetween, type StatusBody } from "@/lib/due/engine";
import { planDate } from "@/lib/due/plan";
import { cannotText, clampPlanDate, defaultPlanDate, defaultRate, lapseLimit, parseRate, planAnswer, planHelper, planRings, scrubberText, stillInDateText } from "@/lib/v2/plan";
import { LA, itemSummary, leftText, ringLabel } from "@/lib/v2/status";
import { monD } from "@/lib/v2/visits";
import { Leaf, Leaves } from "@/ui/Board";
import { buttonClass } from "@/ui/Button";
import { fieldClass } from "@/ui/Form";
import { LineAhead, type CapInput } from "@/ui/LineAhead";
import { StatusMark } from "@/ui/Marks";
import { saveUsualFlying } from "./actions";

const storeKey = (id: string) => `mtl.plan.${id}`;
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/**
 * W-STATUS-03's spread. Everything recomputes in the browser on every move (09 §3.12): the scrubber, the date field
 * and the rate drive one planDate() call, the rings that lapse turn overdue, and the URL follows on release.
 */
export function PlanClient({
  aircraftId,
  status,
  lanes,
  to,
  initialDate,
  initialRate,
  canEdit,
  caps,
  selectedCap,
  visits,
  right,
}: {
  aircraftId: string;
  status: StatusBody;
  lanes: string[];
  to: string;
  initialDate: string | null;
  initialRate: number | null;
  canEdit: boolean;
  caps: CapInput[];
  selectedCap: string | null;
  visits: React.ReactNode;
  right?: React.ReactNode;
}) {
  const router = useRouter();
  const today = status.today;
  const usual = defaultRate(status.rate);
  const [date, setDate] = useState(initialDate ?? defaultPlanDate(today));
  const [rateText, setRateText] = useState(String(initialRate ?? usual ?? ""));
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const drawing = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const latest = useRef(date); // the date under the pointer, for the commit on release

  // No date in the URL: the last date chosen for this aircraft on this browser (W-STATUS-03).
  useEffect(() => {
    if (initialDate) return;
    try {
      const last = localStorage.getItem(storeKey(aircraftId));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the remembered date once after hydration
      if (last && isDate(last) && last >= today) setDate(clampPlanDate(last, today));
    } catch {
      // Storage blocked (private window): the default date stands.
    }
  }, [aircraftId, initialDate, today]);

  const rate = parseRate(rateText);
  const plan = useMemo(() => planDate(status, date, rate), [status, date, rate]);
  const lapsing = useMemo(() => new Set([...plan.lapsed, ...plan.lapses].map((l) => l.key)), [plan]);
  const byKey = useMemo(() => new Map(status.items.map((i) => [i.key, i])), [status.items]);
  const label = (key: string) => byKey.get(key)?.label ?? "An item";
  const rings = planRings(status.items, today, to, lapsing).flatMap((r) => {
    const item = byKey.get(r.itemKey);
    if (!item) return [];
    const lapses = lapsing.has(r.itemKey);
    return [{
      key: r.itemKey, line: r.line, date: r.date, status: r.status, projected: r.dateKind === "projected", left: leftText(item),
      label: lapses && item.status !== "overdue" ? `${item.label}, lapses ${monD(r.date)}` : ringLabel(item, today),
      name: `${itemSummary(item)}${lapses ? ` Lapses by ${monD(date)}.` : ""}`,
    }];
  });

  /** Commit the date: URL (replace, no server round trip) and this browser's memory. */
  function commit(d: string, r = rateText) {
    const q = new URLSearchParams(window.location.search);
    q.set("date", d);
    if (r && parseRate(r) !== usual) q.set("rate", String(parseRate(r)));
    else q.delete("rate");
    window.history.replaceState(null, "", `${window.location.pathname}?${q}`);
    try {
      localStorage.setItem(storeKey(aircraftId), d);
    } catch {
      // Storage blocked (private window): the default date stands.
    }
  }
  const move = (d: string, save = true) => {
    const c = clampPlanDate(d, today);
    latest.current = c;
    setDate(c);
    if (save) commit(c);
  };

  function dateAt(clientX: number): string | null {
    const svg = drawing.current?.querySelector("svg");
    if (!svg) return null;
    const box = svg.getBoundingClientRect();
    const ux = ((clientX - box.left) / box.width) * LA.width;
    const span = daysBetween(today, to);
    return addDays(today, Math.round(((ux - LA.todayX) / (LA.horizonX - LA.todayX)) * span));
  }
  const onPointerDown = (e: React.PointerEvent) => {
    const t = e.target as Element;
    // Rings and caps keep their own clicks; the handle and empty drawing move the marker.
    if (t.closest("[role=button]") && !t.closest("[data-scrubber]")) return;
    const d = dateAt(e.clientX);
    if (!d) return;
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    move(d, false);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const d = dateAt(e.clientX);
    if (d) move(d, false);
  };
  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    commit(latest.current);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step: Record<string, () => string> = {
      ArrowLeft: () => addDays(date, -1), ArrowDown: () => addDays(date, -1),
      ArrowRight: () => addDays(date, 1), ArrowUp: () => addDays(date, 1),
      PageDown: () => addMonths(date, -1), PageUp: () => addMonths(date, 1),
      Home: () => today, End: () => to,
    };
    if (!step[e.key]) return;
    e.preventDefault();
    move(step[e.key]());
  };

  // Basis note (W-STATUS-03); with no flying and no estimate the helper already asks for hours.
  const basis = status.rate.basis === "none" ? "" : status.rate.basis === "owner_estimate" ? "No recent flying, so this uses your estimate." : "From the past year.";
  // "Dec 7 visit": the planned or suggested visit that would clear the item.
  const visitOf = (key: string | null) => {
    const cap = key ? caps.find((c) => c.key === key) : null;
    return cap ? `${monD(cap.date)} visit` : null;
  };
  const n = plan.lapsed.length + plan.lapses.length;
  const lower = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
  const still = stillInDateText(plan, (k) => `the ${lower(label(k))}`);

  return (
    <Leaves split="2.05fr 1fr">
      <Leaf label="The next 24 months">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 className="text-heading">The next 24 months</h2>
          <p aria-hidden className="flex flex-wrap gap-x-4 text-caption text-ink-2">
            <span className="inline-flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-full bg-alarm" /> due</span>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-full border-2 border-ink" /> current</span>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-full border-2 border-alarm" /> due soon</span>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded-full border border-dashed border-ink" /> suggested visit</span>
          </p>
        </div>
        <div
          ref={drawing}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="touch-none select-none"
        >
          <LineAhead
            from={today}
            to={to}
            lanes={lanes}
            rings={rings}
            onSelect={(k) => router.push(`/aircraft/${aircraftId}/status/item/${encodeURIComponent(k)}`)}
            summary={`${planAnswer(plan)} Use the date field to change the date.`}
            caps={caps}
            selectedCap={selectedCap}
            onSelectCap={(k) => router.replace(`/aircraft/${aircraftId}/status/plan?visit=${encodeURIComponent(k)}&date=${date}`, { scroll: false })}
            marker={{ date, label: monD(date) + (date.slice(0, 4) !== today.slice(0, 4) ? `, ${date.slice(0, 4)}` : ""), valueText: scrubberText(plan), value: daysBetween(today, date), max: daysBetween(today, to), onKeyDown }}
            title="The line ahead: the next 24 months on each logbook line, with the date to plan for"
          />
        </div>
        {status.items.length === 0 ? (
          <p className="mt-4 text-body text-ink-2">Nothing is tracked yet, so there is nothing to plan.</p>
        ) : (
          visits
        )}
      </Leaf>

      {right ?? (
        <Leaf label="The answer">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-label">
              Date
              <input
                type="date"
                className={fieldClass}
                value={date}
                min={today}
                max={to}
                onChange={(e) => isDate(e.target.value) && move(e.target.value)}
              />
            </label>
            <label className="block text-label">
              Flying until then
              <span className="relative mt-1 block">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={60}
                  step={0.5}
                  className={`${fieldClass} mt-0 pr-24`}
                  value={rateText}
                  aria-describedby="rate-help"
                  onChange={(e) => { setRateText(e.target.value); setSaved(null); }}
                  onBlur={() => commit(date)}
                />
                <span aria-hidden className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-small text-ink-3">h a week</span>
              </span>
            </label>
          </div>
          <p id="rate-help" className="mt-2 text-small text-ink-3">
            {planHelper(plan) ?? "Type the hours you expect to fly each week."} Drag the marker on the map or type a date.
            {" "}{basis}
          </p>
          {canEdit && rate != null && rate !== usual && (
            <button
              type="button"
              disabled={saving}
              className="mt-1 text-small font-semibold text-board-ink underline decoration-dotted"
              onClick={() => startSave(async () => setSaved(await saveUsualFlying(aircraftId, rate)))}
            >
              Use as my usual flying
            </button>
          )}
          {saved && <p role="status" className="mt-1 text-small">{saved}</p>}

          <p aria-live="polite" className="mt-5 border-t-2 border-ink pt-4 text-lede">{planAnswer(plan)}</p>

          {n > 0 && (
            <ul className="mt-3">
              {[...plan.lapsed, ...plan.lapses].map((l) => {
                const item = byKey.get(l.key);
                if (!item) return null;
                const cite = item.lastDone?.pageLabel;
                const visit = visitOf(l.coveredByVisit);
                return (
                  <li key={l.key} className="flex items-start justify-between gap-3 border-t border-rule py-2.5">
                    <div className="min-w-0">
                      <Link href={`/aircraft/${aircraftId}/status/item/${encodeURIComponent(l.key)}`} className="text-body-strong underline-offset-2 hover:underline">
                        {item.label}
                      </Link>
                      <p className="text-small text-ink-2">
                        {lapseLimit(item, l.dueDate)}
                        {cite ? ` · ${cite}` : ""}
                        {visit ? ` · ${visit}` : ""}
                      </p>
                    </div>
                    <StatusMark kind={l.when === "already" ? "overdue" : "due_soon"} label={l.when === "already" ? "Lapsed" : "Lapses"} compact />
                  </li>
                );
              })}
            </ul>
          )}
          {still && <p className="mt-4 text-body text-ink-2">{still}</p>}
          {plan.cannotCheck.length > 0 && (
            <div className="mt-4 space-y-1 text-small text-ink-3">
              {plan.cannotCheck.map((c) => <p key={c.key}>{cannotText(c, label(c.key))}</p>)}
            </div>
          )}
          {date !== today && (
            <button type="button" className={`${buttonClass("quiet", "s")} mt-4 -ml-3`} onClick={() => move(today)}>
              Back to today
            </button>
          )}
        </Leaf>
      )}
    </Leaves>
  );
}

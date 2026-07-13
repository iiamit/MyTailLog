import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMeters } from "@/lib/aircraftHours";
import { urgencyLabel, type Urgency } from "@/lib/compliance";
import {
  buildStatusItems,
  sortStatusItems,
  daysUntil,
  hoursRemaining,
  type StatusItem,
} from "@/lib/status";

// Card left-border + dot color per urgency — the at-a-glance color code.
const BORDER: Record<Urgency, string> = {
  overdue: "var(--red)",
  due_soon: "var(--amb)",
  upcoming: "var(--grn)",
  none: "var(--line)",
};
const DOT: Record<Urgency, string> = {
  overdue: "bg-annun-red",
  due_soon: "bg-annun-amber",
  upcoming: "bg-annun-green",
  none: "bg-faint",
};
const REMAIN_COLOR: Record<Urgency, string> = {
  overdue: "text-annun-red",
  due_soon: "text-annun-amber",
  upcoming: "text-annun-green",
  none: "text-faint",
};

function remainingText(item: StatusItem): string {
  const parts: string[] = [];
  const days = daysUntil(item.nextDueDate);
  if (days != null) {
    parts.push(days < 0 ? `${Math.abs(days)} days overdue` : `${days} days left`);
  }
  if (item.hoursUnreliable) {
    parts.push("check last-done reading");
  } else {
    const hrs = hoursRemaining(item.nextDueHours, item.currentForItem);
    if (hrs != null) {
      const est = item.currentEstimated ? " est." : "";
      parts.push(hrs < 0 ? `${Math.abs(hrs)} hrs overdue${est}` : `${hrs} hrs left${est}`);
    }
  }
  if (parts.length === 0) return item.nextDueDate || item.nextDueHours != null ? "" : "not set";
  return parts.join(" · ");
}

// Fraction of the recurring interval elapsed, for the annunciator progress
// bar. Prefers hours (more precise for engine/airframe items); falls back to
// the calendar span between last-done and next-due. Null when we don't have
// enough of either dimension to derive one — the bar is simply omitted then.
function progressFraction(item: StatusItem): number | null {
  if (item.intervalHours && item.lastDoneHours != null && item.currentForItem != null) {
    return (item.currentForItem - item.lastDoneHours) / item.intervalHours;
  }
  if (item.lastDoneDate && item.nextDueDate) {
    const total = Date.parse(item.nextDueDate) - Date.parse(item.lastDoneDate);
    const elapsed = Date.now() - Date.parse(item.lastDoneDate);
    if (total > 0) return elapsed / total;
  }
  return null;
}

function StatusCard({
  item,
  aircraftId,
}: {
  item: StatusItem;
  aircraftId: string;
}) {
  const href =
    item.source === "ad" ? `/aircraft/${aircraftId}/compliance` : `/aircraft/${aircraftId}/maintenance`;
  const rem = remainingText(item);
  const frac = progressFraction(item);
  const pct = frac != null ? Math.max(0, Math.min(100, frac * 100)) : null;

  return (
    <Link
      href={href}
      className="panel flex flex-col gap-1 p-4 transition hover:border-line2"
      style={{ borderLeft: `3px solid ${BORDER[item.urgency]}` }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[item.urgency]}`} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight text-ink">
          {item.label}
        </span>
        {item.source === "ad" && (
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent">AD</span>
        )}
        {item.verifiedReport && (
          <span
            title={
              item.verifiedReportAt
                ? `Corroborated by a scanned A&P AD compliance report on ${item.verifiedReportAt.slice(0, 10)}`
                : "Corroborated by a scanned A&P AD compliance report"
            }
            className="rounded-full px-2 py-0.5 text-[11px] text-annun-green"
            style={{ background: "var(--grn-bg)" }}
          >
            ✓ A&amp;P
          </span>
        )}
        {!item.regulatory && (
          <span className="rounded-full bg-panel2 px-2 py-0.5 text-[11px] text-faint">advisory</span>
        )}
      </div>

      <div className={`text-[13px] font-medium ${REMAIN_COLOR[item.urgency]}`}>
        {item.urgency === "none" ? "not scheduled" : urgencyLabel(item.urgency)}
        {rem && <span className="text-faint"> · {rem}</span>}
      </div>

      <div className="readout mt-0.5 text-[10.5px] text-faint">
        {[
          item.nextDueDate ? `due ${item.nextDueDate}` : null,
          item.nextDueHours != null ? `at ${item.nextDueHours} hrs` : null,
          item.lastDoneDate ? `last ${item.lastDoneDate}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || "no schedule set"}
      </div>

      {pct != null && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-panel2">
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, background: BORDER[item.urgency] }}
          />
        </div>
      )}
    </Link>
  );
}

function UrgencySection({
  title,
  color,
  items,
  aircraftId,
}: {
  title: string;
  color: string;
  items: StatusItem[];
  aircraftId: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-[9px] w-[9px] rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color }}
        >
          {title}
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,210px),1fr))] gap-3">
        {items.map((s) => (
          <StatusCard key={`${s.source}-${s.id}`} item={s} aircraftId={aircraftId} />
        ))}
      </div>
    </div>
  );
}

export default async function StatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("id, tail_number, enrollment_hobbs, enrollment_tach")
    .eq("id", id)
    .single();
  if (!aircraft) notFound();

  const [{ data: items }, { data: ads }] = await Promise.all([
    supabase.from("maintenance_item").select("*").eq("aircraft_id", id),
    supabase
      .from("ad_compliance")
      .select("id, reference, kind, next_due_date, next_due_hours, status, verified_report_page_id, verified_at")
      .eq("aircraft_id", id)
      .eq("recurring", true)
      .not("status", "in", "(not_applicable,superseded)"),
  ]);

  const { tach: ct, hobbs: ch } = await getCurrentMeters(supabase, id, {
    hobbs: aircraft.enrollment_hobbs,
    tach: aircraft.enrollment_tach,
  });

  const statusItems = sortStatusItems(
    buildStatusItems(items ?? [], ads ?? [], {
      tach: ct.tach,
      hobbs: ch.hobbs,
      tachEstimated: ct.estimated,
      hobbsEstimated: ch.estimated,
    }),
  );

  const overdueItems = statusItems.filter((s) => s.urgency === "overdue");
  const dueItems = statusItems.filter((s) => s.urgency === "due_soon");
  const currentItems = statusItems.filter((s) => s.urgency === "upcoming" || s.urgency === "none");

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">Airworthiness</div>
          <h1 className="font-display text-[27px] font-semibold leading-none">Status</h1>
          <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-dim">
            Every recurring inspection, item, and AD at a glance — grouped
            worst-first and color-coded by urgency. Derived from your logs;
            verify against the physical logbooks.
          </p>
        </div>
        <span className="readout text-right text-xs text-dim">
          {ct.tach != null || ch.hobbs != null ? (
            <>
              {ct.tach != null && (
                <span
                  title={
                    ct.estimated
                      ? ct.rough
                        ? "Rough estimate — no tach recorded; derived from hobbs at the default ratio"
                        : "Estimated from the latest hobbs via this aircraft's hobbs↔tach ratio; actual tach may differ slightly"
                      : undefined
                  }
                >
                  tach ≈ {ct.tach}
                  {ct.estimated ? (ct.rough ? " (rough est.)" : " (est.)") : ""}
                </span>
              )}
              {ct.tach != null && ch.hobbs != null && <span className="text-faint"> · </span>}
              {ch.hobbs != null && (
                <span title={ch.estimated ? "Estimated from tach — no hobbs recorded" : undefined}>
                  hobbs {ch.hobbs}
                  {ch.estimated ? " (est.)" : ""}
                </span>
              )}
            </>
          ) : (
            "hours unknown"
          )}
        </span>
      </header>

      {statusItems.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-5 py-10 text-center text-sm text-dim">
          No status items yet. Seed the standard Part 91 items on the{" "}
          <Link href={`/aircraft/${id}/maintenance`} className="underline">
            maintenance forecast
          </Link>{" "}
          and record AD compliance to populate this.
        </p>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap gap-2.5">
            <div
              className="flex items-center gap-2 rounded-lg border border-annun-red/30 px-3.5 py-1.5"
              style={{ background: "var(--red-bg)" }}
            >
              <span className="readout text-[15px] text-annun-red">{overdueItems.length}</span>
              <span className="text-xs text-dim">overdue</span>
            </div>
            <div
              className="flex items-center gap-2 rounded-lg border border-annun-amber/30 px-3.5 py-1.5"
              style={{ background: "var(--amb-bg)" }}
            >
              <span className="readout text-[15px] text-annun-amber">{dueItems.length}</span>
              <span className="text-xs text-dim">due soon</span>
            </div>
            <div
              className="flex items-center gap-2 rounded-lg border border-annun-green/30 px-3.5 py-1.5"
              style={{ background: "var(--grn-bg)" }}
            >
              <span className="readout text-[15px] text-annun-green">{currentItems.length}</span>
              <span className="text-xs text-dim">current</span>
            </div>
          </div>

          <UrgencySection title="Overdue" color="var(--red)" items={overdueItems} aircraftId={id} />
          <UrgencySection title="Due soon" color="var(--amb)" items={dueItems} aircraftId={id} />
          <UrgencySection title="Current" color="var(--grn)" items={currentItems} aircraftId={id} />
        </>
      )}
    </main>
  );
}

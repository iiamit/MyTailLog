import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LOGBOOK_LABEL } from "@/lib/logbooks";
import { dueText, type Urgency } from "@/lib/compliance";
import { getCurrentMeters, currentMetersFrom } from "@/lib/aircraftHours";
import { LoadError } from "@/components/LoadError";
import { getAircraftRole, canEditRole } from "@/lib/access";
import {
  buildStatusItems,
  sortStatusItems,
  summarizeStatusItems,
  statusCountdown,
  type AdLite,
} from "@/lib/status";
import { CameraIcon, ArchiveIcon } from "@/components/icons";
import { coverageByLogbook, axisPercent } from "@/lib/coverage";
import { startProgress } from "@/lib/startProgress";

const U_COLOR: Record<Urgency, string> = {
  overdue: "var(--red)",
  due_soon: "var(--amb)",
  upcoming: "var(--grn)",
  none: "var(--faint)",
};

export default async function AircraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: aircraft } = await supabase.from("aircraft").select("*").eq("id", id).single();
  if (!aircraft) notFound();

  const role = await getAircraftRole(supabase, id, aircraft.owner_id);
  const isOwner = role === "owner";
  const canEdit = canEditRole(role);

  const [
    { data: logbooks, error: logbookError },
    { data: pages, error: pageError },
    { data: entryRows, error: entryError },
    { data: recent, error: recentError },
    { data: mxItems, error: itemError },
    { data: ads, error: adError },
    { count: readingCount },
  ] = await Promise.all([
    supabase.from("logbook").select("id, type, title").eq("aircraft_id", id),
    supabase.from("page").select("logbook_id").eq("aircraft_id", id),
    supabase.from("log_entry").select("page_id, owner_confirmed, logbook_id, entry_date").eq("aircraft_id", id),
    supabase
      .from("log_entry")
      .select("id, entry_date, logbook_id, tach, hobbs, description, work_performed")
      .eq("aircraft_id", id)
      .order("entry_date", { ascending: false, nullsFirst: false })
      .limit(3),
    supabase.from("maintenance_item").select("*").eq("aircraft_id", id),
    supabase
      .from("ad_compliance")
      .select(
        "id, reference, kind, next_due_date, next_due_hours, status, verified_report_page_id, verified_at",
      )
      .eq("aircraft_id", id)
      .eq("recurring", true)
      .not("status", "in", "(not_applicable,superseded)"),
    supabase.from("hours_reading").select("id", { count: "exact", head: true }).eq("aircraft_id", id),
  ]);

  const meters = await getCurrentMeters(supabase, id, {
    hobbs: aircraft.enrollment_hobbs,
    tach: aircraft.enrollment_tach,
    airframe: aircraft.enrollment_airframe,
    date: aircraft.enrollment_date,
  }).catch(() => null);
  const { tach: ct, hobbs: ch, airframe: ca, baselineFor, toTotalHours } = meters ?? currentMetersFrom([], []);
  const statusUnavailable = Boolean(itemError || adError || !meters);

  // Unified airworthiness list → annunciator counts + most-urgent + forecast.
  const status = buildStatusItems(mxItems ?? [], (ads ?? []) as AdLite[], {
    tach: ct.tach,
    hobbs: ch.hobbs,
    airframe: ca.airframe,
    tachEstimated: ct.estimated,
    hobbsEstimated: ch.estimated,
    airframeEstimated: ca.estimated,
    baselineFor,
    toTotalHours,
  });
  const sorted = sortStatusItems(status);
  const annun = summarizeStatusItems(status);
  const attention = annun.overdue + annun.due;
  const total = status.length || 1;
  const gauge = status.length === 0 ? "var(--line2)" : `conic-gradient(var(--red) 0 ${(annun.overdue / total) * 100}%, var(--amb) 0 ${
    ((annun.overdue + annun.due) / total) * 100
  }%, var(--grn) 0 ${((annun.overdue + annun.due + annun.current) / total) * 100}%, var(--line2) 0 100%)`;
  const attnColor = annun.overdue > 0 ? "var(--red)" : annun.due > 0 ? "var(--amb)" : annun.unknown > 0 || status.length === 0 ? "var(--dim)" : "var(--grn)";
  const mostUrgent = sorted[0]?.urgency === "overdue" || sorted[0]?.urgency === "due_soon" ? sorted[0] : null;
  const forecast = sorted.filter((s) => s.source === "maintenance").slice(0, 4);

  // Per-logbook page counts + pages awaiting review, for the capture card.
  const labelFor = (lid: string) => {
    const lb = logbooks?.find((l) => l.id === lid);
    return lb ? lb.title ?? LOGBOOK_LABEL[lb.type] ?? lb.type : "Logbook";
  };
  const typeFor = (lid: string) => logbooks?.find((l) => l.id === lid)?.type ?? "other";
  const pageCounts = new Map<string, number>();
  for (const p of pages ?? []) {
    pageCounts.set(p.logbook_id, (pageCounts.get(p.logbook_id) ?? 0) + 1);
  }
  // Pages needing review = extracted pages with an unconfirmed entry (matches
  // the nav badge + Logbooks & pages), not merely review_status='unreviewed' —
  // entry-less/fully-confirmed pages have nothing to review.
  const reviewPending = new Set(
    (entryRows ?? []).filter((e) => !e.owner_confirmed).map((e) => e.page_id).filter(Boolean),
  ).size;
  const totalPages = [...pageCounts.values()].reduce((x, y) => x + y, 0);

  // Records coverage per logbook, on an axis from the aircraft's year to today.
  const coverage = coverageByLogbook(logbooks ?? [], entryRows ?? []);
  const nowYear = new Date().getFullYear();
  const firstYear = Math.min(
    aircraft.year ?? nowYear,
    ...coverage.filter((c) => c.first).map((c) => Number(c.first!.slice(0, 4))),
  );
  const coverageNote = (() => {
    const gap = coverage.find((c) => c.gaps.length > 0);
    if (gap) return `${LOGBOOK_LABEL[gap.type]} gap ${gap.gaps[0].from.slice(0, 4)}–${gap.gaps[0].to.slice(0, 4)}. Missing pages, or just a quiet stretch?`;
    const empty = coverage.find((c) => c.count === 0);
    if (empty && coverage.some((c) => c.count > 0)) return `No ${LOGBOOK_LABEL[empty.type].toLowerCase()} entries yet.`;
    return null;
  })();

  const setup = startProgress(aircraft, readingCount ?? 0, mxItems ?? []);

  const type = [aircraft.year, aircraft.make, aircraft.model].filter(Boolean).join(" ") || "Details not set";
  const a = `/aircraft/${id}`;

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">Aircraft overview</div>
          <div className="flex flex-wrap items-baseline gap-3.5">
            <h1 className="readout text-[34px] font-semibold tracking-[1px]">{aircraft.tail_number}</h1>
            <span className="text-[15px] text-dim">
              {type}
              {aircraft.serial_number ? ` · S/N ${aircraft.serial_number}` : ""}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {canEdit && setup.done < 2 && (
            <Link
              href={`${a}/start`}
              className="inline-flex items-center rounded-[9px] border px-4 py-2.5 text-[13.5px] font-medium text-annun-amber hover:opacity-90"
              style={{ borderColor: "var(--amb)", background: "var(--amb-bg)" }}
            >
              Finish setup · {setup.done} of 2 details →
            </Link>
          )}
          {isOwner && <Link href={`${a}/details`} className="inline-flex items-center rounded-[9px] border border-line2 bg-panel2 px-4 py-2.5 text-[13.5px] text-ink hover:border-accent">Edit aircraft details</Link>}
          {!isOwner && (
            <span className="rounded-full bg-panel2 px-2.5 py-0.5 text-xs font-medium text-dim">
              Shared · {canEdit ? "contribute" : "view only"}
            </span>
          )}
          {canEdit && (
            <Link
              href={`${a}/capture`}
              className="inline-flex items-center gap-2 rounded-[9px] bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-bg hover:opacity-90"
            >
              <CameraIcon />
              Capture pages
            </Link>
          )}
          <Link
            href={`${a}/export`}
            className="inline-flex items-center gap-2 rounded-[9px] border border-line2 bg-panel2 px-4 py-2.5 text-[13.5px] text-ink hover:border-accent"
          >
            <ArchiveIcon />
            Export &amp; backup
          </Link>
        </div>
      </header>

      {/* Row 1: airworthiness + forecast */}
      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        {/* Airworthiness status */}
        {statusUnavailable ? (
          <LoadError message="Maintenance status is unavailable because some records could not be loaded." href={a} />
        ) : <div className="panel-raised p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink">Tracked maintenance status</h2>
            <span className="readout text-[11px] text-dim">
              tach ≈ {ct.tach != null ? ct.tach.toFixed(1) : "—"} · hobbs {ch.hobbs != null ? ch.hobbs.toFixed(1) : "—"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <div className="relative h-[132px] w-[132px] shrink-0 rounded-full" style={{ background: gauge }}>
              <div className="absolute inset-[15px] flex flex-col items-center justify-center rounded-full border border-line bg-panel">
                <span className="readout text-[30px] font-semibold leading-none" style={{ color: attnColor }}>
                  {status.length === 0 ? "—" : attention || annun.unknown}
                </span>
                {/* Wraps to two lines — the inner disc is too narrow for one. */}
                <span
                  className="mt-1 uppercase text-dim"
                  style={{
                    textAlign: "center",
                    padding: "0 12%",
                    lineHeight: 1.25,
                    fontSize: "11px",
                    letterSpacing: ".1em",
                    maxWidth: "100%",
                  }}
                >
                  {status.length === 0 ? "not assessed" : attention > 0 ? "need attention" : annun.unknown > 0 ? "need information" : "tracked alerts"}
                </span>
              </div>
            </div>
            <div className="flex min-w-[9rem] flex-1 flex-col gap-2.5">
              {[
                { c: "var(--red)", n: annun.overdue, l: "overdue" },
                { c: "var(--amb)", n: annun.due, l: "due soon" },
                { c: "var(--grn)", n: annun.current, l: "within recorded limits" },
                { c: "var(--dim)", n: annun.unknown, l: "need information" },
              ].map((r) => (
                <div key={r.l} className="flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.c, boxShadow: `0 0 9px ${r.c}` }} />
                  <span className="readout w-6 text-[15px]">{r.n}</span>
                  <span className="text-[12.5px] text-dim">{r.l}</span>
                </div>
              ))}
              <Link
                href={`${a}/status`}
                className="mt-1.5 self-start inline-flex min-h-11 items-center rounded-lg border border-line2 px-3 py-2 text-sm text-dim hover:border-accent hover:text-ink"
              >
                Review tracked status →
              </Link>
            </div>
          </div>
          <p className="mt-4 text-sm text-dim">
            {status.length === 0 ? "Nothing tracked yet. Add maintenance items to begin." : `${status.length} tracked items. Only recorded items are assessed.`}
            {ct.asOf && ` Tach reading as of ${ct.asOf}.`}
            {ch.asOf && ` Hobbs reading as of ${ch.asOf}.`}
            {" "}Verify against the physical logbooks.
          </p>
          {mostUrgent && (
            <Link
              href={`${a}/status`}
              className="mt-5 flex items-center gap-3.5 rounded-xl border px-4 py-3.5"
              style={{ background: mostUrgent.urgency === "overdue" ? "var(--red-bg)" : "var(--amb-bg)", borderColor: U_COLOR[mostUrgent.urgency], color: U_COLOR[mostUrgent.urgency] }}
            >
              <span
                className="shrink-0 rounded-md border border-current px-1.5 py-1 text-[11px] font-semibold tracking-[0.12em]"
              >
                MOST URGENT
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px] font-semibold">{mostUrgent.label}</div>
                <div className="readout mt-0.5 text-xs">
                  {mostUrgent.hoursUnreliable
                    ? dueText(mostUrgent.nextDueDate, null, null) || "Check the last recorded completion"
                    : dueText(mostUrgent.nextDueDate, mostUrgent.nextDueForItem, mostUrgent.currentForItem) ?? "due"}
                </div>
              </div>
              <span className="text-lg">→</span>
            </Link>
          )}
        </div>}

        {/* Next due forecast */}
        <div className="panel p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink">Next due · Part 91 forecast</h2>
            <Link href={`${a}/maintenance`} className="inline-flex min-h-11 items-center text-sm text-accent hover:opacity-80">
              View forecast →
            </Link>
          </div>
          {statusUnavailable ? <LoadError message="The forecast could not be loaded." href={a} /> : forecast.length > 0 ? (
            <div>
              {forecast.map((f) => (
                <Link
                  key={f.id}
                  href={`${a}/maintenance#item-${f.id}`}
                  className="flex items-center gap-3 border-b border-line py-2.5 last:border-0 hover:opacity-90"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: U_COLOR[f.urgency] }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px]">{f.label}</div>
                    <div className="readout mt-0.5 text-xs text-dim">
                      {f.hoursUnreliable
                        ? dueText(f.nextDueDate, null, null) || "Check the last recorded completion"
                        : dueText(f.nextDueDate, f.nextDueForItem, f.currentForItem) ?? "Schedule information needed"}
                      {f.urgency === "none" && " · Needs information"}
                    </div>
                  </div>
                  <span className="readout shrink-0 text-xs" style={{ color: U_COLOR[f.urgency] }}>
                    {statusCountdown(f).text}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="py-4 text-sm text-faint">
              No recurring items yet.{" "}
              <Link href={canEdit ? `${a}/start` : `${a}/maintenance`} className="text-accent">
                {canEdit ? "Set up status →" : "Open the forecast →"}
              </Link>
            </p>
          )}
        </div>
      </div>

      {/* Row 2: recent activity + capture/ask */}
      <div className="grid gap-4 xl:grid-cols-2">
        {/* Recent activity */}
        <div className="panel p-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink">Recent activity</h2>
            <Link href={`${a}/timeline`} className="inline-flex min-h-11 items-center text-sm text-accent hover:opacity-80">
              timeline &amp; search →
            </Link>
          </div>
          {recentError ? <LoadError message="Recent entries could not be loaded." href={a} /> : recent && recent.length > 0 ? (
            <div>
              {recent.map((e) => (
                <div key={e.id} className="flex gap-3.5 border-b border-line py-3 last:border-0">
                  <div className="readout w-[74px] shrink-0 pt-0.5 text-[11px] text-dim">
                    {e.entry_date ?? "—"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span
                        className="rounded-sm px-1.5 py-0.5 text-[10px] font-medium"
                        style={{ background: "var(--panel2)", color: `var(--book-${typeFor(e.logbook_id)})` }}
                      >
                        {labelFor(e.logbook_id)}
                      </span>
                      {e.tach != null && (
                        <span className="readout text-[10.5px] text-faint">tach {e.tach}</span>
                      )}
                    </div>
                    <div className="line-clamp-2 text-[13px] text-ink">
                      {e.description || e.work_performed || "—"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-sm text-faint">No entries yet — capture and review a page to get started.</p>
          )}
        </div>

        {/* Capture + Ask */}
        <div className="flex flex-col gap-4">
          <div className="panel p-5">
            <div className="mb-3.5 flex items-center justify-between gap-3">
              <div className="eyebrow">Records coverage · {firstYear} → today</div>
              {reviewPending > 0 ? (
                <span className="readout text-[11px] text-annun-amber">{reviewPending} pages need review</span>
              ) : (
                <span className="readout text-[11px] text-faint">{totalPages} pages</span>
              )}
            </div>
            {logbookError || pageError || entryError ? <LoadError message="Logbook pages and review counts could not be loaded." href={a} /> : <>
            {coverage.length > 0 ? (
              <div className="mb-3.5 flex flex-col gap-2">
                {coverage.map((c) => (
                  <div key={c.logbookId} className="grid grid-cols-[64px_minmax(0,1fr)_96px] items-center gap-2 text-[12px]">
                    <span style={{ color: `var(--book-${c.type})` }}>{LOGBOOK_LABEL[c.type]}</span>
                    <div
                      className="relative h-3 overflow-hidden rounded border border-line bg-panel2"
                      role="img"
                      aria-label={c.first ? `${LOGBOOK_LABEL[c.type]}: entries ${c.first} to ${c.last}, ${c.gaps.length} gap(s)` : `${LOGBOOK_LABEL[c.type]}: no dated entries`}
                    >
                      {c.first && c.last &&
                        [c.first, ...c.gaps.flatMap((g) => [g.from, g.to]), c.last]
                          .reduce<[string, string][]>((segs, d, i, all) => (i % 2 === 0 ? [...segs, [d, all[i + 1]]] : segs), [])
                          .map(([from, to]) => {
                            const left = axisPercent(from, firstYear, nowYear);
                            const width = Math.max(1, axisPercent(to, firstYear, nowYear) - left);
                            return (
                              <span
                                key={from}
                                className="absolute inset-y-0 rounded-sm"
                                style={{ left: `${left}%`, width: `${width}%`, background: `var(--book-${c.type})` }}
                              />
                            );
                          })}
                    </div>
                    <span className="readout truncate text-right text-[11px] text-dim">
                      {c.count}
                      {c.first ? ` · ${c.first.slice(0, 4)}–${c.last!.slice(0, 4)}` : ""}
                    </span>
                  </div>
                ))}
                {coverageNote && <p className="mt-1 text-[11.5px] text-faint">{coverageNote}</p>}
              </div>
            ) : (
              <p className="mb-3.5 text-sm text-faint">No pages captured yet.</p>
            )}
            <div className="flex flex-wrap gap-2">
              {reviewPending > 0 ? (
                <Link
                  href={`${a}/review`}
                  className="flex-1 rounded-[9px] px-3 py-2.5 text-center text-[13px] font-semibold text-bg hover:opacity-90"
                  style={{ background: "var(--amb)" }}
                >
                  Review {reviewPending} pending pages →
                </Link>
              ) : (
                <Link
                  href={`${a}/pages`}
                  className="flex-1 rounded-[9px] border border-line2 bg-panel2 px-3 py-2.5 text-center text-[13px] text-ink hover:border-accent"
                >
                  Browse logbooks &amp; pages →
                </Link>
              )}
              {reviewPending > 0 && (
                <Link
                  href={`${a}/pages`}
                  className="rounded-[9px] border border-line2 bg-panel2 px-3 py-2.5 text-center text-[13px] text-dim hover:border-accent hover:text-ink"
                >
                  All pages
                </Link>
              )}
            </div>
            </>}
          </div>

          <div className="panel-raised p-5">
            <h2 className="text-sm font-semibold text-ink mb-3">Ask your logbook</h2>
            <Link
              href={`${a}/ask`}
              className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent underline underline-offset-4 hover:opacity-90"
            >
              Ask about your records →
            </Link>
            <p className="mt-2.5 text-[11px] leading-relaxed text-faint">
              Try “When was the engine last overhauled?” Answers cite the source entries for you to check.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

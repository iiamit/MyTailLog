import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LOGBOOK_LABEL } from "@/lib/logbooks";
import { dueText, type Urgency } from "@/lib/compliance";
import { getCurrentHours } from "@/lib/aircraftHours";
import { getAircraftRole, canEditRole } from "@/lib/access";
import {
  buildStatusItems,
  sortStatusItems,
  daysUntil,
  hoursRemaining,
  type StatusItem,
  type AdLite,
} from "@/lib/status";
import { CameraIcon, ArchiveIcon } from "@/components/icons";

const U_COLOR: Record<Urgency, string> = {
  overdue: "var(--red)",
  due_soon: "var(--amb)",
  upcoming: "var(--grn)",
  none: "var(--faint)",
};

// Compact "time/hours left" token for the forecast preview rows.
function shortRemain(item: StatusItem, cur: number | null): string {
  const d = daysUntil(item.nextDueDate);
  if (d != null) return d < 0 ? `${-d}d over` : `${d}d`;
  const h = hoursRemaining(item.nextDueHours, cur);
  if (h != null) return h < 0 ? `${-h}h over` : `${h}h`;
  return "—";
}

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
    { data: logbooks },
    { data: pages },
    { data: entryRows },
    { data: recent },
    { data: mxItems },
    { data: ads },
  ] = await Promise.all([
    supabase.from("logbook").select("id, type, title").eq("aircraft_id", id),
    supabase.from("page").select("logbook_id").eq("aircraft_id", id),
    supabase.from("log_entry").select("page_id, owner_confirmed").eq("aircraft_id", id),
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
  ]);

  const currentHours = await getCurrentHours(supabase, id, {
    hobbs: aircraft.enrollment_hobbs,
    tach: aircraft.enrollment_tach,
  });

  // Unified airworthiness list → annunciator counts + most-urgent + forecast.
  const status = buildStatusItems(mxItems ?? [], (ads ?? []) as AdLite[], currentHours);
  const sorted = sortStatusItems(status);
  const annun = {
    overdue: status.filter((s) => s.urgency === "overdue").length,
    due: status.filter((s) => s.urgency === "due_soon").length,
    current: status.filter((s) => s.urgency === "upcoming" || s.urgency === "none").length,
  };
  const attention = annun.overdue + annun.due;
  const total = annun.overdue + annun.due + annun.current || 1;
  const gauge = `conic-gradient(var(--red) 0 ${(annun.overdue / total) * 100}%, var(--amb) 0 ${
    ((annun.overdue + annun.due) / total) * 100
  }%, var(--grn) 0 100%)`;
  const attnColor = annun.overdue > 0 ? "var(--red)" : annun.due > 0 ? "var(--amb)" : "var(--grn)";
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
  const entryCount = entryRows?.length ?? 0;
  // Pages needing review = extracted pages with an unconfirmed entry (matches
  // the nav badge + Logbooks & pages), not merely review_status='unreviewed' —
  // entry-less/fully-confirmed pages have nothing to review.
  const reviewPending = new Set(
    (entryRows ?? []).filter((e) => !e.owner_confirmed).map((e) => e.page_id).filter(Boolean),
  ).size;
  const capTiles = (logbooks ?? []).map((lb) => ({
    label: lb.title ?? LOGBOOK_LABEL[lb.type] ?? lb.type,
    type: lb.type,
    count: pageCounts.get(lb.id) ?? 0,
  }));

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
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        {/* Airworthiness status */}
        <div className="panel-raised p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="eyebrow">Airworthiness status</div>
            <span className="readout text-[11px] text-dim">
              current ≈ {currentHours != null ? currentHours.toFixed(1) : "—"} hrs
            </span>
          </div>
          <div className="flex items-center gap-6">
            <div className="relative h-[132px] w-[132px] shrink-0 rounded-full" style={{ background: gauge }}>
              <div className="absolute inset-[15px] flex flex-col items-center justify-center rounded-full border border-line bg-panel">
                <span className="readout text-[30px] font-semibold leading-none" style={{ color: attnColor }}>
                  {attention}
                </span>
                {/* Wraps to two lines — the inner disc is too narrow for one. */}
                <span
                  className="mt-1 uppercase text-faint"
                  style={{
                    textAlign: "center",
                    padding: "0 12%",
                    lineHeight: 1.25,
                    fontSize: "8.5px",
                    letterSpacing: ".1em",
                    maxWidth: "100%",
                  }}
                >
                  need attention
                </span>
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-2.5">
              {[
                { c: "var(--red)", n: annun.overdue, l: "overdue" },
                { c: "var(--amb)", n: annun.due, l: "due soon" },
                { c: "var(--grn)", n: annun.current, l: "current" },
              ].map((r) => (
                <div key={r.l} className="flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.c, boxShadow: `0 0 9px ${r.c}` }} />
                  <span className="readout w-6 text-[15px]">{r.n}</span>
                  <span className="text-[12.5px] text-dim">{r.l}</span>
                </div>
              ))}
              <Link
                href={`${a}/status`}
                className="mt-1.5 self-start rounded-lg border border-line2 px-3 py-1.5 text-xs text-dim hover:border-accent hover:text-ink"
              >
                View all status →
              </Link>
            </div>
          </div>
          {mostUrgent && (
            <Link
              href={`${a}/status`}
              className="mt-5 flex items-center gap-3.5 rounded-xl border px-4 py-3.5"
              style={{ background: "var(--red-bg)", borderColor: "rgba(255,97,86,.35)" }}
            >
              <span
                className="shrink-0 rounded-md px-1.5 py-1 text-[9px] font-semibold tracking-[0.12em] text-annun-red"
                style={{ border: "1px solid rgba(255,97,86,.5)" }}
              >
                MOST URGENT
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px] font-semibold">{mostUrgent.label}</div>
                <div className="readout mt-0.5 text-[11.5px] text-annun-red">
                  {dueText(mostUrgent.nextDueDate, mostUrgent.nextDueHours, currentHours) ?? "due"}
                </div>
              </div>
              <span className="text-lg text-annun-red">→</span>
            </Link>
          )}
        </div>

        {/* Next due forecast */}
        <div className="panel p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="eyebrow">Next due · Part 91 forecast</div>
            <Link href={`${a}/maintenance`} className="text-xs text-accent hover:opacity-80">
              all →
            </Link>
          </div>
          {forecast.length > 0 ? (
            <div>
              {forecast.map((f) => (
                <Link
                  key={f.id}
                  href={`${a}/maintenance`}
                  className="flex items-center gap-3 border-b border-line py-2.5 last:border-0 hover:opacity-90"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: U_COLOR[f.urgency] }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px]">{f.label}</div>
                    <div className="readout mt-0.5 text-[11px] text-faint">
                      {dueText(f.nextDueDate, f.nextDueHours, currentHours) ?? "not scheduled"}
                    </div>
                  </div>
                  <span className="readout shrink-0 text-xs" style={{ color: U_COLOR[f.urgency] }}>
                    {shortRemain(f, currentHours)}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="py-4 text-sm text-faint">
              No recurring items yet.{" "}
              <Link href={`${a}/maintenance`} className="text-accent">
                Seed the Part 91 defaults →
              </Link>
            </p>
          )}
        </div>
      </div>

      {/* Row 2: recent activity + capture/ask */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent activity */}
        <div className="panel p-5">
          <div className="mb-2 flex items-center justify-between">
            <div className="eyebrow">Recent activity</div>
            <Link href={`${a}/timeline`} className="text-xs text-accent hover:opacity-80">
              timeline &amp; search →
            </Link>
          </div>
          {recent && recent.length > 0 ? (
            <div>
              {recent.map((e) => (
                <div key={e.id} className="flex gap-3.5 border-b border-line py-3 last:border-0">
                  <div className="readout w-[74px] shrink-0 pt-0.5 text-[11px] text-dim">
                    {e.entry_date ?? "—"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-medium"
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
            <div className="mb-3.5 flex items-center justify-between">
              <div className="eyebrow">Logbook capture</div>
              {reviewPending > 0 && (
                <span className="readout text-[11px] text-annun-amber">{reviewPending} pages need review</span>
              )}
            </div>
            {capTiles.length > 0 ? (
              <div className="mb-3.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {capTiles.map((t) => (
                  <div key={t.label} className="rounded-[9px] border border-line p-2.5 text-center">
                    <div className={`readout text-[17px] ${t.count ? "" : "text-faint"}`}>{t.count}</div>
                    <div className="eyebrow mt-0.5 truncate">{t.label}</div>
                  </div>
                ))}
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
          </div>

          <div className="panel-raised p-5">
            <div className="eyebrow mb-3">Ask your logbook</div>
            <Link
              href={`${a}/ask`}
              className="flex items-center gap-2.5 rounded-[10px] border border-line2 bg-bg px-3.5 py-3 text-[13px] text-faint hover:border-accent"
            >
              <span className="h-[15px] w-[15px] shrink-0 rounded-full border-[1.5px] border-faint" />
              When was the engine last overhauled?
            </Link>
            <p className="mt-2.5 text-[11px] leading-relaxed text-faint">
              Plain-English answers drawn only from your extracted entries — each one cites the source
              entry.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

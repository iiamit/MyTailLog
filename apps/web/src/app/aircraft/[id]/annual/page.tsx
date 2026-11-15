import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMeters } from "@/lib/aircraftHours";
import { auditADs, auditAnnuals, auditContinuity } from "@/lib/audit";
import { buildStatusItems, sortStatusItems } from "@/lib/status";
import { dueText, type Urgency } from "@/lib/compliance";
import { loadLogEntries, loadRecordPages } from "@/lib/loadLogEntries";
import { getAircraftRole, canEditRole } from "@/lib/access";

export const metadata = { title: "Annual prep — MyTailLog" };

const DOT: Record<Urgency, string> = { overdue: "var(--red)", due_soon: "var(--amb)", upcoming: "var(--grn)", none: "var(--line2)" };
const SEV: Record<string, string> = { high: "var(--red)", medium: "var(--amb)", low: "var(--faint)" };
const WINDOW_DAYS = 90; // when the annual's due date is unknown

// Everything an owner gathers before handing the aircraft and the books to an
// IA. No new data: it regroups status, squawks, AD and records-gap checks that
// other pages already compute, around the annual's due date.
export default async function AnnualPrepPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: aircraft } = await supabase.from("aircraft").select("*").eq("id", id).single();
  if (!aircraft) notFound();
  const canEdit = canEditRole(await getAircraftRole(supabase, id, aircraft.owner_id));

  const [entries, pages, { data: maintenance }, { data: ads }, { data: squawks }] = await Promise.all([
    loadLogEntries(supabase, id),
    loadRecordPages(supabase, id),
    supabase.from("maintenance_item").select("*").eq("aircraft_id", id),
    supabase.from("ad_compliance").select("*").eq("aircraft_id", id),
    supabase
      .from("squawk")
      .select("id, description, severity, reported_at")
      .eq("aircraft_id", id)
      .eq("status", "open")
      .order("reported_at", { ascending: false }),
  ]);
  const meters = await getCurrentMeters(supabase, id, {
    hobbs: aircraft.enrollment_hobbs,
    tach: aircraft.enrollment_tach,
    airframe: aircraft.enrollment_airframe,
    date: aircraft.enrollment_date,
  });
  const current = {
    tach: meters.tach.tach,
    hobbs: meters.hobbs.hobbs,
    airframe: meters.airframe.airframe,
    tachEstimated: meters.tach.estimated,
    hobbsEstimated: meters.hobbs.estimated,
    airframeEstimated: meters.airframe.estimated,
    baselineFor: meters.baselineFor,
    toTotalHours: meters.toTotalHours,
  };
  const recurringAds = (ads ?? []).filter((ad) => ad.recurring && ad.status !== "not_applicable" && ad.status !== "superseded");
  const status = sortStatusItems(buildStatusItems(maintenance ?? [], recurringAds, current));

  const annual = status.find((s) => s.kind === "annual" && s.source === "maintenance");
  const horizon =
    annual?.nextDueDate ??
    // eslint-disable-next-line react-hooks/purity -- server component: one timestamp for this request
    new Date(Date.now() + WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  // Due on or before the annual: dated items by date, hour items by urgency.
  const dueByAnnual = status.filter(
    (s) =>
      s !== annual &&
      (s.urgency === "overdue" || s.urgency === "due_soon" || (!!s.nextDueDate && s.nextDueDate <= horizon)),
  );

  const auditEntries = entries
    .filter((e) => !e.authored_superseded_by)
    .map((e) => ({ date: e.entry_date, text: `${e.description ?? ""} ${e.work_performed ?? ""}`.toLowerCase() }));
  const findings = [...auditAnnuals(auditEntries), ...auditContinuity(auditEntries), ...auditADs(ads ?? [], current.tach)]
    .sort((x, y) => (x.severity === y.severity ? 0 : x.severity === "warning" ? -1 : 1));
  const pagesToReview = pages.filter((p) => p.extraction_status === "extracted" && p.review_status !== "confirmed").length;
  const pagesUnread = pages.filter((p) => p.extraction_status !== "extracted").length;

  const a = `/aircraft/${id}`;
  const title = annual?.nextDueDate ? `Annual prep · due ${annual.nextDueDate}` : "Annual prep";

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">Workflows</div>
          <h1 className="font-display text-[27px] font-semibold">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-dim">
            What to settle before you hand the aircraft and the books to your IA: items coming due,
            open squawks for the shop, and loose ends in the digitized records.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`${a}/summary`} className="rounded-[9px] bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-bg hover:opacity-90">
            Print summary for your IA
          </Link>
        </div>
      </header>

      {!annual?.lastDoneDate && (
        <p className="panel mb-4 px-4 py-3 text-[13px] text-dim">
          The date of the last annual isn&apos;t known yet, so this page looks {WINDOW_DAYS} days ahead.{" "}
          {canEdit && <Link href={`${a}/start`} className="text-accent">Set the annual date →</Link>}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <section className="panel p-5" aria-labelledby="due-h">
          <h2 id="due-h" className="eyebrow mb-3">Due by the annual · {dueByAnnual.length}</h2>
          {dueByAnnual.length ? (
            dueByAnnual.map((s) => (
              <Link key={`${s.source}-${s.id}`} href={s.source === "ad" ? `${a}/compliance` : `${a}/maintenance`} className="flex items-center gap-2.5 border-b border-line py-2 last:border-0 hover:opacity-90">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: DOT[s.urgency] }} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[13px]">{s.label}</span>
                <span className="readout shrink-0 text-[11px] text-dim">
                  {s.hoursUnreliable ? "check" : dueText(s.nextDueDate, s.nextDueForItem, s.currentForItem) ?? "—"}
                </span>
              </Link>
            ))
          ) : (
            <p className="text-[13px] text-faint">Nothing else falls due before the annual.</p>
          )}
        </section>

        <section className="panel p-5" aria-labelledby="sq-h">
          <h2 id="sq-h" className="eyebrow mb-3">Open squawks for the shop · {squawks?.length ?? 0}</h2>
          {squawks?.length ? (
            squawks.map((q) => (
              <Link key={q.id} href={`${a}/squawks`} className="flex items-center gap-2.5 border-b border-line py-2 last:border-0 hover:opacity-90">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SEV[q.severity] }} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[13px]">{q.description}</span>
                <span className="readout shrink-0 text-[11px] text-faint">{q.reported_at.slice(0, 10)}</span>
              </Link>
            ))
          ) : (
            <p className="text-[13px] text-faint">No open squawks.</p>
          )}
        </section>

        <section className="panel p-5" aria-labelledby="books-h">
          <h2 id="books-h" className="eyebrow mb-3">Before you hand over the books</h2>
          <ul className="flex flex-col gap-2 text-[13px]">
            <Check done={pagesToReview === 0} href={`${a}/review`}>
              {pagesToReview ? `${pagesToReview} pages awaiting review` : "All extracted pages reviewed"}
            </Check>
            {pagesUnread > 0 && (
              <Check done={false} href={`${a}/pages`}>{pagesUnread} pages not read yet</Check>
            )}
            {findings.slice(0, 5).map((f) => (
              <Check key={f.title} done={false} href={`${a}/audit`} info={f.severity === "info"}>{f.title}</Check>
            ))}
            {findings.length > 5 && (
              <li><Link href={`${a}/audit`} className="text-accent">All {findings.length} records findings →</Link></li>
            )}
          </ul>
        </section>
      </div>
    </main>
  );
}

function Check({ done, href, info, children }: { done: boolean; href: string; info?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span aria-hidden className={done ? "text-annun-green" : info ? "text-faint" : "text-annun-amber"}>{done ? "✓" : "○"}</span>
      <Link href={href} className={`min-w-0 flex-1 hover:text-ink ${done ? "text-faint" : "text-dim"}`}>{children}</Link>
    </li>
  );
}

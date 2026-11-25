import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAircraftShellContext } from "@/lib/aircraftContext";
import { addDays, daysBetween, fmtDate, type DueItem } from "@/lib/due/engine";
import { dueSnapshot } from "@/lib/due/load";
import { auditADs, auditAnnuals, auditContinuity } from "@/lib/audit";
import { loadLogEntries } from "@/lib/loadLogEntries";
import { computeTimeChecks, type TimeCheckInput } from "@/lib/timeCheck";
import { staleWBChanges, type EquipChange } from "@/lib/weightBalance";
import { ROOM_MAX_DAYS } from "@/lib/recordRoom";
import { buildMapModel } from "@/lib/mapModel";
import { aircraftTail } from "@/lib/v2/landing";
import { maintTabs } from "@/lib/v2/tabs";
import { BOOK, itemSummary, lanesFor, leftText, ringLabel, rowAction } from "@/lib/v2/status";
import { annualPlan } from "@/lib/v2/annual";
import { capLabel, findVisit, monD, visitLines, visitParam, visitTitle } from "@/lib/v2/visits";
import { Board, BoardHead, HungSection, Leaf, Leaves, SourceMat, Spine } from "@/ui/Board";
import { Button, buttonClass } from "@/ui/Button";
import { Notice } from "@/ui/Form";
import { StatusMark } from "@/ui/Marks";
import { ItemMat } from "@/ui/StatusSpread";
import { VisitPanel, type VisitContext } from "../../status/VisitPanel";
import { AnnualLine, IaRoomForm } from "./AnnualClient";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Annual prep · ${await aircraftTail(id)}` };
}

const SEVERITY: Record<string, string> = { low: "Low", medium: "Watch", high: "Ground" };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const link = "font-semibold text-board-ink underline decoration-dotted";

/** W-MAINT-04 Annual prep: everything to settle before handing the aircraft and the books to the IA. */
export default async function AnnualPrepPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ visit?: string; panel?: string; err?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const [context, { data: auth }] = await Promise.all([getAircraftShellContext(supabase, id), supabase.auth.getUser()]);
  if (!context || !auth.user) notFound();
  const a = `/aircraft/${id}`;

  const due = await dueSnapshot(id, auth.user.id).catch(() => undefined);
  const openSquawks = due?.loaded.input.squawk?.filter((q) => q.status === "open").length ?? null;
  const head = (actions?: React.ReactNode) => (
    <BoardHead title="Maintenance" subTabs={maintTabs(id, "annual", { squawks: openSquawks })} actions={<><Link className={buttonClass("on-board", "s")} href={`${a}/maintenance/annual/packet`}>Prepare annual packet</Link>{actions}</>} />
  );
  if (!due) {
    if (due === null) notFound();
    return (
      <Board section="maint">
        {head()}
        <Spine tail={context.reg} context="To the annual" href={`${a}/logbooks/map`} />
        <Leaves split="2fr 1fr">
          <Leaf label="Annual prep">
            <p className="mb-3 text-lede text-ink-2">Annual prep could not be loaded.</p>
            <Button variant="quiet" href={`${a}/maintenance/annual`}>Try again</Button>
          </Leaf>
          <SourceMat />
        </Leaves>
      </Board>
    );
  }
  const { snap, loaded } = due;
  const today = snap.today;
  const input = loaded.input;

  // Records loose ends: each section fails alone (W-MAINT-04 S-ERR), so these reads never sink the page.
  const [entries, wb, components, stated, dismissals] = await Promise.all([
    loadLogEntries(supabase, id).catch(() => null),
    supabase.from("weight_balance").select("revision_date").eq("aircraft_id", id).order("revision_date", { ascending: false }).limit(1),
    supabase.from("component").select("name, install_date, removal_date").eq("aircraft_id", id),
    supabase.from("log_entry").select("id, stated_times").eq("aircraft_id", id).not("stated_times", "is", null),
    supabase.from("time_check_dismissal").select("component, log_entry_id, written_value, calculated_value").eq("aircraft_id", id),
  ]);

  const recurringAds = (input.ad_compliance ?? []).filter((r) => r.recurring && r.status !== "not_applicable" && r.status !== "superseded");
  const recurringKeys = new Set(recurringAds.map((r) => `ad:${r.id}`));
  const visits = [...snap.visits.planned, ...snap.visits.suggested];
  const plan = annualPlan(snap.items, visits, today, recurringKeys);
  const byKey = new Map(snap.items.map((i) => [i.key, i]));
  const lineTo = addDays(plan.horizon, 14);
  const squawks = (input.squawk ?? []).filter((q) => q.status === "open")
    .sort((p, q) => ["high", "medium", "low"].indexOf(p.severity ?? "low") - ["high", "medium", "low"].indexOf(q.severity ?? "low"));

  // Loose ends.
  type Loose = { key: string; what: string; why: string; action: React.ReactNode };
  const loose: Loose[] = [];
  for (const g of (input.logbook_gap ?? []).filter((g) => g.status === "open")) {
    const book = input.logbook?.find((b) => b.id === g.logbook_id);
    loose.push({
      key: `gap-${g.id}`,
      what: `No ${BOOK[book?.type ?? "other"]?.toLowerCase() ?? ""} pages for ${g.from_date.slice(0, 4)} to ${g.to_date.slice(0, 4)}`,
      why: "The IA will ask where those years are.",
      action: <Link href={`${a}/logbooks/map?gap=${g.id}`} className={link}>Show the gap</Link>,
    });
  }
  if (snap.counts.pagesToReview > 0)
    loose.push({
      key: "review", what: `${plural(snap.counts.pagesToReview, "page")} waiting for review`, why: "Only confirmed entries count and reach the IA's room.",
      action: <Link href={`${a}/logbooks/review`} className={link}>Review {plural(snap.counts.pagesToReview, "page")}</Link>,
    });
  if (snap.counts.pagesBeingRead > 0)
    loose.push({
      key: "reading", what: `${plural(snap.counts.pagesBeingRead, "page")} not read yet`, why: "They are still being read.",
      action: <Link href={`${a}/logbooks/review`} className={link}>See the queue</Link>,
    });
  const changes: EquipChange[] = [];
  for (const c of components.data ?? []) {
    if (c.install_date) changes.push({ name: c.name, date: c.install_date, kind: "install" });
    if (c.removal_date) changes.push({ name: c.name, date: c.removal_date, kind: "removal" });
  }
  const latestWb = wb.data?.[0]?.revision_date ?? null;
  const stale = wb.error || components.error ? [] : staleWBChanges(latestWb, changes);
  if (latestWb && stale.length)
    loose.push({
      key: "wb", what: "Weight and balance may be stale",
      why: `${stale[0].name} was ${stale[0].kind === "install" ? "installed" : "removed"} ${fmtDate(stale[0].date)}, after the last revision.`,
      action: <Link href={`${a}/weight-balance`} className={link}>Open W&amp;B</Link>,
    });
  if (!stated.error && !dismissals.error) {
    const statedById = new Map((stated.data ?? []).map((e) => [e.id, e.stated_times]));
    const checks = computeTimeChecks({
      maintenance_item: input.maintenance_item ?? [],
      item_completion: input.item_completion ?? [],
      log_entry: (input.log_entry ?? []).map((e) => ({ ...e, stated_times: statedById.get(e.id) ?? null })),
      logbook: input.logbook ?? [],
      page: input.page ?? [],
      meter_reset: input.meter_reset ?? [],
      time_check_dismissal: dismissals.data ?? [],
    } as TimeCheckInput);
    for (const c of checks.filter((c) => c.result === "apart" && !c.dismissed).slice(0, 2))
      loose.push({
        key: `tc-${c.entryId}`,
        what: `${c.component === "engine" ? "Engine" : "Propeller"} time since overhaul: written and calculated are ${c.difference.toFixed(1)} h apart`,
        why: `Written ${c.written.toFixed(1)}${c.pageRef ? ` on ${c.pageRef.label}` : ""}, calculated ${c.calculated.toFixed(1)}. Only a new entry can correct the book.`,
        action: <Link href={`${a}/hours#check`} className={link}>See the check</Link>,
      });
  }
  const findings = entries
    ? [
        ...auditAnnuals(entries.filter((e) => !e.authored_superseded_by).map((e) => ({ date: e.entry_date, text: `${e.description ?? ""} ${e.work_performed ?? ""}`.toLowerCase() }))),
        ...auditContinuity(entries.filter((e) => !e.authored_superseded_by).map((e) => ({ date: e.entry_date, text: `${e.description ?? ""} ${e.work_performed ?? ""}`.toLowerCase() }))),
        ...auditADs((input.ad_compliance ?? []).map((r) => ({ ...r, kind: r.kind ?? "ad", recurring: !!r.recurring, status: r.status ?? "open", next_due_date: r.next_due_date ?? null, next_due_hours: r.next_due_hours ?? null, complied_date: r.complied_date ?? null })), snap.meters.tach.face ?? null, today),
      ]
    : null;
  if (findings?.length)
    loose.push({
      key: "audit", what: findings.length === 1 ? findings[0].title : `${findings.length} records findings`, why: findings[0].detail,
      action: <Link href={`${a}/maintenance/records-check`} className={link}>{findings.length === 1 ? "See the finding" : `All ${findings.length} records findings`}</Link>,
    });

  // Verdict (W-MAINT-04).
  const onTheWay = plan.before.length;
  const verdict = plan.due
    ? plan.daysLeft! < 0
      ? `The annual was due ${fmtDate(plan.due)}. It has lapsed by ${plural(-plan.daysLeft!, "day")}.`
      : `The next annual is due ${fmtDate(plan.due)}, in ${plural(plan.daysLeft!, "day")}. On the way: ${plural(onTheWay, "item")} ${onTheWay === 1 ? "falls" : "fall"} due, ${plural(squawks.length, "squawk")} for the shop and ${plural(loose.length, "loose end")} in the records.`
    : `In the next 90 days: ${plural(onTheWay, "item")} ${onTheWay === 1 ? "falls" : "fall"} due, ${plural(squawks.length, "squawk")} for the shop and ${plural(loose.length, "loose end")} in the records.`;

  // Line ahead to the annual + 14 days, with visits.
  const lanes = lanesFor((input.logbook ?? []).map((b) => b.type), snap.lineAhead.rings.map((r) => r.line));
  const rings = snap.lineAhead.rings.filter((r) => r.date <= lineTo).flatMap((r) => {
    const item = byKey.get(r.itemKey);
    return item ? [{ key: r.itemKey, line: r.line, date: r.date, status: r.status, projected: r.dateKind === "projected", left: leftText(item), label: ringLabel(item, today), name: itemSummary(item) }] : [];
  });
  const caps = visits.filter((v) => (v.visitDate ?? v.weekOf) <= lineTo).map((v) => ({
    key: visitParam(v), date: v.visitDate ?? v.weekOf, lines: visitLines(v, (k) => byKey.get(k)?.line, lanes),
    kind: v.status as "suggested" | "planned" | "in_shop" | "awaiting_records", label: capLabel(v, snap.visits.suggested.indexOf(v) + 1),
    name: visitTitle(v),
  }));
  const open = findVisit(visits, sp.visit);
  const vc: VisitContext = {
    aircraftId: id, today, canEdit: context.canEdit, items: byKey,
    squawks: new Map((input.squawk ?? []).map((q) => [q.id, q.description])),
    providers: (input.service_provider ?? []).map((p) => ({ id: p.id, name: p.name })), base: `${a}/maintenance/annual`,
  };

  const roomDays = Math.min(ROOM_MAX_DAYS, Math.max(1, plan.due ? daysBetween(today, addDays(plan.due, 30)) : 120));
  const until = fmtDate(addDays(today, roomDays));
  const confirmed = (input.log_entry ?? []).filter((e) => e.trust !== "ai_read" && !e.replaced_by_entry_id).length;
  const lastAnnual = plan.annual?.lastDone;

  const row = (item: DueItem, extra?: string) => {
    const act = rowAction(item, id);
    return (
      <li key={item.key} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
        <span className="min-w-0 flex-1">
          <Link href={`${a}/status/item/${item.key}`} className="block text-body-strong hover:underline">{item.label}</Link>
          <span className="block text-small text-ink-3">{[item.rule, extra].filter(Boolean).join(" · ")}</span>
        </span>
        <span className={`text-right font-bold whitespace-nowrap ${item.status === "overdue" ? "text-alarm-text" : ""}`}>{leftText(item)}</span>
        <span className="w-[104px]"><StatusMark kind={item.advisory && item.status === "current" ? "advisory" : item.status} compact /></span>
        {context.canEdit && act && <Link href={act.href} className={buttonClass("secondary", "s")}>{act.label}</Link>}
      </li>
    );
  };

  const actions = (
    <>
      {lastAnnual?.date && <span>Last annual {fmtDate(lastAnnual.date)}</span>}
      {context.isOwner && <a href="#for-your-ia" className={buttonClass("on-board", "m")}>Share with your IA</a>}
    </>
  );

  return (
    <Board section="maint">
      {head(actions)}
      <Spine
        tail={context.reg}
        context="To the annual"
        href={`${a}/logbooks/map`}
        model={buildMapModel(loaded.input, loaded.today)}
        window={{ from: today, to: plan.horizon }}
        statusHref={`${a}/status`}
        windowDescription="today to the annual bracketed"
      />
      <Leaves split="2fr 1fr">
        <Leaf label="Annual prep">
          {sp.err && !open && <div className="mb-3"><Notice tone="alarm">{sp.err}</Notice></div>}
          {!plan.due && (
            <div className="mb-3">
              <Notice>
                The date of the last annual isn&apos;t known yet, so this page looks 90 days ahead.{" "}
                {context.canEdit && <Link href={`${a}/status`} className={link}>Set the annual date</Link>}
              </Notice>
            </div>
          )}
          <p className={`mb-4 max-w-[46ch] text-lede ${plan.daysLeft != null && plan.daysLeft < 0 ? "font-semibold text-alarm-text" : ""}`}>{verdict}</p>
          <AnnualLine
            aircraftId={id}
            from={today}
            to={lineTo}
            lanes={lanes}
            rings={rings}
            caps={caps}
            selectedCap={open ? visitParam(open) : null}
            summary={`${rings.length} items and ${caps.length} visits between today and ${fmtDate(lineTo)}.`}
          />
          {squawks.length > 0 && <p className="mb-2 text-small text-ink-3">{plural(squawks.length, "open squawk")} on the airframe line.</p>}

          <HungSection title="Falls due before the annual" count={plural(plan.before.length, "item")} first>
            {plan.before.length ? <ul className="divide-y divide-rule">{plan.before.map((i) => row(i))}</ul> : <p className="text-body text-ink-2">Nothing else falls due before the annual.</p>}
          </HungSection>

          {plan.ridesAlong.length > 0 && (
            <HungSection
              title={plan.rideVisit ? `Rides along at the ${monD(plan.rideVisit.visitDate ?? plan.rideVisit.weekOf)} visit` : "Rides along with the annual"}
              count={plural(plan.ridesAlong.length, "item")}
            >
              <ul className="divide-y divide-rule">
                {plan.ridesAlong.map((i) => {
                  const early = plan.rideVisit?.items.find((x) => x.key === i.key)?.earlyBy;
                  return row(i, early?.hours ? `about ${early.hours} h before it is due` : early?.days ? `${plural(early.days, "day")} early` : undefined);
                })}
              </ul>
              {plan.rideVisit && (
                <Link href={`${a}/maintenance/annual?visit=${encodeURIComponent(visitParam(plan.rideVisit))}`} className={`mt-2 inline-block text-small ${link}`}>
                  Open the visit
                </Link>
              )}
            </HungSection>
          )}

          <HungSection title="Recurring ADs" count={plural(recurringAds.length, "AD")}>
            {recurringAds.length ? (
              <ul className="divide-y divide-rule">
                {recurringAds.map((r) => {
                  const item = byKey.get(`ad:${r.id}`);
                  const every = [r.interval_hours ? `${r.interval_hours} hours` : null, r.interval_months ? `${r.interval_months} months` : null].filter(Boolean).join(" or ");
                  const at = plan.rideVisit?.items.find((x) => x.key === `ad:${r.id}`);
                  return (
                    <li key={r.id} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                      <span className="min-w-0 flex-1">
                        <Link href={`${a}/maintenance/ads?ad=${r.id}`} className="block text-body-strong hover:underline">
                          {r.kind === "sb" ? "SB" : "AD"} {r.reference}
                        </Link>
                        <span className="block text-small text-ink-3">
                          {[every ? `every ${every}` : null, at ? `do it at the ${monD(plan.rideVisit!.weekOf)} visit` : null, item?.lastDone?.pageLabel ?? null].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      {item && <span className="font-bold whitespace-nowrap">{leftText(item)}</span>}
                      {item && <span className="w-[104px]"><StatusMark kind={item.status} compact /></span>}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-body text-ink-2">No recurring ADs are tracked.</p>
            )}
          </HungSection>

          <HungSection title="For the shop" count={plural(squawks.length, "open squawk")}>
            {squawks.length ? (
              <ul className="divide-y divide-rule">
                {squawks.map((q) => (
                  <li key={q.id} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                    <span className="min-w-0 flex-1">
                      <Link href={`${a}/maintenance/squawks?squawk=${q.id}`} className="block text-body-strong hover:underline">{q.description}</Link>
                      <span className="block text-small text-ink-3">{q.reported_at ? `Reported ${fmtDate(q.reported_at.slice(0, 10))}` : "Open"}</span>
                    </span>
                    <span className={`text-small font-bold ${q.severity === "high" ? "rounded-[3px] bg-alarm px-2 py-0.5 text-on-alarm" : "text-ink-2"}`}>
                      {SEVERITY[q.severity ?? "low"] ?? "Low"}
                    </span>
                    {context.canEdit && (
                      <Link href={`${a}/maintenance/squawks?squawk=${q.id}&panel=send`} className={buttonClass("secondary", "s")}>Send to mechanic</Link>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body text-ink-2">No open squawks.</p>
            )}
          </HungSection>

          <HungSection title="Loose ends in the records" count={plural(loose.length, "loose end")}>
            {findings === null && <p className="mb-2 text-small text-ink-3">The records check could not be loaded.</p>}
            {loose.length ? (
              <ul className="divide-y divide-rule">
                {loose.map((l) => (
                  <li key={l.key} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-body-strong">{l.what}</span>
                      <span className="block text-small text-ink-3">{l.why}</span>
                    </span>
                    <span className="text-small">{l.action}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body text-ink-2">No loose ends found. The checks are rules of thumb; give the pages a look too.</p>
            )}
          </HungSection>
        </Leaf>

        {open ? (
          <VisitPanel visit={open} c={vc} panel={sp.panel} err={sp.err} />
        ) : (
          <div className="flex min-h-0 min-w-0 flex-col gap-2.5">
            <Leaf label="For your IA" className="shrink-0">
              <h2 id="for-your-ia" className="text-heading">For your IA</h2>
              <p className="mt-1 mb-4 text-small text-ink-2">
                A read-only record room for your IA. Its cover is this checklist and the line ahead.
              </p>
              {context.isOwner ? (
                <IaRoomForm
                  aircraftId={id}
                  days={roomDays}
                  until={until}
                  books={input.logbook?.length ?? 0}
                  entries={confirmed}
                  pages={input.page?.length ?? 0}
                  documents={input.document?.length ?? 0}
                />
              ) : (
                <p className="text-body text-ink-2">The owner shares the records with the IA.</p>
              )}
              <Link href={`${a}/summary`} className={`${buttonClass("secondary", "s")} mt-3`}>Print the summary for your IA</Link>
            </Leaf>
            {plan.annual ? <ItemMat item={plan.annual} aircraftId={id} /> : <SourceMat />}
          </div>
        )}
      </Leaves>
    </Board>
  );
}

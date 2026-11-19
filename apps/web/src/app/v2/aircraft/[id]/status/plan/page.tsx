import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAircraftShellContext } from "@/lib/aircraftContext";
import { addMonths, computeStatus, fmtDate, type VisitView } from "@/lib/due/engine";
import { dueSnapshot } from "@/lib/due/load";
import { buildMapModel, isIsoDate } from "@/lib/mapModel";
import { aircraftTail } from "@/lib/v2/landing";
import { clampPlanDate, parseRate } from "@/lib/v2/plan";
import { fmtMeter, lanesFor } from "@/lib/v2/status";
import { capLabel, earlyText, findVisit, monD, visitLines, visitParam } from "@/lib/v2/visits";
import { Board, BoardHead, Leaf, Leaves, Spine } from "@/ui/Board";
import { Button, buttonClass } from "@/ui/Button";
import { dismissVisitSuggestion } from "../actions";
import { VisitPanel, type VisitContext } from "../VisitPanel";
import { PlanClient } from "./PlanClient";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Plan ahead · ${await aircraftTail(id)}` };
}

/** W-STATUS-03 Plan ahead: the next 24 months, a date to test and the visits that would keep everything in date. */
export default async function PlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string; rate?: string; visit?: string; panel?: string; booked?: string; err?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const [context, { data: auth }] = await Promise.all([getAircraftShellContext(supabase, id), supabase.auth.getUser()]);
  if (!context || !auth.user) notFound();
  const a = `/aircraft/${id}`;
  const due = await dueSnapshot(id, auth.user.id).catch(() => undefined);

  const subTabs = [
    { label: "What's due", href: `${a}/status` },
    { label: "Plan ahead", href: `${a}/status/plan`, current: true },
  ];
  const tach = due?.snap.meters.tach;
  const readout = tach?.face != null && tach.asOf ? <span>Tach {fmtMeter(tach.face)}, read {fmtDate(tach.asOf)}</span> : null;

  if (!due) {
    if (due === null) notFound();
    return (
      <Board section="status">
        <BoardHead title="Status" subTabs={subTabs} />
        <Spine tail={context.reg} context="The next 24 months" href={`${a}/logbooks/map`} />
        <Leaves split="2.05fr 1fr">
          <Leaf label="Plan ahead">
            <p className="mb-3 text-lede text-ink-2">The plan could not be worked out.</p>
            <Button variant="quiet" href={`${a}/status/plan`}>Try again</Button>
          </Leaf>
          <Leaf label="The answer"><span /></Leaf>
        </Leaves>
      </Board>
    );
  }

  const { loaded } = due;
  const today = loaded.today;
  // Plan ahead's own run: 24 months and up to 6 suggested visits (09 §3.5 step 10).
  const status = computeStatus(loaded.input, today, { horizonMonths: 24, limit: 6 });
  const to = addMonths(today, 24);
  const lanes = lanesFor((loaded.input.logbook ?? []).map((b) => b.type), status.items.map((i) => i.line).filter((l): l is string => !!l));
  const byKey = new Map(status.items.map((i) => [i.key, i]));
  const providers = new Map((loaded.input.service_provider ?? []).map((p) => [p.id, p.name]));
  const squawks = new Map((loaded.input.squawk ?? []).map((q) => [q.id, q.description]));
  const nameOf = (key: string) => (key.startsWith("squawk:") ? (squawks.get(key.slice(7)) ?? "A squawk") : (byKey.get(key)?.label ?? "An item"));
  const all = [...status.visits.planned, ...status.visits.suggested];
  const open = findVisit(all, sp.visit);
  const visitHref = (v: VisitView) => `${a}/status/plan?visit=${encodeURIComponent(visitParam(v))}`;

  const caps = all.map((v) => ({
    key: visitParam(v),
    date: v.visitDate ?? v.weekOf,
    lines: visitLines(v, (k) => byKey.get(k)?.line, lanes),
    kind: v.status as "suggested" | "planned" | "in_shop" | "awaiting_records",
    label: capLabel(v, status.visits.suggested.indexOf(v) + 1),
    name: `${capLabel(v, status.visits.suggested.indexOf(v) + 1)}. ${v.items.map((i) => nameOf(i.key)).join(", ")}.`,
  }));

  const row = (v: VisitView, n: number) => {
    const sel = open && visitParam(open) === visitParam(v);
    const items = v.items.map((i) => {
      const p = byKey.get(i.key)?.providerId;
      return `${nameOf(i.key)}${p && providers.get(p) ? ` (${providers.get(p)})` : ""}`;
    });
    const early = v.items.flatMap((i) => (earlyText(i.earlyBy) ? [`${nameOf(i.key)}, ${earlyText(i.earlyBy)}`] : []));
    const suggested = v.status === "suggested";
    return (
      <li key={visitParam(v)} className={`border-t border-rule py-3 ${sel ? "bg-highlight -mx-3 px-3" : ""}`}>
        <Link href={visitHref(v)} replace scroll={false} className="text-body-strong underline-offset-2 hover:underline" aria-current={sel ? "true" : undefined}>
          {suggested ? `Visit ${n}, week of ${monD(v.weekOf)}` : `${v.status === "planned" ? "Planned" : v.status === "in_shop" ? "In the shop" : "Awaiting records"}, week of ${monD(v.weekOf)}`}
        </Link>
        <p className="text-small text-ink-2">
          {[v.place, items.join(" · ")].filter(Boolean).join(" · ")}
          {suggested && v.clearsBeforeLapse > 0 ? ` · clears ${v.clearsBeforeLapse} ${v.clearsBeforeLapse === 1 ? "item" : "items"} before ${v.clearsBeforeLapse === 1 ? "it lapses" : "they lapse"}` : ""}
        </p>
        {early.length > 0 && <p className="text-small text-ink-3">{early.join(" · ")}</p>}
        {suggested && context.canEdit && v.suggestionKey && (
          <div className="mt-2 flex gap-2">
            <Link href={`${visitHref(v)}&panel=book`} replace scroll={false} className={buttonClass("secondary", "s")}>Book this visit</Link>
            <form action={dismissVisitSuggestion.bind(null, id, v.suggestionKey)}>
              <button type="submit" className={buttonClass("quiet", "s")}>Dismiss</button>
            </form>
          </div>
        )}
      </li>
    );
  };

  const visits = (
    <>
      <section className="mt-5">
        <h3 className="text-section">Suggested visits <span className="text-small font-normal text-ink-3">bundled by date</span></h3>
        {status.visits.suggested.length ? (
          <ol className="mt-1">{status.visits.suggested.map((v, i) => row(v, i + 1))}</ol>
        ) : (
          <p className="mt-1 text-small text-ink-3">No visits to suggest in the next 24 months.</p>
        )}
      </section>
      {status.visits.planned.length > 0 && (
        <section className="mt-5">
          <h3 className="text-section">Planned visits</h3>
          <ol className="mt-1">{status.visits.planned.map((v, i) => row(v, i + 1))}</ol>
        </section>
      )}
    </>
  );

  const vc: VisitContext = {
    aircraftId: id, today, canEdit: context.canEdit, items: byKey, squawks,
    providers: (loaded.input.service_provider ?? []).map((p) => ({ id: p.id, name: p.name })), base: `${a}/status/plan`,
  };
  const date = sp.date && isIsoDate(sp.date) ? clampPlanDate(sp.date, today) : null;

  return (
    <Board section="status">
      <BoardHead title="Status" subTabs={subTabs} actions={readout} />
      <Spine
        tail={context.reg}
        context="The next 24 months"
        href={`${a}/logbooks/map`}
        model={buildMapModel(loaded.input, today)}
        window={{ from: today, to }}
        statusHref={`${a}/status/plan`}
        windowDescription="the next 24 months bracketed"
      />
      <PlanClient
        aircraftId={id}
        status={status}
        lanes={lanes}
        to={to}
        initialDate={date}
        initialRate={parseRate(sp.rate)}
        canEdit={context.canEdit}
        caps={caps}
        selectedCap={open ? visitParam(open) : null}
        visits={visits}
        right={open ? <VisitPanel visit={open} c={vc} panel={sp.panel} booked={sp.booked === "1"} err={sp.err} /> : undefined}
      />
    </Board>
  );
}

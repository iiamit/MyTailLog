import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAircraftShellContext } from "@/lib/aircraftContext";
import { fmtDate } from "@/lib/due/engine";
import { dueSnapshot } from "@/lib/due/load";
import { aircraftTail } from "@/lib/v2/landing";
import { fmtMeter, lanesFor, parseFilter, ratePhrase } from "@/lib/v2/status";
import { buildMapModel } from "@/lib/mapModel";
import { Board, BoardHead, Leaf, Leaves, SourceMat, Spine } from "@/ui/Board";
import { Button } from "@/ui/Button";
import { StatusSpread } from "@/ui/StatusSpread";
import { Verdict } from "@/ui/Verdict";
import { capLabel, findVisit, monD, visitLines, visitNotices, visitParam, visitRowNotes, visitTitle } from "@/lib/v2/visits";
import { Notice } from "@/ui/Form";
import { moveVisitTo, seedStandardFromStatus, setVisitStatus } from "./actions";
import { VisitPanel, type VisitContext } from "./VisitPanel";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `What's due · ${await aircraftTail(id)}` };
}

/** W-STATUS-01 What's due (and the W-STATUS-02 situations, which share its anatomy until their panels land). */
export default async function StatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string; visit?: string; panel?: string; booked?: string; err?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const filter = parseFilter(sp.filter);
  const supabase = await createClient();
  const [context, { data: auth }] = await Promise.all([getAircraftShellContext(supabase, id), supabase.auth.getUser()]);
  if (!context || !auth.user) notFound();
  const a = `/aircraft/${id}`;

  const due = await dueSnapshot(id, auth.user.id).catch(() => undefined);
  const loaded = due === undefined ? undefined : (due?.loaded ?? null);
  const head = (actions?: React.ReactNode) => (
    <>
      <BoardHead
        title="Status"
        subTabs={[
          { label: "What's due", href: `${a}/status`, current: true },
          { label: "Plan ahead", href: `${a}/status/plan` },
        ]}
        actions={actions}
      />
      <Spine
        tail={context.reg}
        context="The next twelve months"
        href={`${a}/logbooks/map`}
        model={due ? buildMapModel(due.loaded.input, due.loaded.today) : null}
        window={due ? { from: due.snap.today, to: due.snap.lineAhead.to } : null}
        statusHref={`${a}/status`}
        windowDescription="the next twelve months bracketed"
      />
    </>
  );

  // S-ERR: never a stale or partial verdict.
  if (loaded === undefined) {
    return (
      <Board section="status">
        {head()}
        <Leaves>
          <Leaf label="What's due">
            <p className="mb-3 text-lede text-ink-2">Tracked status could not be loaded. Nothing is assessed until it loads.</p>
            <Button variant="quiet" href={`${a}/status`}>
              Try again
            </Button>
          </Leaf>
          <SourceMat />
        </Leaves>
      </Board>
    );
  }
  if (!loaded) notFound();

  const snap = due!.snap;
  const tach = snap.meters.tach;
  const readout = tach.face != null && tach.asOf ? `Tach ${fmtMeter(tach.face)}, read ${fmtDate(tach.asOf)}` : null;
  const actions = (
    <>
      {readout && <span>{readout}</span>}
      {context.canEdit && (
        <Button variant="on-board" href={`${a}/hours?panel=reading`}>
          Log a flight
        </Button>
      )}
    </>
  );

  const lanes = lanesFor(
    (loaded.input.logbook ?? []).map((b) => b.type),
    snap.lineAhead.rings.map((r) => r.line),
  );
  const rate = ratePhrase(snap.rate);
  const waiting = snap.counts.pagesToReview;
  const notifyOn = loaded.preferences?.notify_due === true; // same rule as the reminder cron: off unless switched on

  const foot = (
    <div className="mt-5 space-y-2 text-small text-ink-3">
      <p>
        Counted from entries you confirmed. Pages waiting for review do not move any date.{" "}
        {rate ? `Hours become dates at ${rate}.` : "No recent flying, so hours are not turned into dates."}
        {waiting > 0 && (
          <>
            {" "}
            {waiting === 1 ? "1 page is" : `${waiting} pages are`} waiting for review.{" "}
            {context.canEdit && (
              <Link href={`${a}/logbooks/review`} className="font-semibold text-board-ink underline decoration-dotted">
                Review {waiting === 1 ? "1 page" : `${waiting} pages`}
              </Link>
            )}
          </>
        )}
      </p>
      <p>
        {notifyOn ? "Reminders: email and phone before each item, at your lead times." : "Reminders are off."}{" "}
        {context.isOwner && (
          <Link href="/profile#reminders" className="font-semibold text-board-ink underline decoration-dotted">
            {notifyOn ? "Change lead times" : "Turn them on"}
          </Link>
        )}
      </p>
    </div>
  );

  // Visits (C-PLAN-02, C-PLAN-03): caps on the line ahead, notices above the verdict, the VisitPanel on the right.
  const byKey = new Map(snap.items.map((i) => [i.key, i]));
  const allVisits = [...snap.visits.planned, ...snap.visits.suggested];
  const caps = allVisits.map((v) => {
    const n = snap.visits.suggested.indexOf(v) + 1;
    const label = capLabel(v, n);
    const names = v.items.map((i) => byKey.get(i.key)?.label ?? "a squawk").join(", ");
    return {
      key: visitParam(v),
      date: v.visitDate ?? v.weekOf,
      lines: visitLines(v, (k) => byKey.get(k)?.line, lanes),
      kind: v.status as "suggested" | "planned" | "in_shop" | "awaiting_records",
      label,
      name: `${visitTitle(v)}. ${v.status === "suggested" ? "Clears" : "Holds"} ${names}.`,
    };
  });
  const open = findVisit(allVisits, sp.visit);
  const squawks = new Map((due!.loaded.input.squawk ?? []).map((q) => [q.id, q.description]));
  const vc: VisitContext = {
    aircraftId: id, today: snap.today, canEdit: context.canEdit, items: byKey, squawks,
    providers: (due!.loaded.input.service_provider ?? []).map((p) => ({ id: p.id, name: p.name })), base: `${a}/status`,
  };
  const notices = visitNotices(snap.visits.planned, snap.today).map((n) => {
    const v = n.visit;
    const vp = `${a}/status?visit=${encodeURIComponent(visitParam(v))}`;
    const day = monD(v.visitDate ?? v.weekOf);
    if (n.kind === "at_risk")
      return (
        <Well key={`r-${v.id}`}>
          The {byKey.get(n.itemKey)?.label ?? "item"} now falls {n.daysBefore} {n.daysBefore === 1 ? "day" : "days"} before the {day} visit.{" "}
          {context.canEdit && v.id && (
            <form action={moveVisitTo.bind(null, id, v.id, n.moveTo, v.updatedAt ?? "")} className="mt-2">
              <button type="submit" className="font-semibold text-board-ink underline decoration-dotted">
                Move the visit to the week of {monD(n.moveTo)}
              </button>
            </form>
          )}
        </Well>
      );
    if (n.kind === "in_shop")
      return (
        <Well key={`s-${v.id}`}>
          Is {context.reg} at the shop this week?{" "}
          {context.canEdit && v.id && (
            <form action={setVisitStatus.bind(null, id, v.id, "in_shop", v.updatedAt ?? "", "status")} className="mt-2 inline-flex gap-3">
              <button type="submit" className="font-semibold text-board-ink underline decoration-dotted">Yes, it&apos;s in the shop</button>
              <Link href={vp} className="font-semibold text-board-ink underline decoration-dotted">Open the visit</Link>
            </form>
          )}
        </Well>
      );
    return (
      <Well key={`h-${v.id}`}>
        Did the {day} visit happen? Mark what was done and add its pages.{" "}
        <Link href={vp} className="font-semibold text-board-ink underline decoration-dotted">Open the visit</Link>
      </Well>
    );
  });
  const errNote = sp.err && !open ? <Notice tone="alarm">{sp.err}</Notice> : null;

  const verdict = (
    <>
      {(notices.length > 0 || errNote) && <div className="mb-4 flex flex-col gap-2">{errNote}{notices}</div>}
      <Verdict verdict={snap.verdict} overdue={snap.counts.overdue > 0} />
    </>
  );
  const empty = snap.items.length === 0 && (
    <div className="mt-4 border-t-2 border-ink pt-4">
      {context.canEdit ? (
        <div className="flex flex-wrap gap-2">
          <form action={seedStandardFromStatus.bind(null, id)}>
            <button type="submit" className="state-layer inline-flex h-[42px] items-center rounded-control border border-ink bg-ink px-[18px] text-button text-leaf">
              Add the standard Part 91 items
            </button>
          </form>
          <Button href={`${a}/maintenance/items?panel=new`}>Track an item</Button>
        </div>
      ) : (
        <p className="text-body text-ink-2">You can view this aircraft. Ask the owner to make you an editor to track items.</p>
      )}
    </div>
  );

  return (
    <Board section="status">
      {head(actions)}
      <StatusSpread
        aircraftId={id}
        today={snap.today}
        items={snap.items}
        lineAhead={snap.lineAhead}
        lanes={lanes}
        filter={filter}
        canEdit={context.canEdit}
        head={verdict}
        caps={caps}
        selectedCap={open ? visitParam(open) : null}
        right={open ? <VisitPanel visit={open} c={vc} panel={sp.panel} booked={sp.booked === "1"} err={sp.err} /> : undefined}
        rowNotes={visitRowNotes(snap.visits.planned)}
        foot={
          <>
            {empty}
            {snap.items.length > 0 && foot}
          </>
        }
      />
    </Board>
  );
}

/** A notice Well (02 §7.9) that may hold a form, so it is a div rather than Notice's paragraph. */
function Well({ children }: { children: React.ReactNode }) {
  return <div role="status" className="rounded-[var(--radius-s)] bg-leaf-2 px-4 py-3 text-body">{children}</div>;
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAircraftShellContext } from "@/lib/aircraftContext";
import { computeStatus, fmtDate } from "@/lib/due/engine";
import { loadDueInput } from "@/lib/due/load";
import { aircraftTail } from "@/lib/v2/landing";
import { fmtMeter, lanesFor, parseFilter, ratePhrase } from "@/lib/v2/status";
import { Board, BoardHead, Leaf, Leaves, SourceMat, Spine } from "@/ui/Board";
import { Button } from "@/ui/Button";
import { StatusSpread } from "@/ui/StatusSpread";
import { Verdict } from "@/ui/Verdict";
import { seedStandardFromStatus } from "./actions";

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
  searchParams: Promise<{ filter?: string }>;
}) {
  const { id } = await params;
  const filter = parseFilter((await searchParams).filter);
  const supabase = await createClient();
  const [context, { data: auth }] = await Promise.all([getAircraftShellContext(supabase, id), supabase.auth.getUser()]);
  if (!context || !auth.user) notFound();
  const a = `/aircraft/${id}`;

  const loaded = await loadDueInput(supabase, id, auth.user.id).catch(() => undefined);
  const head = (actions?: React.ReactNode) => (
    <>
      <BoardHead title="Status" subTabs={[{ label: "What's due", href: `${a}/status`, current: true }]} actions={actions} />
      <Spine tail={context.reg} context="The next twelve months" href={`${a}/logbooks`} />
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

  const snap = computeStatus(loaded.input, loaded.today);
  const tach = snap.meters.tach;
  const readout = tach.face != null && tach.asOf ? `Tach ${fmtMeter(tach.face)}, read ${fmtDate(tach.asOf)}` : null;
  const actions = (
    <>
      {readout && <span>{readout}</span>}
      {context.canEdit && (
        <Button variant="on-board" href={`${a}/meters?ui=v1`}>
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
  const notifyOn = loaded.preferences?.notify_due !== false;

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
              <Link href={`${a}/review`} className="font-semibold text-board-ink underline decoration-dotted">
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

  const verdict = <Verdict verdict={snap.verdict} overdue={snap.counts.overdue > 0} />;
  const empty = snap.items.length === 0 && (
    <div className="mt-4 border-t-2 border-ink pt-4">
      {context.canEdit ? (
        <div className="flex flex-wrap gap-2">
          <form action={seedStandardFromStatus.bind(null, id)}>
            <button type="submit" className="state-layer inline-flex h-[42px] items-center rounded-control border border-ink bg-ink px-[18px] text-button text-leaf">
              Add the standard Part 91 items
            </button>
          </form>
          <Button href={`${a}/maintenance?ui=v1`}>Track an item</Button>
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

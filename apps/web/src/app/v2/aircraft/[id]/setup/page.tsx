import { FindDetails } from "./FindDetails";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAircraftShellContext } from "@/lib/aircraftContext";
import { dueSnapshot } from "@/lib/due/load";
import { fmtDate } from "@/lib/due/engine";
import { DEFAULT_SEED_KINDS } from "@/lib/maintenance";
import { aircraftTail } from "@/lib/v2/landing";
import { Board, BoardHead, HungSection, Leaf, Leaves } from "@/ui/Board";
import { Button, buttonClass } from "@/ui/Button";
import { StatusMark } from "@/ui/Marks";
import { Verdict } from "@/ui/Verdict";
import { ItemDateForm, MetersForm, RemindersToggle } from "./SetupClient";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  return { title: `Set up ${await aircraftTail((await params).id)}` };
}

const NAME: Record<string, string> = { annual: "Annual inspection", transponder: "Transponder", pitot_static: "Pitot-static and altimeter", elt: "ELT inspection" };

/**
 * W-SETUP-01 First-session setup: meters today, the last annual, reminders, ending in the first verdict. Every
 * answer saves on its own and can be changed; there is no stepper. Replaces /start.
 * shortcut: "Find it on a scanned page" opens Add pages instead of reading the annual inline; bring the inline read
 * (upload, pick the entry, "That's right") over from v1 /start when the capture flow is shared.
 */
export default async function SetupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [context, { data: auth }] = await Promise.all([getAircraftShellContext(supabase, id), supabase.auth.getUser()]);
  if (!context || !auth.user) notFound();
  const a = `/aircraft/${id}`;
  if (!context.canEdit) redirect(`${a}/status`);

  const [due, { data: profile }] = await Promise.all([
    dueSnapshot(id, auth.user.id).catch(() => null),
    supabase.from("profile").select("preferences").eq("id", auth.user.id).maybeSingle(),
  ]);
  const pages: { id: string; label: string }[] = [];
  const { data: books } = await supabase.from("logbook").select("id,type,title").eq("aircraft_id", id);
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("page").select("id,logbook_id,page_sequence").eq("aircraft_id", id).order("id").range(offset, offset + 999);
    if (error) throw new Error(error.message);
    for (const p of data ?? []) { const b = books?.find((b) => b.id === p.logbook_id); pages.push({ id: p.id, label: `${b?.title ?? b?.type ?? "Logbook"} p. ${p.page_sequence ?? "unnumbered"}` }); }
    if (!data || data.length < 1000) break;
  }
  const { data: awaitingDetails } = await supabase.from("page").select("id,identity_suggestions").eq("aircraft_id", id).eq("review_status", "unreviewed").not("content_kinds", "eq", "{}");
  const detailsCount = (awaitingDetails ?? []).reduce((n, p) => n + p.identity_suggestions.filter((s) => s.status === "pending").length, 0);
  const today = due?.snap.today ?? new Date().toISOString().slice(0, 10);
  const items = DEFAULT_SEED_KINDS.map((kind) => ({ kind, item: due?.snap.items.find((i) => i.kind === kind && i.source === "maintenance") ?? null }));
  const annual = items[0].item;
  const annualKnown = Boolean(annual?.lastDone?.date);

  return (
    <Board section="status">
      <BoardHead title={`Set up ${context.reg}`} spine={false} actions={<Button variant="on-board" href={`${a}/status`}>Skip for now</Button>} />
      <Leaves split="1.4fr 1fr">
        <Leaf label="Setup">
          <p className="mb-4 max-w-[56ch] text-lede">Start with your logbooks, or enter the missing details yourself. Confirmed information is reused; you can leave setup at any time.</p>
          <HungSection title="Use your logbooks" first>
            <p className="text-body">Upload identification pages and recent service entries. Review them beside the scans to fill aircraft details, equipment, readings and inspection history.</p>
            <div className="my-3 flex flex-wrap gap-3"><Button href={`${a}/logbooks/add`}>Upload logbooks</Button><Button variant="quiet" href={`${a}/logbooks/review`}>Review extracted information{detailsCount ? ` · ${detailsCount} details to review` : ""}</Button></div>
            <FindDetails aircraftId={id} pages={pages} />
          </HungSection>
          <HungSection title="Last recorded meters" count="Dates and sources matter; later flights may have newer readings">
            <p className="mb-3 text-small text-ink-2">{["tach", "hobbs"].map((key) => { const m = due?.snap.meters[key as "tach" | "hobbs"]; return m?.source ? `${key === "tach" ? "Tach" : "Hobbs"} ${m.face?.toFixed(1) ?? "unknown"} · ${m.asOf ? fmtDate(m.asOf) : "date unknown"} · ${m.source === "entry" ? "confirmed logbook entry" : m.source === "myflightbook" ? "MyFlightBook" : m.source}` : `${key === "tach" ? "Tach" : "Hobbs"} not recorded`; }).join(". ")}</p>
            {/* Only readings someone gave; never a hobbs worked out from the tach. */}
            <MetersForm
              aircraftId={id}
              tach={due ? (due.snap.meters.tach.source ? due.snap.meters.tach.face : null) : context.tach}
              hobbs={due ? (due.snap.meters.hobbs.source ? due.snap.meters.hobbs.face : null) : null}
            />
          </HungSection>
          <HungSection title="Last annual" count="Usually the last inspection in the airframe logbook">
            {annualKnown ? (
              <p className="text-body">
                {fmtDate(annual!.lastDone!.date!)}
                {annual!.lastDone!.pageLabel ? `, ${annual!.lastDone!.pageLabel}` : ", your answer"}
              </p>
            ) : (
              <div className="grid gap-3">
                <ItemDateForm aircraftId={id} kind="annual" label="Date of the last annual" today={today} />
                <p className="text-small text-ink-2">
                  Or{" "}
                  <Link href={`${a}/logbooks/add?book=airframe`} className="font-semibold underline decoration-dotted">find it on a scanned page</Link>: add
                  the airframe page, confirm the annual entry in Review, and it counts from there.
                </p>
              </div>
            )}
          </HungSection>
          <HungSection title="Reminders">
            <RemindersToggle on={Boolean(profile?.preferences?.notify_due)} email={auth.user.email ?? "your email"} />
          </HungSection>
          <HungSection title="Your first status">
            {due ? (
              <>
                <Verdict verdict={due.snap.verdict} overdue={due.snap.counts.overdue > 0} />
                <ul className="mt-3 divide-y divide-rule border-y border-rule">
                  {items.map(({ kind, item }) => (
                    <li key={kind} className="grid gap-2 py-2.5 sm:grid-cols-[1fr_auto] sm:items-center">
                      <span>
                        <span className="block text-body font-bold">{item?.label ?? NAME[kind]}</span>
                        <span className="block text-small text-ink-2">
                          {item?.firstDate ? `Due ${fmtDate(item.firstDate)}` : "Needs its last date"}
                          {item?.lastDone?.date && !item.lastDone.entryId ? " · from your answer, no page yet" : ""}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-3">
                        <StatusMark kind={item?.status ?? "no_record"} />
                      </span>
                      {!item?.lastDone?.date && kind !== "annual" && (
                        <div className="sm:col-span-2">
                          <ItemDateForm aircraftId={id} kind={kind} label={`Last ${(NAME[kind] ?? kind).toLowerCase()}`} today={today} cta="Add date" />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-body text-ink-2">Status could not be worked out yet. Your answers are saved; open Status to check.</p>
            )}
          </HungSection>
          <div className="flex flex-wrap items-center gap-3 border-t-2 border-ink pt-4">
            <Link href={`${a}/status`} className={buttonClass("primary", "l")}>Done, show my status</Link>
            <p className="text-small text-ink-3">Leave the dates blank and the scanned pages will find them.</p>
          </div>
        </Leaf>
        <Leaf label="Where to find it">
          <div className="rounded-[var(--radius-s)] bg-leaf-2 px-5 py-4">
            <h2 className="text-section">Where to find the last annual</h2>
            <p className="mt-2 text-body text-ink-2">
              Usually the last inspection entry in the airframe logbook: “I certify that this aircraft has been inspected in accordance with an annual
              inspection…”, signed by an IA.
            </p>
          </div>
          <div className="mt-4 px-1">
            <h2 className="text-section">Next, the logbooks</h2>
            <p className="mt-2 text-body text-ink-2">
              Start with the newest airframe page and work back. Nothing the AI reads counts until you confirm it, so what is due only changes when you say so.
            </p>
            <Link href={`${a}/logbooks/add?book=airframe`} className={`${buttonClass("secondary", "m")} mt-3`}>Add logbook pages</Link>
          </div>
        </Leaf>
      </Leaves>
    </Board>
  );
}

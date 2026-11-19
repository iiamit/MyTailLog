import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAircraftShellContext } from "@/lib/aircraftContext";
import { dueSnapshot } from "@/lib/due/load";
import { buildMapModel } from "@/lib/mapModel";
import { decryptSecret } from "@/lib/crypto";
import { linkActive, linkUrl } from "@/lib/mechanicLink";
import { aircraftTail } from "@/lib/v2/landing";
import { maintTabs } from "@/lib/v2/tabs";
import { BOOK_NAME, entryTitle, fmtDay, fmtMonDay, clip } from "@/lib/v2/books";
import { SEVERITY_HELP, SEVERITY_WORD, intervalLabel, relatedEntries, sortOpen } from "@/lib/v2/squawks";
import type { Squawk, SquawkSeverity } from "@/lib/database.types";
import { Board, BoardHead, HungSection, Leaf, Leaves, Spine } from "@/ui/Board";
import { Button } from "@/ui/Button";
import { Notice } from "@/ui/Form";
import { AddToVisit, CopyLink, EditableTitle, Photos, RevokeLink, SeverityControl, SquawkActions, type PhotoView } from "./Controls";
import { ReportPanel, ResolvePanel, SendPanel } from "./Panels";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Squawks · ${await aircraftTail(id)}` };
}

type Entry = {
  id: string; entry_date: string | null; description: string | null; work_performed: string | null; page_id: string | null;
  logbook_id: string; signature_name: string | null; mechanic_cert_number: string | null;
};

const DONE: Record<string, string> = {
  reported: "Squawk reported.",
  photos: "Squawk reported. A photo didn't upload; add it again from the squawk.",
  resolved: "Squawk resolved.",
  reopened: "Squawk reopened.",
  deleted: "Squawk deleted.",
};

/** W-MAINT-03 Squawks: note it, watch it, show its history on the line, hand it to a mechanic, clear it with an entry. */
export default async function SquawksPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ squawk?: string; panel?: string; done?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const [context, { data: auth }] = await Promise.all([getAircraftShellContext(supabase, id), supabase.auth.getUser()]);
  if (!context || !auth.user) notFound();
  const a = `/aircraft/${id}`;
  const self = `${a}/maintenance/squawks`;
  const userId = auth.user.id;

  const [{ data: rows, error }, { data: photoRows }, { data: entryRows }, { data: books }, { data: providers }, due] = await Promise.all([
    supabase.from("squawk").select("*").eq("aircraft_id", id).order("reported_at", { ascending: false }),
    supabase.from("squawk_photo").select("id, squawk_id, created_by, taken_at, created_at").eq("aircraft_id", id).order("created_at"),
    supabase
      .from("log_entry")
      .select("id, entry_date, description, work_performed, page_id, logbook_id, signature_name, mechanic_cert_number")
      .eq("aircraft_id", id)
      .eq("owner_confirmed", true)
      .is("replaced_by_entry_id", null)
      .order("entry_date", { ascending: false }),
    supabase.from("logbook").select("id, type").eq("aircraft_id", id),
    supabase.from("service_provider").select("id, name, cert_number").eq("aircraft_id", id).order("name"),
    dueSnapshot(id, userId).catch(() => null),
  ]);
  const squawks = (rows ?? []) as Squawk[];
  const open = sortOpen(squawks.filter((s) => s.status === "open"));
  const resolved = squawks.filter((s) => s.status !== "open").sort((x, y) => (y.resolved_at ?? "").localeCompare(x.resolved_at ?? ""));
  const entries = (entryRows ?? []) as Entry[];
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const bookOf = new Map((books ?? []).map((b) => [b.id, b.type as string]));
  const selected = squawks.find((s) => s.id === sp.squawk) ?? (sp.panel === "new" ? null : (open[0] ?? resolved[0] ?? null));

  // Page numbers for the entries this screen cites: resolved squawks' clearing entries and the selected one's history.
  const related = selected ? relatedEntries(selected.description, entries) : [];
  const citeIds = new Set([...resolved.map((s) => s.resolved_log_entry_id), ...related.map((e) => e.id)].filter(Boolean) as string[]);
  const pageIds = [...new Set([...citeIds].map((i) => entryById.get(i)?.page_id).filter(Boolean) as string[])];
  const { data: pages } = pageIds.length ? await supabase.from("page").select("id, page_sequence").in("id", pageIds) : { data: [] };
  const pageNo = new Map((pages ?? []).map((p) => [p.id, p.page_sequence]));
  const cite = (e: Entry) => {
    const book = BOOK_NAME[bookOf.get(e.logbook_id) ?? "other"] ?? "Other";
    const n = e.page_id ? pageNo.get(e.page_id) : null;
    return n != null ? `${book} p. ${n}` : book;
  };

  const head = (
    <>
      <BoardHead
        title="Maintenance"
        subTabs={maintTabs(id, "squawks", { squawks: open.length })}
        actions={
          <Button variant="on-board" href={`${self}?panel=new`}>
            Report a squawk
          </Button>
        }
      />
      <Spine
        tail={context.reg}
        context={squawks.length ? "squawks marked" : "The whole life"}
        href={`${a}/logbooks/map`}
        model={due ? buildMapModel(due.loaded.input, due.loaded.today) : null}
        statusHref={`${a}/status`}
      />
    </>
  );

  if (error) {
    return (
      <Board section="maint">
        {head}
        <Leaves split="1fr 1.15fr">
          <Leaf label="Squawks">
            <p className="mb-3 text-lede text-ink-2">Squawks could not be loaded.</p>
            <Button variant="quiet" href={self}>Try again</Button>
          </Leaf>
          <Leaf label="Squawk"><span /></Leaf>
        </Leaves>
      </Board>
    );
  }

  // Next visit note: the earliest planned or suggested visit ahead.
  const visits = due ? [...due.snap.visits.planned, ...due.snap.visits.suggested].sort((x, y) => x.weekOf.localeCompare(y.weekOf)) : [];
  const next = visits[0];
  const providerName = (pid?: string) => (providers ?? []).find((p) => p.id === pid)?.name;
  const nextPlace = next ? providerName(next.providerIds[0]) ?? next.place : null;

  const firstName = (n: string | null) => (n ? n.split("@")[0].split(/\s+/)[0] : "someone");
  const photosOf = (sid: string) => (photoRows ?? []).filter((p) => p.squawk_id === sid);
  const linkTo = (s: Squawk) => `${self}?squawk=${s.id}`;
  const today = due?.loaded.today ?? new Date().toISOString().slice(0, 10);

  // --- Left leaf -----------------------------------------------------------------------------------------------
  const sevTag = (s: SquawkSeverity) => (
    <span
      className={`shrink-0 rounded-[3px] px-2 py-0.5 text-caption font-bold ${
        s === "high" ? "bg-alarm text-on-alarm" : s === "medium" ? "border border-ink text-ink" : "text-ink-2"
      }`}
    >
      {SEVERITY_WORD[s]}
    </span>
  );
  const left = (
    <Leaf label="Squawks">
      {sp.done && DONE[sp.done] && <div className="mb-3"><Notice>{DONE[sp.done]}</Notice></div>}
      {squawks.length === 0 ? (
        <p className="max-w-[44ch] text-lede">
          Nothing reported yet. Report anything you notice in flight or on the ramp; it stays open until it&apos;s cleared by an entry.
        </p>
      ) : (
        <>
          <HungSection title="Open" count={`${open.length}`} first>
            {open.length === 0 ? (
              <p className="text-body text-ink-2">No open squawks.</p>
            ) : (
              <ul className="divide-y divide-rule">
                {open.map((s) => {
                  const n = photosOf(s.id).length;
                  return (
                    <li key={s.id}>
                      <Link
                        href={linkTo(s)}
                        replace
                        scroll={false}
                        aria-current={selected?.id === s.id ? "true" : undefined}
                        className={`state-layer -mx-2 flex items-start gap-3 rounded-control px-2 py-2.5 ${selected?.id === s.id ? "bg-leaf-2" : ""}`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-body-strong">{s.description}</span>
                          <span className="block text-small text-ink-3">
                            Reported {fmtMonDay(s.reported_at.slice(0, 10))} by {firstName(s.reporter_name)}
                            {n ? ` · ${n} ${n === 1 ? "photo" : "photos"}` : ""}
                          </span>
                        </span>
                        {sevTag(s.severity)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </HungSection>
          {resolved.length > 0 && (
            <HungSection title="Resolved" count={`${resolved.length}`}>
              <ul className="divide-y divide-rule">
                {resolved.map((s) => {
                  const e = s.resolved_log_entry_id ? entryById.get(s.resolved_log_entry_id) : undefined;
                  const quote = e ? clip((e.work_performed || e.description || "").replace(/\s+/g, " ").trim(), 90) : s.resolution_notes;
                  const when = s.resolved_at ? fmtDay(s.resolved_at.slice(0, 10)) : "";
                  return (
                    <li key={s.id}>
                      <Link
                        href={linkTo(s)}
                        replace
                        scroll={false}
                        aria-current={selected?.id === s.id ? "true" : undefined}
                        className={`state-layer -mx-2 block rounded-control px-2 py-2.5 text-ink-2 ${selected?.id === s.id ? "bg-leaf-2" : ""}`}
                      >
                        <span className="block text-body-strong">{s.description}</span>
                        <span className="block text-small text-ink-3">
                          {e ? `Cleared by ${entryTitle(e)}, ${when}` : `Resolved ${when}`}
                          {quote ? <>: <span className="font-paper">&ldquo;{quote}&rdquo;</span></> : ""}
                          {e ? ` · ${cite(e)}` : ""}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </HungSection>
          )}
        </>
      )}
      <HungSection title="Severity">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-body">
          {(["low", "medium", "high"] as SquawkSeverity[]).map((s) => (
            <div key={s} className="contents">
              <dt>{sevTag(s)}</dt>
              <dd className="text-ink-2">{SEVERITY_HELP[s]}</dd>
            </div>
          ))}
        </dl>
      </HungSection>
      {next && open.length > 0 && (
        <HungSection title="Next visit">
          <p className="text-body">
            Week of {fmtMonDay(next.weekOf)}, {next.id ? "planned" : "suggested on the line ahead"}
            {nextPlace ? ` at ${nextPlace}` : ""}.{" "}
            {open.length === 1 ? "The open squawk" : `All ${open.length} open squawks`} can be shown to the shop at that visit.
          </p>
          {context.canEdit && next.id && (
            <div className="mt-2">
              <AddToVisit aircraftId={id} visitId={next.id} squawkIds={open.map((s) => s.id)} />
            </div>
          )}
          {!next.id && (
            <p className="mt-1 text-small">
              <Link href={`${a}/status`} className="font-semibold text-board-ink underline decoration-dotted">Book it on Status</Link>
            </p>
          )}
        </HungSection>
      )}
    </Leaf>
  );

  // --- Right leaf ----------------------------------------------------------------------------------------------
  const close = selected ? `${self}?squawk=${selected.id}` : self;
  let right: React.ReactNode;
  if (sp.panel === "new") {
    right = <ReportPanel aircraftId={id} closeHref={close} selfHref={self} />;
  } else if (selected && sp.panel === "resolve" && context.canEdit && selected.status === "open") {
    const since = selected.reported_at.slice(0, 10);
    const options = entries
      .filter((e) => e.entry_date && e.entry_date >= since)
      .map((e) => ({ id: e.id, date: e.entry_date, label: `${fmtDay(e.entry_date!)} · ${entryTitle(e)} · ${cite(e)}` }));
    right = (
      <ResolvePanel
        aircraftId={id}
        squawkId={selected.id}
        description={selected.description}
        entries={options}
        today={today}
        closeHref={close}
        writeHref={`${a}/logbooks/entries/new?closes=${selected.id}`}
      />
    );
  } else if (selected && sp.panel === "send" && context.canEdit) {
    const mech = related.find((e) => e.signature_name);
    right = (
      <SendPanel
        aircraftId={id}
        squawkId={selected.id}
        open={(selected.status === "open" ? open : [selected, ...open]).map((s) => ({ id: s.id, description: s.description }))}
        providers={(providers ?? []).map((p) => ({ id: p.id, name: p.name }))}
        defaultFor={mech?.signature_name ?? ""}
        closeHref={close}
      />
    );
  } else if (selected) {
    right = await Detail();
  } else {
    right = (
      <Leaf label="Squawk">
        <p className="text-body text-ink-2">Select a squawk to see its photos, history and what to do next.</p>
      </Leaf>
    );
  }

  async function Detail() {
    const s = selected!;
    const canAdd = context!.canEdit || s.reported_by === userId;
    const photos: PhotoView[] = photosOf(s.id).map((p) => ({
      id: p.id,
      src: `/v2${self}/photo/${p.id}`,
      thumb: `/v2${self}/photo/${p.id}?thumb`,
      caption: fmtDay((p.taken_at ?? p.created_at).slice(0, 10)),
      canDelete: context!.canEdit || p.created_by === userId,
    }));
    const clearing = s.resolved_log_entry_id ? entryById.get(s.resolved_log_entry_id) : undefined;
    const history = related.filter((e) => e.id !== clearing?.id).slice(0, 5);
    const mech = history.find((e) => e.signature_name);
    let links: { id: string; recipient_label: string; expires_at: string; revoked_at: string | null; token_enc: string; opens: number }[] = [];
    if (context!.canEdit) {
      const { data } = await supabase
        .from("mechanic_link")
        .select("id, recipient_label, expires_at, revoked_at, token_enc")
        .eq("aircraft_id", id)
        .eq("kind", "squawk")
        .contains("squawk_ids", [s.id])
        .order("created_at", { ascending: false });
      const ids = (data ?? []).map((l) => l.id);
      const { data: views } = ids.length ? await supabase.from("mechanic_link_view").select("link_id").in("link_id", ids) : { data: [] };
      links = (data ?? []).map((l) => ({ ...l, opens: (views ?? []).filter((v) => v.link_id === l.id).length }));
    }

    return (
      <Leaf label="Squawk">
        <EditableTitle aircraftId={id} squawkId={s.id} text={s.description} canEdit={context!.canEdit} />
        <p className="mt-1 text-small text-ink-3">
          Reported {fmtDay(s.reported_at.slice(0, 10))} by {s.reporter_name ?? "someone"}
          {s.status !== "open" && s.resolved_at ? ` · resolved ${fmtDay(s.resolved_at.slice(0, 10))}` : ""}
        </p>

        <HungSection title="Severity" first>
          {context!.canEdit && s.status === "open" ? (
            <SeverityControl aircraftId={id} squawkId={s.id} value={s.severity} />
          ) : (
            <p className="text-body">{SEVERITY_WORD[s.severity]}: {SEVERITY_HELP[s.severity]}</p>
          )}
        </HungSection>

        <HungSection title="Photos" count={photos.length ? `${photos.length}` : undefined}>
          {photos.length === 0 && !canAdd ? <p className="text-body text-ink-2">No photos.</p> : null}
          <Photos aircraftId={id} squawkId={s.id} description={s.description} photos={photos} canAdd={canAdd} />
        </HungSection>

        {s.status !== "open" && (
          <HungSection title="Cleared by">
            {clearing ? (
              <p className="text-body">
                {entryTitle(clearing)}, {clearing.entry_date ? fmtDay(clearing.entry_date) : "undated"}
                {(clearing.work_performed || clearing.description) && (
                  <span className="mt-1 block font-paper text-ink-2">&ldquo;{clip((clearing.work_performed || clearing.description)!, 160)}&rdquo;</span>
                )}
                <Link href={`${a}/logbooks/entries/${clearing.id}`} className="mt-1 block text-caption text-board-ink underline decoration-dotted">
                  {cite(clearing)}
                </Link>
              </p>
            ) : (
              <p className="text-body">{s.resolution_notes ? `No entry: ${s.resolution_notes}` : "No entry was linked."}</p>
            )}
          </HungSection>
        )}

        <HungSection title="History">
          {history.length === 0 ? (
            <p className="text-body text-ink-2">No earlier entries about this were found in the confirmed pages.</p>
          ) : (
            <>
              <HistoryLine entries={history} reported={s.reported_at.slice(0, 10)} today={today} />
              <ul className="mt-2 space-y-1.5">
                {history.map((e) => (
                  <li key={e.id} className="text-small">
                    <span className="text-ink">{fmtDay(e.entry_date!)} · {entryTitle(e)}</span>{" "}
                    <Link href={`${a}/logbooks/entries/${e.id}`} className="text-caption text-board-ink underline decoration-dotted">
                      {cite(e)}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </HungSection>

        {context!.canEdit && (
          <HungSection title="Mechanic">
            <p className="text-body">
              {mech ? `${mech.signature_name}${mech.mechanic_cert_number ? `, A&P ${mech.mechanic_cert_number}` : ""}` : "No mechanic signed related work yet."}
            </p>
            {links.length > 0 && (
              <ul className="mt-2 divide-y divide-rule">
                {links.map((l) => {
                  const live = linkActive(l);
                  const token = live ? decryptSecret(l.token_enc) : null;
                  return (
                    <li key={l.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-small ${live ? "" : "text-ink-3"}`}>
                      <span className="min-w-0 flex-1">
                        Link for {l.recipient_label} ·{" "}
                        {l.revoked_at ? `revoked ${fmtMonDay(l.revoked_at.slice(0, 10))}` : live ? `ends ${fmtMonDay(l.expires_at.slice(0, 10))}` : "ended"} ·{" "}
                        {l.opens === 1 ? "opened once" : `opened ${l.opens} times`}
                      </span>
                      {token && <CopyLink url={linkUrl(token)} />}
                      {live && <RevokeLink aircraftId={id} linkId={l.id} label={l.recipient_label} />}
                    </li>
                  );
                })}
              </ul>
            )}
          </HungSection>
        )}

        {context!.canEdit && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-rule pt-4">
            {s.status === "open" && (
              <>
                <Button variant="primary" href={`${self}?squawk=${s.id}&panel=resolve`}>Resolve with an entry</Button>
                <Button href={`${self}?squawk=${s.id}&panel=send`}>Send to mechanic</Button>
              </>
            )}
            <SquawkActions aircraftId={id} squawkId={s.id} resolved={s.status !== "open"} listHref={self} />
          </div>
        )}
      </Leaf>
    );
  }

  return (
    <Board section="maint">
      {head}
      <Leaves split="1fr 1.15fr">
        {left}
        {right}
      </Leaves>
    </Board>
  );
}

/** "The {part} on the {book} line": related entries as stops and this squawk as a diamond, intervals in years. */
function HistoryLine({ entries, reported, today }: { entries: Entry[]; reported: string; today: string }) {
  const dates = entries.map((e) => e.entry_date!).sort();
  const from = Date.parse(dates[0]);
  const to = Math.max(Date.parse(today), Date.parse(reported));
  const W = 560, pad = 14, y = 44;
  const x = (d: string) => pad + ((Date.parse(d) - from) / Math.max(1, to - from)) * (W - pad * 2);
  const stops = [...dates, reported];
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} 72`} className="block h-auto w-full" role="img" aria-label={`${entries.length} earlier entries, ${dates[0].slice(0, 4)} to ${reported.slice(0, 4)}, then this squawk`}>
        <line x1={pad} x2={W - pad} y1={y} y2={y} stroke="var(--color-line-airframe)" style={{ strokeWidth: "var(--map-line-stroke)" }} strokeLinecap="round" />
        {stops.slice(1).map((d, i) => (
          <text key={`i${i}`} x={(x(stops[i]) + x(d)) / 2} y={y - 12} textAnchor="middle" fill="var(--color-ink-3)" className="text-map-tick">
            {intervalLabel(stops[i], d)}
          </text>
        ))}
        {dates.map((d, i) => (
          <circle key={i} cx={x(d)} cy={y} r={6} fill="var(--color-leaf)" stroke="var(--color-ink)" strokeWidth={2.5} />
        ))}
        <rect x={x(reported) - 6} y={y - 6} width={12} height={12} transform={`rotate(45 ${x(reported)} ${y})`} fill="var(--color-ink)" />
        <text x={pad} y={68} fill="var(--color-ink-3)" className="text-map-tick">{dates[0].slice(0, 4)}</text>
        <text x={W - pad} y={68} textAnchor="end" fill="var(--color-ink-3)" className="text-map-tick">this squawk</text>
      </svg>
    </figure>
  );
}

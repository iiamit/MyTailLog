import { Fragment } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAircraftShellContext } from "@/lib/aircraftContext";
import type { AdCompliance, AdReference } from "@/lib/database.types";
import { computeStatus, fmtDate, type DueItem, type Trust } from "@/lib/due/engine";
import { loadDueInput } from "@/lib/due/load";
import { buildMapModel } from "@/lib/mapModel";
import { aircraftTail } from "@/lib/v2/landing";
import { BOOK, calendarCell, fmtMeter, hoursCell } from "@/lib/v2/status";
import { adState, axisX, intervalSummary, miniAxis, untrackedRefs } from "@/lib/v2/ads";
import { maintTabs } from "@/lib/v2/tabs";
import { Board, BoardHead, HungSection, Leaf, Leaves, SourceMat, Spine } from "@/ui/Board";
import { Button, buttonClass } from "@/ui/Button";
import { ConfirmSubmit, Notice } from "@/ui/Form";
import { StatusMark, TrustMark, YourNote } from "@/ui/Marks";
import { AdEditor, LookupButton, RecordForm } from "./AdForms";
import { stopTracking, trackReference } from "./actions";

type Params = { id: string };
type Search = { ad?: string; stop?: string; panel?: string; all?: string; report?: string; saved?: string; stopped?: string; error?: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `ADs and SBs · ${await aircraftTail(id)}` };
}

type Stop = { id: string; date: string; hours: number | null; entryId: string | null; pageId: string | null; pageLabel: string | null; trust: Trust; what: string | null };

const RANK: Record<string, number> = { overdue: 0, due_soon: 1, no_record: 2 };

/** W-MAINT-01 ADs and SBs: the register in four plain states, each AD's compliance line, history and editor. */
export default async function AdsPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> }) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const [context, { data: auth }] = await Promise.all([getAircraftShellContext(supabase, id), supabase.auth.getUser()]);
  if (!context || !auth.user) notFound();
  const a = `/aircraft/${id}`;
  const self = `${a}/maintenance/ads`;

  const [loaded, adsRes, compsRes, refsRes, aircraftRes] = await Promise.all([
    loadDueInput(supabase, id, auth.user.id).catch(() => undefined),
    supabase.from("ad_compliance").select("*").eq("aircraft_id", id),
    supabase.from("component").select("id, name, make, is_installed").eq("aircraft_id", id).order("name"),
    supabase.from("log_entry").select("id, page_id, entry_date, ad_refs, sb_refs, description")
      .eq("aircraft_id", id).eq("owner_confirmed", true).or("ad_refs.neq.{},sb_refs.neq.{}"),
    supabase.from("aircraft").select("make, model").eq("id", id).maybeSingle(),
  ]);
  if (loaded === null) notFound();

  const snap = loaded ? computeStatus(loaded.input, loaded.today) : null;
  const head = (spine: React.ReactNode) => (
    <>
      <BoardHead
        title="Maintenance"
        subTabs={maintTabs(id, "ads", { squawks: snap?.counts.openSquawks })}
        actions={
          context.canEdit && (
            <>
              <Link href={`${self}/find`} className="font-semibold text-on-board underline decoration-dotted underline-offset-4">
                Find ADs
              </Link>
              <Link href={`${self}?panel=new`} replace scroll={false} className={buttonClass("on-board", "m")}>
                Track an AD or SB
              </Link>
            </>
          )
        }
      />
      {spine}
    </>
  );

  // S-ERR: nothing half-drawn.
  if (!loaded || !snap || adsRes.error) {
    return (
      <Board section="maint">
        {head(<Spine tail={context.reg} context="The whole life" href={`${a}/logbooks/map`} />)}
        <Leaves split="1.7fr 1fr">
          <Leaf label="ADs and SBs">
            <p className="mb-3 text-lede text-ink-2">ADs and SBs could not be loaded.</p>
            <Button variant="quiet" href={self}>Try again</Button>
          </Leaf>
          <SourceMat />
        </Leaves>
      </Board>
    );
  }

  const input = loaded.input;
  const today = loaded.today;
  const ads = (adsRes.data ?? []) as AdCompliance[];
  const items = new Map(snap.items.map((i) => [i.key, i]));
  const entries = new Map((input.log_entry ?? []).map((e) => [e.id, e]));
  const books = new Map((input.logbook ?? []).map((b) => [b.id, b.type]));
  const pageLabels = new Map((input.page ?? []).map((p) => [p.id, p.page_sequence != null ? `${BOOK[books.get(p.logbook_id) ?? "other"] ?? "Other"} p. ${p.page_sequence}` : null]));

  const stopsOf = (ad: AdCompliance): Stop[] => {
    const rows = (input.item_completion ?? []).filter((c) => c.ad_compliance_id === ad.id);
    const raw = rows.length
      ? rows.map((c) => ({ id: c.id, date: c.done_date, hours: c.done_hours ?? null, entryId: c.log_entry_id ?? null }))
      : ad.complied_date
        ? [{ id: "last", date: ad.complied_date, hours: ad.complied_hours, entryId: ad.reference_entry_id }]
        : [];
    return raw
      .map((r) => {
        const e = r.entryId ? entries.get(r.entryId) : undefined;
        if (e?.replaced_by_entry_id) return null;
        const pageId = e?.page_id ?? null;
        return {
          ...r, pageId, pageLabel: pageId ? (pageLabels.get(pageId) ?? null) : null,
          trust: (e?.trust ?? "confirmed") as Trust,
          what: e?.description ?? (r.id === "last" ? ad.method : null),
        };
      })
      .filter((s): s is Stop => !!s)
      .sort((x, y) => (x.date < y.date ? 1 : -1));
  };

  const rows = ads
    .map((ad) => ({ ad, item: items.get(`ad:${ad.id}`) ?? null, stops: stopsOf(ad), state: adState(ad) }))
    .sort((x, y) => rank(x) - rank(y) || x.ad.reference.localeCompare(y.ad.reference));
  const axis = miniAxis(rows.flatMap((r) => r.stops.map((s) => s.date)), today);

  const refRows = refsRes.data ?? [];
  const untracked = untrackedRefs(refRows, ads);
  const selected = rows.find((r) => r.ad.id === sp.ad) ?? rows[0] ?? null;
  const panel = context.canEdit ? sp.panel : undefined;
  const editing = panel === "edit" && selected ? selected : null;
  const recording = panel === "record" && selected ? selected : null;
  const stop = selected ? (selected.stops.find((s) => s.id === sp.stop) ?? selected.stops.find((s) => s.pageId) ?? null) : null;

  const refIds = [...new Set(ads.map((r) => r.ad_reference_id).filter(Boolean))] as string[];
  const { data: refData } = refIds.length ? await supabase.from("ad_reference").select("*").in("id", refIds) : { data: [] as AdReference[] };
  const officials = new Map((refData ?? []).map((r) => [r.id, r as AdReference]));
  const components = (compsRes.data ?? []).map((c) => ({ id: c.id, label: `${c.name}${c.make ? `, ${c.make}` : ""}${c.is_installed ? "" : " (removed)"}` }));

  const nextDueText = (item: DueItem | null) => {
    if (!item) return null;
    const cal = calendarCell(item);
    const hrs = hoursCell(item, today);
    return [hrs ? `${hrs.limit}${hrs.note ? `, ${hrs.note}` : ""}` : null, cal?.limit ?? null].filter(Boolean).join(" or ") || null;
  };
  const sel = (adId: string, extra = "") => `${self}?ad=${adId}${extra}`;

  // Right leaf.
  let right: React.ReactNode;
  if (panel === "new") {
    right = <AdEditor aircraftId={id} ad={null} components={components} nextDue={null} closeHref={selected ? sel(selected.ad.id) : self} />;
  } else if (editing) {
    right = <AdEditor key={editing.ad.id} aircraftId={id} ad={editing.ad} components={components} nextDue={nextDueText(editing.item)} closeHref={sel(editing.ad.id)} />;
  } else if (recording) {
    const ref = recording.ad.reference.replace(/\s+/g, "").toLowerCase();
    const mentions = refRows
      .filter((e) => [...(e.ad_refs ?? []), ...(e.sb_refs ?? [])].some((r) => r.replace(/\s+/g, "").toLowerCase() === ref))
      .sort((x, y) => ((x.entry_date ?? "") < (y.entry_date ?? "") ? 1 : -1))
      .map((e) => ({ id: e.id, label: [e.entry_date ? fmtDate(e.entry_date) : "Undated", e.page_id ? pageLabels.get(e.page_id) : null, e.description?.slice(0, 60)].filter(Boolean).join(" · ") }));
    right = (
      <RecordForm
        aircraftId={id}
        adId={recording.ad.id}
        reference={`${recording.ad.kind.toUpperCase()} ${recording.ad.reference}`}
        today={today}
        tach={snap.meters.tach.face}
        intervalHours={recording.ad.recurring ? recording.ad.interval_hours : null}
        intervalMonths={recording.ad.recurring ? recording.ad.interval_months : null}
        entries={mentions}
        closeHref={sel(recording.ad.id)}
      />
    );
  } else if (selected && sp.report && selected.ad.verified_report_page_id) {
    const src = `/api/page/${selected.ad.verified_report_page_id}/image`;
    right = (
      <SourceMat title={`A&P compliance report, ${pageLabels.get(selected.ad.verified_report_page_id) ?? "page"}`} meta={selected.ad.verified_at ? `Matched ${fmtDate(selected.ad.verified_at.slice(0, 10))}` : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element -- signed, per-user page image */}
        <img src={src} alt={`A&P compliance report naming ${selected.ad.reference}`} className="h-auto w-full rounded-[var(--radius-s)]" />
      </SourceMat>
    );
  } else if (stop?.pageId) {
    const src = `/api/page/${stop.pageId}/image`;
    right = (
      <SourceMat title={stop.pageLabel ?? "Logbook page"} meta={`${fmtDate(stop.date)}${stop.hours != null ? ` · tach ${fmtMeter(stop.hours)}` : ""}`}>
        <TrustMark level={stop.trust} onMat />
        {/* eslint-disable-next-line @next/next/no-img-element -- signed, per-user page image */}
        <img src={src} alt={`${stop.pageLabel ?? "Logbook page"}, compliance with ${selected!.ad.reference}`} className="h-auto w-full rounded-[var(--radius-s)]" />
        {stop.what && <p className="font-paper text-paper text-on-cover">&ldquo;{stop.what}&rdquo;</p>}
        <div>
          <a href={src} target="_blank" rel="noopener" className={buttonClass("on-mat", "s")}>Zoom</a>
        </div>
      </SourceMat>
    );
  } else {
    right = (
      <SourceMat title={selected ? `${selected.ad.kind.toUpperCase()} ${selected.ad.reference}` : undefined}>
        {selected ? (
          <p className="rounded-[var(--radius-s)] bg-leaf-2 px-4 py-3.5 text-body text-ink">
            No page behind this compliance yet. It is your note until the entry is scanned and confirmed.
          </p>
        ) : undefined}
      </SourceMat>
    );
  }

  const span = selected?.stops.length
    ? { from: selected.stops[selected.stops.length - 1].date, to: selected.item?.firstDate && selected.item.firstDate > today ? selected.item.firstDate : today }
    : null;
  const spine = (
    <Spine
      tail={context.reg}
      context={span ? `${span.from.slice(0, 4)} to ${span.to.slice(0, 4)}` : "The whole life"}
      href={`${a}/logbooks/map`}
      model={buildMapModel(input, today)}
      window={span}
      windowDescription={span ? `this AD's compliance bracketed` : undefined}
    />
  );

  const notice = sp.saved === "new" && selected ? `${selected.ad.kind.toUpperCase()} ${selected.ad.reference} tracked.`
    : sp.saved === "edit" ? "Saved."
    : sp.saved === "record" && selected ? `Compliance recorded.${nextDueText(selected.item) ? ` Next due ${nextDueText(selected.item)}.` : ""}`
    : sp.stopped ? `Stopped tracking ${sp.stopped}.`
    : null;
  const recurringCount = rows.filter((r) => r.ad.recurring && r.ad.status !== "not_applicable" && r.ad.status !== "superseded").length;
  const openCount = rows.filter((r) => r.ad.status === "open").length;
  const waiting = snap.counts.pagesToReview;

  return (
    <Board section="maint">
      {head(spine)}
      <Leaves split="1.7fr 1fr">
        <Leaf label="ADs and SBs">
          {notice && <div className="mb-3"><Notice>{notice}</Notice></div>}
          {sp.error && <div className="mb-3"><Notice tone="alarm">{sp.error}</Notice></div>}

          {rows.length === 0 ? (
            <div>
              <p className="mb-4 text-lede">No ADs or SBs are tracked yet.</p>
              {context.canEdit ? (
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" href={`${self}/find`}>
                    Find ADs{aircraftRes.data?.make || aircraftRes.data?.model ? ` for ${[aircraftRes.data?.make, aircraftRes.data?.model].filter(Boolean).join(" ")}` : ""}
                  </Button>
                  <Button href={`${self}?panel=new`}>Track one by number</Button>
                </div>
              ) : (
                <p className="text-body text-ink-2">You can view this aircraft. Ask the owner to make you an editor to track ADs.</p>
              )}
            </div>
          ) : (
            <>
              <p className="mb-4 max-w-[60ch] text-lede">
                {rows.length} {rows.length === 1 ? "AD or SB" : "ADs and SBs"} tracked.{" "}
                {recurringCount > 0 && `${recurringCount} recurring. `}
                {openCount > 0 ? `${openCount} with no compliance recorded.` : "Every one has a compliance or a reason on file."}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="text-label text-ink-3">
                      <th scope="col" className="border-b border-rule-2 pr-3 pb-2 font-bold">AD</th>
                      <th scope="col" className="border-b border-rule-2 pr-3 pb-2 font-bold">Applies</th>
                      <th scope="col" className="border-b border-rule-2 pr-3 pb-2 font-bold">
                        Compliance on the line, {axis.from.slice(0, 4)} to {axis.to.slice(0, 4)}
                      </th>
                      <th scope="col" className="border-b border-rule-2 pr-3 pb-2 font-bold">Next due</th>
                      <th scope="col" className="border-b border-rule-2 pb-2 font-bold">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const isSel = selected?.ad.id === r.ad.id;
                      const cell = `border-b border-rule py-2.5 pr-3 align-top ${isSel ? "bg-leaf-2" : ""}`;
                      const latest = r.stops[0];
                      const hrs = r.item ? hoursCell(r.item, today) : null;
                      const cal = r.item ? calendarCell(r.item) : null;
                      return (
                        <tr key={r.ad.id}>
                          <td className={cell}>
                            <Link href={sel(r.ad.id)} replace scroll={false} aria-current={isSel ? "true" : undefined} className="block hover:underline">
                              <span className="block text-body-strong tabular-nums">{r.ad.kind === "sb" ? "SB " : ""}{r.ad.reference}</span>
                              {r.ad.title && <span className="block max-w-[28ch] text-small text-ink-2">{r.ad.title}</span>}
                            </Link>
                          </td>
                          <td className={cell}>
                            <StatusMark kind={r.state.mark} label={r.state.word} compact />
                            <span className="block text-small text-ink-3">{r.state.detail}</span>
                          </td>
                          <td className={cell}>
                            <MiniLine stops={r.stops} due={r.item?.firstDate ?? null} dueStatus={r.item?.status ?? null} axis={axis} today={today} na={r.ad.status === "not_applicable" || r.ad.status === "superseded" ? (r.ad.status_changed_on ? `No line: not applicable since ${fmtDate(r.ad.status_changed_on)}` : "No line: never applied to this aircraft") : null} />
                            {r.ad.recurring && r.stops.length > 0 && (
                              <span className="block text-caption text-ink-3">
                                {r.stops.length} since {new Date(`${r.stops[r.stops.length - 1].date}T00:00:00Z`).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}
                              </span>
                            )}
                          </td>
                          <td className={`${cell} whitespace-nowrap`}>
                            {hrs || cal ? (
                              <>
                                <span className="block font-semibold tabular-nums">{hrs?.limit ?? cal?.limit}</span>
                                <span className="block text-small text-ink-3">{hrs ? (hrs.note ?? cal?.limit ?? "") : (cal?.note ?? "")}</span>
                                {(r.item?.status === "overdue" || r.item?.status === "due_soon") && <StatusMark kind={r.item.status} compact />}
                              </>
                            ) : (
                              <span className="text-ink-3">none</span>
                            )}
                          </td>
                          <td className={cell}>
                            {latest?.pageId && latest.pageLabel ? (
                              <Link href={sel(r.ad.id, `&stop=${latest.id}`)} replace scroll={false} className="text-caption text-board-ink underline decoration-dotted underline-offset-[3px]">
                                {latest.pageLabel}
                              </Link>
                            ) : latest ? (
                              <YourNote />
                            ) : (
                              <span className="text-small text-ink-3">none</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {untracked.length > 0 && (
            <HungSection title="Referenced, not tracked" count={`${untracked.length}`}>
              <ul className="divide-y divide-rule">
                {untracked.map((u) => (
                  <li key={`${u.kind}:${u.reference}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                    <span className="min-w-0 flex-1 text-body">
                      {u.kind === "sb" ? "SB" : "AD"} {u.reference} is mentioned on{" "}
                      {u.pageId && pageLabels.get(u.pageId) ? pageLabels.get(u.pageId) : "a confirmed entry"}
                      {u.date ? ` (${fmtDate(u.date)})` : ""} but not tracked.
                    </span>
                    {context.canEdit && (
                      <form action={trackReference.bind(null, id, u.kind, u.reference)}>
                        <button type="submit" className={buttonClass("secondary", "s")}>Track it</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </HungSection>
          )}
          {waiting > 0 && (
            <p className="mt-3 text-small text-ink-3">References on {waiting === 1 ? "1 page" : `${waiting} pages`} waiting for review will appear once confirmed.</p>
          )}

          {selected && (
            <SelectedAd
              row={selected}
              official={selected.ad.ad_reference_id ? (officials.get(selected.ad.ad_reference_id) ?? null) : null}
              canEdit={context.canEdit}
              aircraftId={id}
              stopId={stop?.id ?? null}
              all={sp.all === "1"}
              sel={sel}
            />
          )}
          <p className="mt-6 text-small text-ink-3">
            Your tracking record, not an airworthiness determination. The logbooks and the FAA remain the authority.
          </p>
        </Leaf>
        {right}
      </Leaves>
    </Board>
  );
}

function rank(r: { ad: AdCompliance; item: DueItem | null }) {
  if (r.item && r.item.status in RANK) return RANK[r.item.status];
  if (r.ad.status === "not_applicable" || r.ad.status === "superseded") return 6;
  return r.ad.recurring ? 3 : 4;
}

/** A 200px line of this AD's compliance stops on the shared axis, with the next due as a ring (W-MAINT-01). */
function MiniLine({
  stops,
  due,
  dueStatus,
  axis,
  today,
  na,
}: {
  stops: Stop[];
  due: string | null;
  dueStatus: string | null;
  axis: { from: string; to: string };
  today: string;
  na: string | null;
}) {
  if (na) return <span className="text-small text-ink-3">{na}</span>;
  const W = 200;
  const x = (d: string) => 6 + axisX(d, axis) * (W - 12);
  const ring = dueStatus === "overdue" || dueStatus === "due_soon" ? "var(--color-alarm)" : "var(--color-ink)";
  const label = `${stops.length} ${stops.length === 1 ? "compliance" : "compliances"}${due ? `, next due ${fmtDate(due)}` : ""}`;
  return (
    <svg viewBox={`0 0 ${W} 20`} width={W} height={20} role="img" aria-label={label} className="block">
      <line x1={6} x2={x(today)} y1={10} y2={10} stroke="var(--color-line-airframe)" strokeWidth={3} strokeLinecap="round" />
      <line x1={x(today)} x2={W - 6} y1={10} y2={10} stroke="var(--color-line-airframe)" strokeWidth={3} strokeLinecap="round" strokeDasharray="0.1 7" />
      <line x1={x(today)} x2={x(today)} y1={3} y2={17} stroke="var(--color-ink)" strokeWidth={1} />
      {stops.map((s) => (
        <circle key={s.id} cx={x(s.date)} cy={10} r={4} fill="var(--color-leaf)" stroke="var(--color-ink)" strokeWidth={2} strokeDasharray={s.trust === "ai_read" ? "1.5 1.5" : undefined} />
      ))}
      {due && <circle cx={x(due)} cy={10} r={6} fill="none" stroke={ring} strokeWidth={2.5} />}
    </svg>
  );
}

function SelectedAd({
  row,
  official,
  canEdit,
  aircraftId,
  stopId,
  all,
  sel,
}: {
  row: { ad: AdCompliance; item: DueItem | null; stops: Stop[]; state: ReturnType<typeof adState> };
  official: AdReference | null;
  canEdit: boolean;
  aircraftId: string;
  stopId: string | null;
  all: boolean;
  sel: (adId: string, extra?: string) => string;
}) {
  const { ad, stops } = row;
  const name = `${ad.kind.toUpperCase()} ${ad.reference}`;
  // Show the newest two and the first; the ones in between on request.
  const hidden = !all && stops.length > 4 ? stops.slice(2, -1) : [];
  const shown = hidden.length ? [...stops.slice(0, 2), stops[stops.length - 1]] : stops;
  const summary = ad.recurring ? intervalSummary(stops, ad.interval_hours, ad.interval_months) : null;
  const th = "border-b border-rule-2 pr-3 pb-2 font-bold";

  return (
    <HungSection title="Compliance history" count={name}>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-heading">{name}</h3>
        {ad.title && <span className="text-body text-ink-2">{ad.title}</span>}
        {ad.verified_report_page_id && (
          <Link href={sel(ad.id, "&report=1")} replace scroll={false} className="rounded-[var(--radius-s)] border border-ink px-1.5 text-label text-ink">
            A&amp;P report on file
          </Link>
        )}
      </div>
      {(ad.status === "not_applicable" || ad.status === "superseded") && (
        <p className="mb-3 text-body">
          {row.state.word}: {row.state.detail}
        </p>
      )}
      {ad.applicability && <p className="mb-2 text-small text-ink-2">{ad.applicability}</p>}
      {ad.notes && <p className="mb-3 text-small text-ink-2">{ad.notes}</p>}

      {stops.length === 0 ? (
        <p className="text-body text-ink-2">No compliance recorded.{canEdit ? " Record it with the date and the entry that shows it." : ""}</p>
      ) : (
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="text-label text-ink-3">
              <th scope="col" className={th}>Date</th>
              <th scope="col" className={`${th} text-right`}>Tach</th>
              <th scope="col" className={th}>What was done</th>
              <th scope="col" className={th}>Trust</th>
              <th scope="col" className="border-b border-rule-2 pb-2 font-bold">Page</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s, i) => {
              const cell = `border-b border-rule py-2.5 pr-3 align-top ${s.id === stopId ? "bg-leaf-2" : ""}`;
              return (
                <Fragment key={s.id}>
                  {hidden.length > 0 && i === 2 && (
                    <tr>
                      <td colSpan={5} className="border-b border-rule py-2">
                        <Link href={sel(ad.id, "&all=1")} replace scroll={false} className="text-small font-semibold text-board-ink underline decoration-dotted">
                          Show the {hidden.length} in between
                        </Link>
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td className={`${cell} whitespace-nowrap font-semibold`}>{fmtDate(s.date)}</td>
                    <td className={`${cell} text-right tabular-nums`}>{s.hours != null ? fmtMeter(s.hours) : "—"}</td>
                    <td className={`${cell} max-w-[30ch] text-small`}>{s.what ?? ""}</td>
                    <td className={cell}>
                      <TrustMark level={s.trust} label={s.trust === "ai_read" ? "Read by AI, not counted" : undefined} />
                    </td>
                    <td className={cell}>
                      {s.pageId && s.pageLabel ? (
                        <Link href={sel(ad.id, `&stop=${s.id}`)} replace scroll={false} className="text-caption text-board-ink underline decoration-dotted underline-offset-[3px]">
                          {s.pageLabel}
                        </Link>
                      ) : (
                        <YourNote />
                      )}
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
      {summary && <p className={`mt-2 text-small ${summary.over ? "font-semibold text-alarm-text" : "text-ink-2"}`}>{summary.text}</p>}

      <div className="mt-4 text-small">
        <span className="font-semibold">FAA document: </span>
        {official ? (
          <span className="inline-flex flex-wrap gap-x-3">
            {official.title && <span className="text-ink-2">{official.title}</span>}
            {official.effective_date && <span className="text-ink-3">effective {fmtDate(official.effective_date)}</span>}
            {official.fr_html_url && <ExtLink href={official.fr_html_url}>Federal Register</ExtLink>}
            {official.pdf_url && <ExtLink href={official.pdf_url}>Official PDF</ExtLink>}
            {official.drs_url && <ExtLink href={official.drs_url}>FAA DRS document</ExtLink>}
          </span>
        ) : ad.kind === "ad" && canEdit ? (
          <LookupButton aircraftId={aircraftId} adId={ad.id} reference={ad.reference} />
        ) : (
          <span className="text-ink-3">not linked</span>
        )}
      </div>

      {canEdit && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {ad.status !== "not_applicable" && ad.status !== "superseded" && (
            <Link href={sel(ad.id, "&panel=record")} replace scroll={false} className={buttonClass("primary", "s")}>
              Record compliance
            </Link>
          )}
          <Link href={sel(ad.id, "&panel=edit")} replace scroll={false} className={buttonClass("quiet", "s")}>
            Edit
          </Link>
          <form action={stopTracking.bind(null, aircraftId, ad.id)}>
            <ConfirmSubmit
              label="Stop tracking"
              question={`Stop tracking ${name}? Its compliance history is deleted from the index. The logbook entries stay.`}
            />
          </form>
        </div>
      )}
    </HungSection>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-board-ink underline decoration-dotted">
      {children} <ExternalLink aria-hidden size={13} />
    </a>
  );
}

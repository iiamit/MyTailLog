import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAircraftShellContext } from "@/lib/aircraftContext";
import { computeStatus, fmtDate, type DueItem, type MeterName, type Trust } from "@/lib/due/engine";
import { loadDueInput } from "@/lib/due/load";
import { aircraftTail } from "@/lib/v2/landing";
import {
  BOOK, calendarCell, firstBadge, fmtMeter, historyRows, hoursCell, leftText, primaryAction, splitPageLabel, type HistoryInput,
} from "@/lib/v2/status";
import { Board, BoardHead, HungSection, Leaf, Leaves, SourceMat, Spine } from "@/ui/Board";
import { Button, buttonClass } from "@/ui/Button";
import { FirstBadge, StatusMark, TrustMark, YourNote } from "@/ui/Marks";
import { ItemMat } from "@/ui/StatusSpread";
import { MarkDoneDrawer } from "./MarkDoneDrawer";

type Params = { id: string; itemKey: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Tracked item · ${await aircraftTail(id)}` };
}

/** W-STATUS-04 Item detail: both limits, the rule, its history with pages, and the mark-done drawer. */
export default async function ItemPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ stop?: string; panel?: string; done?: string }>;
}) {
  const { id, itemKey: rawKey } = await params;
  const itemKey = decodeURIComponent(rawKey);
  const sp = await searchParams;
  const supabase = await createClient();
  const [context, { data: auth }] = await Promise.all([getAircraftShellContext(supabase, id), supabase.auth.getUser()]);
  if (!context || !auth.user) notFound();
  const a = `/aircraft/${id}`;
  const self = `${a}/status/item/${itemKey}`;

  const loaded = await loadDueInput(supabase, id, auth.user.id).catch(() => undefined);
  const shell = (children: React.ReactNode, actions?: React.ReactNode) => (
    <Board section="status">
      <BoardHead title="Status" subTabs={[{ label: "What's due", href: `${a}/status` }]} actions={actions} />
      <Spine tail={context.reg} context="This item's history" href={`${a}/logbooks`} />
      {children}
    </Board>
  );
  const back = (
    <Link href={`${a}/status`} className="mb-3 inline-flex items-center gap-1 text-small font-semibold text-board-ink">
      <ChevronLeft aria-hidden size={16} /> What&apos;s due
    </Link>
  );
  if (loaded === undefined) {
    return shell(
      <Leaves split="1.5fr 1fr">
        <Leaf label="Tracked item">
          {back}
          <p className="mb-3 text-lede text-ink-2">This item could not be loaded.</p>
          <Button variant="quiet" href={self}>Try again</Button>
        </Leaf>
        <SourceMat />
      </Leaves>,
    );
  }
  if (!loaded) notFound();

  const snap = computeStatus(loaded.input, loaded.today);
  const item = snap.items.find((i) => i.key === itemKey);
  if (!item) {
    // 03 §11.5: a deleted or unknown item says so instead of a bare 404 inside the binder.
    return shell(
      <Leaves split="1.5fr 1fr">
        <Leaf label="Tracked item">
          {back}
          <p className="text-lede">This item is no longer tracked.</p>
        </Leaf>
        <SourceMat />
      </Leaves>,
    );
  }

  const [source, rowId] = [item.source, itemKey.slice(itemKey.indexOf(":") + 1)];
  const mx = source === "maintenance" ? loaded.input.maintenance_item?.find((m) => m.id === rowId) : undefined;
  const ad = source === "ad" ? loaded.input.ad_compliance?.find((r) => r.id === rowId) : undefined;
  const history = source === "document" ? [] : historyRows(historyInputs(loaded.input, item, rowId), item.kind, mx?.interval_months ?? ad?.interval_months ?? null);
  const selected = history.find((h) => h.id === sp.stop) ?? history.find((h) => h.pageId) ?? null;
  const meter: MeterName = item.hours?.meter ?? (mx?.meter as MeterName | undefined) ?? "tach";
  const reading = snap.meters[meter];
  const provider = item.providerId ? loaded.input.service_provider?.find((p) => p.id === item.providerId)?.name : null;
  const waiting = snap.counts.pagesToReview;

  // The drawer covers tracked items with the generic fields; the VOR check, ADs and documents keep their own forms
  // (91.171(d) fields, method of compliance, new expiry) in their home screens until those drawers land.
  const generic = source === "maintenance" && item.kind !== "vor";
  const home =
    source === "ad" ? { label: "Open in ADs and SBs", href: `${a}/compliance?ui=v1` }
    : source === "document" ? { label: "Open in Documents", href: `${a}/documents` }
    : { label: "Edit the rule", href: `${a}/maintenance?ui=v1` };
  const actionHref = generic ? `${self}?panel=done` : home.href;
  const drawerOpen = context.canEdit && sp.panel === "done" && generic && !!mx;

  const cal = calendarCell(item);
  const hrs = hoursCell(item, snap.today);
  const first = firstBadge(item);
  const left = leftText(item);
  const unconfirmed = history.filter((h) => h.trust === "ai_read");
  const counted = history.filter((h) => h.trust !== "ai_read");
  const firstYear = counted.length ? counted[counted.length - 1].date.slice(0, 4) : null;

  const right = drawerOpen && mx ? (
    <MarkDoneDrawer
      aircraftId={id}
      itemId={mx.id}
      label={item.label}
      kind={item.kind}
      meter={meter}
      intervalMonths={mx.interval_months ?? null}
      intervalHours={mx.interval_hours ?? null}
      today={snap.today}
      latest={reading.face != null ? { value: reading.face, date: reading.asOf } : null}
      closeHref={self}
    />
  ) : selected?.pageId ? (
    <ItemMat item={{ ...item, lastDone: { date: selected.date, hours: selected.hours, entryId: selected.entryId, pageId: selected.pageId, pageLabel: selected.pageLabel, trust: selected.trust, signer: selected.signer } }} aircraftId={id} />
  ) : (
    <ItemMat item={item} aircraftId={id} />
  );

  return shell(
    <Leaves split="1.5fr 1fr">
      <Leaf label={item.label}>
        {back}
        {sp.done === "1" && (
          <p role="status" className="mb-3 rounded-s bg-leaf-2 px-4 py-3 text-body">
            Marked {item.label} done.{item.firstDate ? ` Next due ${fmtDate(item.firstDate)}.` : ""}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <h2 className="text-heading">{item.label}</h2>
          <StatusMark kind={item.advisory && item.status === "current" ? "advisory" : item.status} label={item.status === "overdue" && left ? `Overdue · ${left}` : undefined} />
        </div>
        <p className="mt-1 mb-4 text-small text-ink-3">
          {[item.line ? BOOK[item.line] : null, item.rule || null, item.ifrOnly ? "IFR only" : null, !item.calendar && source !== "document" ? "no calendar limit" : null, !item.hours && source === "maintenance" ? "no hours limit" : null].filter(Boolean).join(" · ")}
        </p>

        <HungSection title="Next due" first>
          <dl className="grid grid-cols-[96px_1fr] gap-x-[22px] gap-y-1.5">
            <dt className="text-ink-3">{source === "document" ? "Expires" : "Calendar"}</dt>
            <dd className="font-semibold">
              {cal ? (
                <>
                  {cal.limit}
                  {cal.note ? ` (${cal.note})` : ""}
                  {item.calendar && ` · ${item.calendar.daysLeft < 0 ? `lapsed ${-item.calendar.daysLeft} days ago` : `${item.calendar.daysLeft} days`}`}
                  {first === "calendar" && <FirstBadge />}
                </>
              ) : (
                <span className="font-normal text-ink-3">none</span>
              )}
            </dd>
            {source !== "document" && (
              <>
                <dt className="text-ink-3">Hours</dt>
                <dd className="font-semibold">
                  {hrs && item.hours ? (
                    <>
                      {hrs.limit}
                      {hrs.note ? `, ${hrs.note}` : ""} · {item.hours.remaining <= 0 ? `${(-item.hours.remaining).toFixed(1)} h over` : `${item.hours.remaining.toFixed(1)} h`}
                      {first === "hours" && <FirstBadge />}
                    </>
                  ) : (
                    <span className="font-normal text-ink-3">none</span>
                  )}
                </dd>
              </>
            )}
          </dl>
        </HungSection>

        {source !== "document" && (
          <HungSection title="Rule">
            <dl className="grid grid-cols-[96px_1fr] gap-x-[22px] gap-y-1.5">
              {item.hours && (
                <>
                  <dt className="text-ink-3">Hours on</dt>
                  <dd className="font-semibold capitalize">{meter}</dd>
                </>
              )}
              {reading.face != null && (
                <>
                  <dt className="text-ink-3 capitalize">{meter}</dt>
                  <dd className="font-semibold">
                    reads {fmtMeter(reading.face)}
                    {reading.asOf ? `, ${fmtDate(reading.asOf)}` : ""}
                  </dd>
                </>
              )}
              {provider && (
                <>
                  <dt className="text-ink-3">Done by</dt>
                  <dd className="font-semibold">{provider}</dd>
                </>
              )}
            </dl>
            {context.canEdit && (
              <Link href={home.href} className="mt-2 inline-block text-small font-semibold text-board-ink underline decoration-dotted">
                {home.label}
              </Link>
            )}
          </HungSection>
        )}

        {source === "document" ? (
          <HungSection title="Document">
            <Link href={home.href} className="text-small font-semibold text-board-ink underline decoration-dotted">
              {home.label}
            </Link>
          </HungSection>
        ) : (
          <HungSection title="Done before" count={counted.length && firstYear ? `${counted.length} ${counted.length === 1 ? "time" : "times"} since ${firstYear}` : undefined}>
            {history.length === 0 ? (
              <p className="text-body text-ink-2">
                No completion found in the confirmed entries. If it was done, mark it done with the date, or review the pages that may hold it.{" "}
                {context.canEdit && waiting > 0 && (
                  <Link href={`${a}/review`} className="font-semibold text-board-ink underline decoration-dotted">
                    Review {waiting === 1 ? "1 page" : `${waiting} pages`}
                  </Link>
                )}
              </p>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-left text-label text-ink-3">
                    <th scope="col" className="border-b border-rule-2 pr-3 pb-2 font-bold">Date</th>
                    <th scope="col" className="border-b border-rule-2 pr-3 pb-2 text-right font-bold capitalize">{meter}</th>
                    {item.hours && <th scope="col" className="border-b border-rule-2 pr-3 pb-2 text-right font-bold">After</th>}
                    <th scope="col" className="border-b border-rule-2 pr-3 pb-2 font-bold">Page</th>
                    <th scope="col" className="border-b border-rule-2 pb-2 font-bold">Trust</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => {
                    const isSel = selected?.id === h.id;
                    const page = splitPageLabel(h.pageLabel);
                    const cell = `border-b border-rule py-2.5 pr-3 align-top ${isSel ? "bg-leaf-2" : ""}`;
                    return (
                      <tr key={h.id} className={h.trust === "ai_read" ? "outline-2 -outline-offset-2 outline-ink-3 outline-dotted" : ""}>
                        <td className={`${cell} whitespace-nowrap`}>
                          <Link href={`${self}?stop=${h.id}`} replace scroll={false} aria-current={isSel ? "true" : undefined} className="font-semibold hover:underline">
                            {fmtDate(h.date)}
                          </Link>
                          {h.lateDays != null && <div className="text-small font-semibold text-alarm-text">{h.lateDays} days late</div>}
                        </td>
                        <td className={`${cell} text-right`}>
                          {h.hours != null ? fmtMeter(h.hours) : "—"}
                          {h.sameTachAs && (
                            <div className="text-small text-alarm-text" title={`Same tach as ${fmtDate(h.sameTachAs)}. Check the page.`}>
                              ? Same tach as {fmtDate(h.sameTachAs)}. Check the page.
                            </div>
                          )}
                        </td>
                        {item.hours && <td className={`${cell} text-right`}>{h.after != null ? `${h.after.toFixed(1)} h` : ""}</td>}
                        <td className={cell}>
                          {h.pageId && page ? (
                            <Link href={`${self}?stop=${h.id}`} replace scroll={false} aria-label={`${page.book} logbook, page ${page.page}`} className={`text-caption text-board-ink underline decoration-dotted ${isSel ? "font-bold" : ""}`}>
                              {h.pageLabel}
                            </Link>
                          ) : (
                            <YourNote />
                          )}
                        </td>
                        <td className={cell}>
                          {h.trust === "ai_read" ? (
                            <span className="text-small text-ink-3">
                              <TrustMark level="ai_read" label="Read by AI, not counted" />{" "}
                              {context.canEdit && h.entryId && (
                                <Link href={`${a}/entries/${h.entryId}`} className="font-semibold text-board-ink underline decoration-dotted">
                                  Review it
                                </Link>
                              )}
                            </span>
                          ) : (
                            <TrustMark level={(h.trust ?? "confirmed") as Trust} label={h.trust === "signed" && h.signer ? `Signed by ${h.signer}` : undefined} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {unconfirmed.length > 0 && (
              <p className="mt-2 text-small text-ink-3">Entries read by AI are listed but do not move the next due until you confirm them.</p>
            )}
          </HungSection>
        )}
      </Leaf>
      {right}
    </Leaves>,
    <>
      {context.canEdit && (
        <Link href={actionHref} replace={generic} scroll={false} className={buttonClass("on-board", "m")}>
          {primaryAction(item)}
        </Link>
      )}
    </>,
  );
}

/** The item's completions joined to their entries and pages; an owner-typed last done with no rows stands in as one. */
function historyInputs(input: Parameters<typeof computeStatus>[0], item: DueItem, rowId: string): HistoryInput[] {
  const entries = new Map((input.log_entry ?? []).map((e) => [e.id, e]));
  const pages = new Map((input.page ?? []).map((p) => [p.id, p]));
  const books = new Map((input.logbook ?? []).map((b) => [b.id, b.type]));
  const rows = (input.item_completion ?? []).filter((c) =>
    item.source === "maintenance" ? c.maintenance_item_id === rowId : c.ad_compliance_id === rowId,
  );
  const out: HistoryInput[] = [];
  for (const c of rows) {
    const e = c.log_entry_id ? entries.get(c.log_entry_id) : undefined;
    if (e?.replaced_by_entry_id) continue;
    const p = e?.page_id ? pages.get(e.page_id) : undefined;
    out.push({
      id: c.id, date: c.done_date, hours: c.done_hours ?? null, entryId: e?.id ?? null, pageId: p?.id ?? null,
      pageLabel: p && p.page_sequence != null ? `${BOOK[books.get(p.logbook_id) ?? "other"] ?? "Other"} p. ${p.page_sequence}` : null,
      trust: e ? e.trust : "confirmed", signer: e?.signature_name ?? null,
    });
  }
  if (!rows.length && item.lastDone?.date)
    out.push({ id: "last", date: item.lastDone.date, hours: item.lastDone.hours, entryId: item.lastDone.entryId, pageId: item.lastDone.pageId, pageLabel: item.lastDone.pageLabel, trust: item.lastDone.trust, signer: item.lastDone.signer });
  return out;
}

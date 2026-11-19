import type { Metadata } from "next";
import Link from "next/link";
import { Board, HungSection, Leaf, Leaves, SourceMat } from "@/ui/Board";
import { Button } from "@/ui/Button";
import { TrustMark } from "@/ui/Marks";
import { RouteMap, type StopInfo } from "@/ui/RouteMap";
import { ScanViewer } from "@/ui/ScanViewer";
import { BookTabs, type BookPage } from "@/ui/BookTabs";
import { aircraftTail } from "@/lib/v2/landing";
import { entriesByIds, loadBooks, pageLabel, type EntryRow } from "@/lib/v2/booksLoad";
import { BOOK_NAME, clip, entryBox, entryTitle, fmtDay, fmtMonth, parseMapParams, withParams, zoomWindow } from "@/lib/v2/books";
import { gapEvidence, type StoredGap } from "@/lib/gaps";
import { itemSummary, fmtMeter } from "@/lib/v2/status";
import { BooksHead } from "../BooksHead";
import { GapActions } from "./GapActions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Map · ${await aircraftTail(id)}` };
}

const BOOK_CHIPS = [undefined, "airframe", "engine", "prop", "avionics"] as const;

/** W-BOOKS-01 Map, with W-BOOKS-02 (one book), W-BOOKS-03 (zoom) and W-BOOKS-04 (gap selected). */
export default async function MapPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const p = parseMapParams(await searchParams);
  const books = await loadBooks(id);
  const { context, model, due, supabase } = books;
  const a = `/aircraft/${id}`;
  const base = `${a}/logbooks/map`;
  const canEdit = context.canEdit;
  const actions = canEdit ? <Button variant="on-board" href={`${a}/logbooks/add`}>Add pages</Button> : null;

  if (!model || !due) {
    return (
      <Board section="books">
        <BooksHead id={id} books={books} current="map" actions={actions} spine={{ context: "whole life" }} />
        <Leaves>
          <Leaf label="Map">
            <p className="mb-3 text-lede text-ink-2">The map could not be drawn.</p>
            <div className="flex gap-2">
              <Button href={base}>Try again</Button>
              <Button variant="quiet" href={`${a}/logbooks/list`}>Use the list</Button>
            </div>
          </Leaf>
          <SourceMat />
        </Leaves>
      </Board>
    );
  }

  const input = due.loaded.input;
  const allEntries = input.log_entry ?? [];
  const pageSeq = new Map((input.page ?? []).map((pg) => [pg.id, pg.page_sequence]));
  const entryById = new Map(allEntries.map((e) => [e.id, e]));
  const life = { from: model.range.from, to: model.range.to };
  const zoom = zoomWindow(p, life);
  const inWindow = (d: string) => !zoom || (d >= zoom.from && d <= zoom.to);
  const lineOf = (lineId: string) => model.lines.find((l) => l.lineId === lineId);

  // Names and tooltips for every stop and ring (10 §10).
  const stopInfo: Record<string, StopInfo> = {};
  for (const s of model.stops) {
    const first = s.entryIds.map((eid) => entryById.get(eid)).find(Boolean);
    stopInfo[s.id] = { title: s.label ?? (first ? entryTitle(first) : null), page: s.pageIds[0] ? pageSeq.get(s.pageIds[0]) ?? null : null };
  }
  const ringNames = Object.fromEntries(due.snap.items.map((i) => [i.key, itemSummary(i)]));

  // Selection from the URL.
  const stop = p.stop ? model.stops.find((s) => s.entryIds.includes(p.stop!)) : undefined;
  const visit = p.visit ? model.interchanges.find((x) => x.id === p.visit) : undefined;
  const gapRow = p.gap ? input.logbook_gap?.find((g) => g.id === p.gap) : undefined;
  const selected = stop ? `stop:${stop.id}` : visit ? `interchange:${visit.id}` : gapRow ? `gap:${gapRow.id}` : null;
  const missing = (p.stop && !stop) || (p.visit && !visit) || (p.gap && !gapRow);

  // Heading (W-BOOKS-01/02/03).
  const drawn = model.stops.filter((s) => inWindow(s.date) && (!p.book || s.logbook === p.book));
  const confirmedCount = drawn.reduce((n, s) => n + s.entryIds.filter((eid) => entryById.get(eid)?.trust !== "ai_read").length, 0);
  const years = Number(model.today.slice(0, 4)) - Number(model.range.from.slice(0, 4));
  const bookLine = p.book ? model.lines.find((l) => l.logbook === p.book) : undefined;
  const heading = zoom
    ? `${zoom.from.slice(0, 4)} to ${zoom.to.slice(0, 4)}, ${confirmedCount} ${confirmedCount === 1 ? "entry" : "entries"}`
    : p.book
      ? `${BOOK_NAME[p.book]} logbook, ${confirmedCount} ${confirmedCount === 1 ? "entry" : "entries"}`
      : `${years} ${years === 1 ? "year" : "years"}, ${confirmedCount} confirmed ${confirmedCount === 1 ? "entry" : "entries"}`;
  const hasUnconfirmed = model.stops.some((s) => s.trust === "ai_read");
  const onlyOther = model.lines.length === 0;

  // Selection detail and the mat.
  let detail: React.ReactNode = (
    <p className="text-body text-ink-2">
      Click any stop to open its page. Use the arrow keys on the map to walk a line, and plus or minus to zoom.
    </p>
  );
  let mat: React.ReactNode = <SourceMat />;

  if (stop) {
    const rows = (await entriesByIds(supabase, id, stop.entryIds)).sort((x, y) => (x.entry_index ?? 0) - (y.entry_index ?? 0));
    const line = lineOf(stop.lineId);
    const onLine = model.stops.filter((s) => s.lineId === stop.lineId).sort((x, y) => x.date.localeCompare(y.date));
    const i = onLine.findIndex((s) => s.id === stop.id);
    const before = onLine[i - 1], after = onLine[i + 1];
    const first = rows[0];
    const pl = first?.page_id ? pageLabel(model, input.logbook ?? [], first.logbook_id, pageSeq.get(first.page_id) ?? null) : null;
    detail = (
      <HungSection title="Selected" first>
        <h2 className="text-heading">
          {fmtDay(stop.date)} · {stopInfo[stop.id].title ?? `${line?.name} entry`}
        </h2>
        {rows.map((e) => (
          <div key={e.id} className="mt-3">
            <p className="font-paper text-paper whitespace-pre-line">{clip([e.description, e.work_performed].filter(Boolean).join(" "), 400)}</p>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-ink-2">
              <TrustMark level={e.trust} />
              {e.tach != null && <span>Tach {fmtMeter(e.tach)}</span>}
              {e.hobbs != null && <span>Hobbs {fmtMeter(e.hobbs)}</span>}
              <Link className="font-semibold text-board-ink underline decoration-dotted" href={`${a}/logbooks/entries/${e.id}`}>
                Open entry
              </Link>
            </p>
            {e.trust === "ai_read" && (
              <p className="mt-2 text-small text-ink-2">
                Read by AI, not yet confirmed.{" "}
                {canEdit && e.page_id && (
                  <Link className="font-semibold text-board-ink underline decoration-dotted" href={`${a}/logbooks/review/${e.page_id}?entry=${e.id}`}>
                    Review this page
                  </Link>
                )}
              </p>
            )}
          </div>
        ))}
        <p className="mt-3 text-small text-ink-3">
          {before ? (
            <>
              Before it on this line:{" "}
              <Link className="font-semibold text-board-ink underline decoration-dotted" href={`${base}${withParams(p, { stop: before.entryIds[0], visit: undefined, gap: undefined })}`} replace scroll={false}>
                {fmtDay(before.date)}
              </Link>
            </>
          ) : (
            "The first entry on this line."
          )}
          {" · "}
          {after ? (
            <>
              after it:{" "}
              <Link className="font-semibold text-board-ink underline decoration-dotted" href={`${base}${withParams(p, { stop: after.entryIds[0], visit: undefined, gap: undefined })}`} replace scroll={false}>
                {fmtDay(after.date)}
              </Link>
            </>
          ) : (
            "the latest on this line."
          )}
        </p>
      </HungSection>
    );
    mat = (
      <SourceMat title={pl?.long ?? `${line?.name ?? ""} logbook`} meta={`${fmtDay(stop.date)} · ${first ? trustWord(first) : ""}`}>
        {first?.page_id ? (
          <>
            <ScanViewer key={first.page_id} src={`/api/page/${first.page_id}/image`} alt={`${pl?.long}, scanned page`} lit={entryBox(first)} />
            <div>
              <Button variant="on-mat" size="s" href={`${a}/logbooks/entries/${first.id}`}>
                Open entry
              </Button>
            </div>
          </>
        ) : (
          <p className="m-auto text-[15px] text-on-cover-2">No page for this yet.</p>
        )}
      </SourceMat>
    );
  } else if (visit) {
    const stops = model.stops.filter((s) => visit.stopIds.includes(s.id));
    const rows = await entriesByIds(supabase, id, stops.flatMap((s) => s.entryIds));
    const blocks = stops.map((s) => ({ s, e: rows.filter((r) => s.entryIds.includes(r.id)) }));
    const pages: BookPage[] = blocks.map(({ s, e }) => {
      const r = e[0];
      const pl = r?.page_id ? pageLabel(model, input.logbook ?? [], r.logbook_id, pageSeq.get(r.page_id) ?? null) : null;
      return { key: s.id, book: s.logbook, label: pl?.short ?? BOOK_NAME[s.logbook], pageId: r?.page_id ?? null, alt: `${pl?.long ?? BOOK_NAME[s.logbook]}, scanned page`, lit: r ? entryBox(r) : null };
    });
    const signer = rows.find((r) => r.signature_name);
    const tach = rows.find((r) => r.tach != null)?.tach;
    detail = (
      <HungSection title="Selected" first>
        <h2 className="text-heading">{fmtDay(visit.date)}</h2>
        <p className="text-small text-ink-2">
          {visit.label ?? "One visit"}, {stops.length} books
        </p>
        {blocks.map(({ s, e }) => (
          <div key={s.id} className="mt-3 border-t border-rule pt-3">
            <h3 className="text-body-strong">{lineOf(s.lineId)?.name}</h3>
            {e.map((r) => (
              <div key={r.id}>
                <p className="line-clamp-2 font-paper text-paper">{[r.description, r.work_performed].filter(Boolean).join(" ")}</p>
                <p className="mt-1 flex gap-4 text-small">
                  <TrustMark level={r.trust} />
                  <Link className="font-semibold text-board-ink underline decoration-dotted" href={`${a}/logbooks/entries/${r.id}?line=${s.logbook}`}>
                    Open entry
                  </Link>
                </p>
              </div>
            ))}
          </div>
        ))}
      </HungSection>
    );
    mat = (
      <SourceMat title={visit.label ? `${visit.label}, one visit` : "One visit"} meta={[signer && `${signer.signature_name}${signer.mechanic_cert_number ? `, ${signer.mechanic_cert_number}` : ""}`, tach != null && `tach ${fmtMeter(tach)}`].filter(Boolean).join(" · ")}>
        <BookTabs pages={pages} />
      </SourceMat>
    );
  } else if (gapRow) {
    const ev = gapEvidence({ gap: gapRow as StoredGap & { note: string | null }, logbook: input.logbook ?? [], log_entry: allEntries, page: input.page ?? [] });
    if (ev) {
      const name = BOOK_NAME[ev.gap.logbook];
      const neighbours = [ev.neighbourPages.before, ev.neighbourPages.after];
      const nbRows = await entriesByIds(supabase, id, neighbours.map((n) => n?.entryId).filter((x): x is string => !!x));
      detail = (
        <>
          <HungSection title="The gap" first>
            <h2 className="text-heading">
              No {name.toLowerCase()} pages, {fmtMonth(ev.gap.from)} to {fmtMonth(ev.gap.to)}
            </h2>
            <p className="mt-2 text-body">{ev.verdict}</p>
          </HungSection>
          <HungSection title="What the other books show">
            <ul className="space-y-2">
              {ev.otherBooks.map((o) => (
                <li key={o.logbook} className="text-body">
                  {o.entries ? (
                    <>
                      <span className="font-bold">{BOOK_NAME[o.logbook]}</span> {o.entries} {o.entries === 1 ? "entry" : "entries"}
                      {o.annuals ? `, ${o.annuals} ${o.annuals === 1 ? "annual" : "annuals"}` : ""}
                      {o.tachFrom != null && o.tachTo != null ? ` · tach ${fmtMeter(o.tachFrom)} to ${fmtMeter(o.tachTo)}` : ""}
                      {o.pageRange ? ` · ${o.pageRange}` : ""}
                    </>
                  ) : (
                    `No ${BOOK_NAME[o.logbook].toLowerCase()} entries either.`
                  )}
                </li>
              ))}
              {ev.hoursFlownApprox != null && <li className="text-body">About {ev.hoursFlownApprox.toLocaleString("en-US")} hours flown.</li>}
              {ev.unconfirmedPagesInGap > 0 && (
                <li className="text-body">
                  {ev.unconfirmedPagesInGap} {ev.unconfirmedPagesInGap === 1 ? "page" : "pages"} read, not yet confirmed.{" "}
                  {canEdit && (
                    <Link className="font-semibold text-board-ink underline decoration-dotted" href={`${a}/logbooks/review`}>
                      Review them
                    </Link>
                  )}
                </li>
              )}
            </ul>
          </HungSection>
          {canEdit ? (
            <HungSection title="What to do">
              <GapActions aircraftId={id} gapId={ev.gap.id} status={ev.gap.status} note={ev.gap.note} scanHref={`${a}/logbooks/add`} />
            </HungSection>
          ) : (
            ev.gap.note && (
              <HungSection title="Owner's note">
                <p className="font-paper text-paper">“{ev.gap.note}”</p>
              </HungSection>
            )
          )}
        </>
      );
      mat = (
        <SourceMat title="Either side of the gap" meta={`The last ${name.toLowerCase()} page before it and the first after`}>
          {neighbours.map((n, i) =>
            n ? (
              <div key={n.pageId} className="flex min-h-[260px] flex-1 flex-col gap-1.5">
                <h3 className="text-[14px] font-bold text-on-cover">
                  {n.label}
                  {nbRows.find((r) => r.id === n.entryId)?.entry_date ? ` · ${fmtDay(nbRows.find((r) => r.id === n.entryId)!.entry_date!)}` : ""}
                </h3>
                <ScanViewer src={`/api/page/${n.pageId}/image`} alt={`${n.label}, scanned page`} lit={entryBox(nbRows.find((r) => r.id === n.entryId))} />
              </div>
            ) : (
              <p key={i} className="text-[15px] text-on-cover-2">
                {i === 0 ? "No page before the gap." : "No page after the gap yet."}
              </p>
            ),
          )}
        </SourceMat>
      );
    }
  }

  const chips = (
    <nav aria-label="Books" className="flex flex-wrap items-center gap-1.5">
      {BOOK_CHIPS.filter((b) => !b || model.lines.some((l) => l.logbook === b)).map((b) => {
        const on = p.book === b;
        return (
          <Link
            key={b ?? "all"}
            href={`${base}${withParams(p, { book: b })}`}
            replace
            scroll={false}
            aria-current={on ? "true" : undefined}
            className={`state-layer inline-flex h-8 items-center gap-1.5 rounded-pill border px-3 text-small font-semibold ${on ? "border-ink bg-ink text-leaf" : "border-control-border text-ink"}`}
          >
            {b && <span aria-hidden className="inline-block h-1 w-3.5 rounded-[2px]" style={{ background: `var(--color-line-${b === "prop" ? "propeller" : b})` }} />}
            {b ? BOOK_NAME[b] : "All books"}
          </Link>
        );
      })}
      <span className="ml-auto inline-flex overflow-hidden rounded-control border border-control-border text-small font-semibold" role="group" aria-label="View">
        <span aria-current="page" className="bg-ink px-3 py-1.5 text-leaf">Map</span>
        <Link href={`${a}/logbooks/list${withParams(p, { visit: undefined, gap: undefined })}`} className="state-layer px-3 py-1.5 text-ink" aria-keyshortcuts="l">
          List
        </Link>
      </span>
    </nav>
  );

  return (
    <Board section="books">
      <BooksHead
        id={id}
        books={books}
        current="map"
        actions={actions}
        spine={{
          context: zoom ? `${zoom.from.slice(0, 4)} to ${zoom.to.slice(0, 4)}` : "whole life",
          window: zoom ?? (gapRow ? { from: gapRow.from_date, to: gapRow.to_date } : null),
          linkLabel: zoom ? "Whole life" : undefined,
          href: zoom ? `${base}${withParams(p, { from: undefined, to: undefined })}` : undefined,
          windowDescription: zoom ? `${zoom.from.slice(0, 4)} to ${zoom.to.slice(0, 4)} bracketed` : undefined,
        }}
      />
      <Leaves split="1.62fr 1fr" mapFirst>
        <Leaf label="Map">
          {chips}
          <div className="mt-3 mb-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div>
              <h2 className="text-heading">{heading}</h2>
              {bookLine && (
                <p className="text-small text-ink-3">
                  {model.lines.length - 1} other {model.lines.length - 1 === 1 ? "book" : "books"} shown faint
                </p>
              )}
            </div>
            <Legend unconfirmed={hasUnconfirmed} />
          </div>
          {missing && <p className="mb-2 rounded-control bg-leaf-2 px-3 py-2 text-small">That selection is no longer on the map. It may have been deleted or merged.</p>}
          {onlyOther ? (
            <p className="py-6 text-body text-ink-2">Add pages to a logbook to see the map.</p>
          ) : (
            <RouteMap
              model={model}
              tail={context.reg}
              base={base}
              aircraftPath={a}
              params={p}
              selected={selected}
              stopInfo={stopInfo}
              ringNames={ringNames}
            />
          )}
          {model.stops.length === 0 && !onlyOther && (
            <p className="mt-2 text-body text-ink-2">
              No confirmed entries yet. Add pages and confirm them to draw the map.{" "}
              {canEdit && (
                <Link className="font-semibold text-board-ink underline decoration-dotted" href={`${a}/logbooks/add`}>
                  Add pages
                </Link>
              )}
            </p>
          )}
          <p className="mt-1 flex flex-wrap gap-x-4 text-small text-ink-3">
            {zoom && (
              <Link className="font-semibold text-board-ink underline decoration-dotted" href={`${base}${withParams(p, { from: undefined, to: undefined })}`} replace scroll={false}>
                Whole life
              </Link>
            )}
            {model.undatedEntries > 0 && (
              <span>
                {model.undatedEntries} {model.undatedEntries === 1 ? "entry" : "entries"} without a date.{" "}
                <Link className="font-semibold text-board-ink underline decoration-dotted" href={`${a}/logbooks/list?q=`}>
                  See them in the list
                </Link>
              </span>
            )}
          </p>
          <div className="mt-3">{detail}</div>
        </Leaf>
        {mat}
      </Leaves>
    </Board>
  );
}

function Legend({ unconfirmed }: { unconfirmed: boolean }) {
  const key = "inline-block align-middle mr-1.5";
  return (
    <ul aria-label="Map key" className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-small text-ink-3">
      <li>
        <span aria-hidden className={`${key} h-1 w-[22px] rounded-[2px] bg-ink`} />
        pages
      </li>
      <li>
        <span aria-hidden className={`${key} w-[22px] border-t-2 border-dashed border-ink`} />
        no pages yet
      </li>
      <li>
        <span aria-hidden className={`${key} h-1 w-[22px] bg-[radial-gradient(circle,var(--color-ink)_1.6px,transparent_1.8px)] bg-[length:7px_4px]`} />
        ahead
      </li>
      <li>
        <span aria-hidden className={`${key} h-5 w-3 rounded-[6px] border-[2.5px] border-ink`} />
        one visit, several books
      </li>
      {unconfirmed && (
        <li>
          <span aria-hidden className={`${key} size-3 rounded-full border-[2.5px] border-dotted border-ink`} />
          read, not confirmed
        </li>
      )}
    </ul>
  );
}

const trustWord = (e: EntryRow) => (e.trust === "ai_read" ? "read by AI" : e.trust === "signed" ? "signed" : "confirmed by you");


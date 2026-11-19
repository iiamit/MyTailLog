import type { Metadata } from "next";
import Link from "next/link";
import { X } from "lucide-react";
import { Board, Leaf, Leaves } from "@/ui/Board";
import { Button } from "@/ui/Button";
import { ScanViewer } from "@/ui/ScanViewer";
import { aircraftTail } from "@/lib/v2/landing";
import { sharedAiPaused } from "@/lib/extraction/aiContext";
import { loadBooks } from "@/lib/v2/booksLoad";
import { fmtMonth } from "@/lib/v2/books";
import { SORTS, STATE_WORD, pageState, plural, sortPages, stateFilter, type PageFilter, type PageSort } from "@/lib/v2/capture";
import { BooksHead } from "../BooksHead";
import { PagesGrid, SortControl, PageDrawerActions, type GridPage } from "./PagesGrid";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Pages · ${await aircraftTail(id)}` };
}

const FILTERS: PageFilter[] = ["all", "review", "confirmed", "reading", "failed"];
const year = (d: string | null) => (d ? d.slice(0, 4) : null);

/** W-BOOKS-05 Pages library: every page by book and volume, marked with its state; select many to move, read again or delete. */
export default async function PagesLibrary({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ book?: string; vol?: string; state?: string; sort?: string; dir?: string; page?: string; done?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const books = await loadBooks(id);
  const { supabase, model, due, context } = books;
  const a = `/aircraft/${id}`;
  const canEdit = context.canEdit;
  const input = due?.loaded.input;
  const lines = model?.lines ?? [];
  const allPages = input?.page ?? [];
  const perVol = new Map<string, number>();
  for (const p of allPages) perVol.set(p.logbook_id, (perVol.get(p.logbook_id) ?? 0) + 1);

  const line = lines.find((l) => l.volumes.some((v) => v.id === sp.vol)) ?? lines.find((l) => l.logbook === sp.book) ?? lines[0];
  const vol = line?.volumes.find((v) => v.id === sp.vol) ?? line?.volumes[0];
  const volIndex = line && vol ? line.volumes.indexOf(vol) : 0;
  const filter: PageFilter = FILTERS.includes(sp.state as PageFilter) ? (sp.state as PageFilter) : "all";
  const sort: PageSort = SORTS.some((s) => s.key === sp.sort) ? (sp.sort as PageSort) : "paper";
  const desc = sp.dir === "desc";
  const href = (o: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const m = { vol: vol?.id, state: filter === "all" ? undefined : filter, sort: sort === "paper" ? undefined : sort, dir: desc ? "desc" : undefined, ...o };
    for (const [k, v] of Object.entries(m)) if (v) q.set(k, v);
    const s = q.toString();
    return `${a}/logbooks/pages${s ? `?${s}` : ""}`;
  };

  const { data: rows } = vol
    ? await supabase.from("page")
      .select("id, logbook_id, page_sequence, created_at, extraction_status, extraction_error, needs_look, duplicate_of_page_id, unread_rotated_content, detected_page_count, landing_date")
      .eq("aircraft_id", id).eq("logbook_id", vol.id).limit(2000)
    : { data: [] };
  const entries = (input?.log_entry ?? []).filter((e) => e.page_id && !e.replaced_by_entry_id && !e.is_continuation);
  const byPage = new Map<string, typeof entries>();
  for (const e of entries) byPage.set(e.page_id!, [...(byPage.get(e.page_id!) ?? []), e]);

  const withState = (rows ?? []).map((pg) => {
    const es = byPage.get(pg.id) ?? [];
    const state = pageState(pg, es);
    const dates = es.map((e) => e.entry_date).filter((d): d is string => !!d).sort();
    const tachs = es.map((e) => e.tach).filter((t): t is number => t != null);
    return { pg, es, state, date: dates[0] ?? pg.landing_date, tach: tachs.length ? Math.min(...tachs) : null };
  });
  const counts = Object.fromEntries(FILTERS.map((f) => [f, f === "all" ? withState.length : withState.filter((p) => stateFilter(p.state) === f).length]));
  const shown = sortPages(
    withState.filter((p) => filter === "all" || stateFilter(p.state) === filter).map((p) => ({ ...p, id: p.pg.id, page_sequence: p.pg.page_sequence, created_at: p.pg.created_at })),
    sort,
    desc,
  );
  const grid: GridPage[] = shown.map((p) => ({
    id: p.pg.id,
    seq: p.pg.page_sequence,
    state: p.state,
    entries: p.es.length,
    confirmed: p.es.filter((e) => e.trust !== "ai_read").length,
    spread: (p.pg.detected_page_count ?? 1) > 1,
    sideways: p.pg.unread_rotated_content,
    href: href({ page: p.pg.id }),
  }));

  const volLabel = (l: typeof line, i: number) => (l && l.volumes.length > 1 ? `volume ${i + 1}` : null);
  const bookName = line?.name ?? "Logbook";
  const heading = `${bookName} logbook${volLabel(line, volIndex) ? `, ${volLabel(line, volIndex)}` : ""}`;
  const seqs = grid.map((g) => g.seq).filter((s): s is number => s != null);
  const datesAll = withState.map((p) => p.date).filter((d): d is string => !!d).sort();
  const span = datesAll.length ? `${year(datesAll[0])} to ${year(datesAll[datesAll.length - 1])}` : null;
  const gaps = (model?.gaps ?? []).filter((g) => g.lineId === line?.lineId && g.status !== "no_pages_exist");
  const total = allPages.length;
  const sel = sp.page ? withState.find((p) => p.pg.id === sp.page) : undefined;
  const reading = counts.reading as number;
  // AI unavailable: only worth asking while pages wait to be read. Own-key readers are never paused.
  const paused = reading > 0 && !(await supabase.rpc("my_ai_key_metadata")).data?.last4 && (await sharedAiPaused(supabase).catch(() => false));
  const otherVolumes = lines.flatMap((l) => l.volumes.map((v, i) => ({ id: v.id, label: `${l.name}${l.volumes.length > 1 ? `, vol. ${i + 1}` : ""}` }))).filter((v) => v.id !== vol?.id);

  const filterWord: Record<PageFilter, string> = {
    all: "All",
    review: `To review ${counts.review}`,
    confirmed: "Confirmed",
    reading: `Being read ${counts.reading}`,
    failed: `Couldn't be read ${counts.failed}`,
  };
  const emptyFilter: Record<PageFilter, string> = {
    all: `No pages in ${bookName} yet.`,
    review: "Nothing to review here.",
    confirmed: "No confirmed pages here yet.",
    reading: "Nothing being read.",
    failed: "Every page here was read.",
  };

  return (
    <Board section="books">
      <BooksHead
        id={id}
        books={books}
        current="pages"
        actions={canEdit ? <Button variant="on-board" href={`${a}/logbooks/add${vol ? `?vol=${vol.id}` : ""}`}>Add pages</Button> : null}
        spine={{
          context: vol ? `${bookName}${volLabel(line, volIndex) ? ` vol. ${volIndex + 1}` : ""}` : "whole life",
          window: datesAll.length ? { from: datesAll[0], to: datesAll[datesAll.length - 1] } : null,
          windowDescription: span ? `${bookName} pages ${span}` : undefined,
        }}
      />
      {total === 0 ? (
        <Leaves split="1fr">
          <Leaf label="Pages">
            <h2 className="text-heading">No pages yet.</h2>
            {canEdit ? (
              <div className="mt-4"><Button variant="primary" href={`${a}/logbooks/add`}>Add pages</Button></div>
            ) : (
              <p className="mt-1 text-body text-ink-2">The owner hasn&apos;t added pages yet.</p>
            )}
          </Leaf>
        </Leaves>
      ) : (
        <Leaves split="250px 1fr">
          <Leaf label="Books">
            <nav aria-label="Books and volumes">
              <ul className="space-y-1">
                {lines.map((l) => {
                  const n = l.volumes.reduce((s, v) => s + (perVol.get(v.id) ?? 0), 0);
                  const on = l.lineId === line?.lineId;
                  return (
                    <li key={l.lineId}>
                      <Link
                        href={href({ vol: l.volumes[0].id, state: undefined, page: undefined })}
                        aria-current={on && l.volumes.length === 1 ? "page" : undefined}
                        className={`state-layer flex items-baseline justify-between rounded-[var(--radius-s)] px-2 py-1.5 text-body-strong ${on ? "bg-leaf-2" : ""}`}
                      >
                        {l.name} <span className="text-small text-ink-3">{n}</span>
                      </Link>
                      {l.volumes.length > 1 && (
                        <ul className="mt-0.5 ml-3 border-l border-rule pl-2">
                          {l.volumes.map((v, i) => (
                            <li key={v.id}>
                              <Link
                                href={href({ vol: v.id, state: undefined, page: undefined })}
                                aria-current={v.id === vol?.id ? "page" : undefined}
                                className={`state-layer block rounded-[var(--radius-s)] px-2 py-1 text-small ${v.id === vol?.id ? "bg-leaf-2 font-semibold" : "text-ink-2"}`}
                              >
                                Vol. {i + 1}{v.from && v.to ? `, ${year(v.from)} to ${year(v.to)}` : ""} · {perVol.get(v.id) ?? 0}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="mt-5 space-y-2 border-t border-rule pt-4 text-small text-ink-2">
              <p>{plural(total, "page")} in all.</p>
              {gaps.slice(0, 3).map((g) => (
                <p key={g.id}>{bookName} logbook has no pages for {fmtMonth(g.from)} to {fmtMonth(g.to)}.</p>
              ))}
            </div>
          </Leaf>
          <Leaf label={heading} className="!pt-[18px]">
            <h2 className="text-heading">{heading}</h2>
            <p className="text-small text-ink-2">
              {plural(withState.length, "page")}
              {span ? ` · ${span}` : ""}
              {seqs.length > 1 ? ` · showing pages ${Math.min(...seqs)} to ${Math.max(...seqs)}` : ""}
            </p>
            {sp.done && <p role="status" className="mt-2 text-small">{sp.done}</p>}
            {paused && <p className="mt-2 text-small">Reading is paused today. Pages wait and are read when it resumes.</p>}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <nav aria-label="Filter pages by state" className="flex flex-wrap gap-1.5">
                {FILTERS.filter((f) => f === "all" || f === "confirmed" || counts[f]).map((f) => (
                  <Link
                    key={f}
                    href={href({ state: f === "all" ? undefined : f, page: undefined })}
                    aria-current={filter === f ? "true" : undefined}
                    className={`state-layer rounded-pill border px-3 py-1 text-small font-semibold ${filter === f ? "border-ink bg-ink text-leaf" : "border-control-border text-ink"}`}
                  >
                    {filterWord[f]}
                  </Link>
                ))}
              </nav>
              <SortControl sort={sort} desc={desc} base={href({ sort: undefined, dir: undefined, page: undefined })} />
            </div>
            {grid.length === 0 ? (
              <p className="mt-6 text-body text-ink-2">{emptyFilter[filter]}</p>
            ) : (
              <PagesGrid
                aircraftId={id}
                logbookId={vol!.id}
                pages={grid}
                canEdit={canEdit}
                canReorder={canEdit && sort === "paper" && !desc && filter === "all"}
                bookLabel={heading}
                moveTargets={otherVolumes}
                stateWords={STATE_WORD}
              />
            )}
            {reading > 0 && (
              <p className="mt-4 text-small text-ink-2">
                {plural(reading, "page")} {reading === 1 ? "is" : "are"} waiting or being read. They appear here as they are read; <Link href={`${a}/logbooks/add`} className="font-semibold text-board-ink underline decoration-dotted">see the queue</Link>.
              </p>
            )}
            {sel && (
              <aside
                aria-label={`${bookName} page ${sel.pg.page_sequence ?? ""}`}
                className="fixed inset-y-3 right-3 z-30 flex w-[480px] max-w-[calc(100vw-24px)] flex-col gap-3 overflow-auto rounded-leaf bg-mat p-[18px] text-on-cover shadow-leaf"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-[13px] leading-[1.45] text-on-cover-2">
                    <h2 className="text-[15px] font-normal text-on-cover">
                      {bookName}{volLabel(line, volIndex) ? ` vol. ${volIndex + 1}` : ""}, page {sel.pg.page_sequence ?? "unnumbered"}
                    </h2>
                    {STATE_WORD[sel.state]} · {plural(sel.es.length, "entry", "entries")} · {sel.es.filter((e) => e.trust !== "ai_read").length} confirmed
                  </div>
                  <Link href={href({ page: undefined })} aria-label="Close the page" className="state-layer rounded-control p-1.5 text-on-cover">
                    <X aria-hidden size={18} />
                  </Link>
                </div>
                <ScanViewer key={sel.pg.id} src={`/api/page/${sel.pg.id}/image`} alt={`${bookName} page ${sel.pg.page_sequence ?? ""}, scanned`} />
                {sel.pg.extraction_error && <p className="text-small text-on-cover">The reader stopped: {sel.pg.extraction_error}</p>}
                {canEdit ? (
                  <PageDrawerActions
                    aircraftId={id}
                    pageId={sel.pg.id}
                    reviewHref={sel.es.length ? `${a}/logbooks/review/${sel.pg.id}` : null}
                    closeHref={href({ page: undefined })}
                    entries={sel.es.length}
                    confirmed={sel.es.filter((e) => e.trust !== "ai_read").length}
                  />
                ) : (
                  <ul className="space-y-1 text-small">
                    {sel.es.map((e, i) => (
                      <li key={e.id}>
                        <Link href={`${a}/logbooks/entries/${e.id}`} className="font-semibold text-on-cover underline decoration-dotted">
                          Open entry {i + 1}{e.entry_date ? `, ${e.entry_date}` : ""}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </aside>
            )}
          </Leaf>
        </Leaves>
      )}
    </Board>
  );
}

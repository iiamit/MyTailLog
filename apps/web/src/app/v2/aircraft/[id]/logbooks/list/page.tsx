import type { Metadata } from "next";
import Link from "next/link";
import { Board, Leaf, Leaves, SourceMat } from "@/ui/Board";
import { Button } from "@/ui/Button";
import { TrustMark } from "@/ui/Marks";
import { ScanViewer } from "@/ui/ScanViewer";
import { aircraftTail } from "@/lib/v2/landing";
import { entriesByIds, entryTexts, loadBooks, pageLabel } from "@/lib/v2/booksLoad";
import { BOOK_NAME, entryBox, fmtDay, groupByYear, highlight, matches, parseMapParams, withParams, zoomWindow } from "@/lib/v2/books";
import { fmtMeter } from "@/lib/v2/status";
import { BooksHead } from "../BooksHead";
import { ListSearch } from "./ListSearch";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Entries · ${await aircraftTail(id)}` };
}

const CHIPS = [undefined, "airframe", "engine", "prop", "avionics"] as const;

/**
 * W-BOOKS-12 List view: the map's entries as a real list, newest first, grouped by year, filterable by book, window
 * and words. The same set the map draws for the same parameters (drawable entries: not replaced, not a continuation
 * fragment); unconfirmed ones say so in words.
 */
export default async function ListPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const p = parseMapParams(await searchParams);
  const books = await loadBooks(id);
  const { model, due, supabase, context } = books;
  const a = `/aircraft/${id}`;
  const base = `${a}/logbooks/list`;
  const input = due?.loaded.input;
  const logbooks = input?.logbook ?? [];
  const typeOf = new Map(logbooks.map((b) => [b.id, b.type]));
  const pageSeq = new Map((input?.page ?? []).map((pg) => [pg.id, pg.page_sequence]));
  const texts = new Map((await entryTexts(supabase, id).catch(() => [])).map((t) => [t.id, t]));
  const life = model ? { from: model.range.from, to: model.range.to } : null;
  const zoom = life ? zoomWindow(p, life) : null;

  const drawable = (input?.log_entry ?? []).filter((e) => !e.replaced_by_entry_id && !e.is_continuation && typeOf.get(e.logbook_id) !== undefined);
  const inBook = drawable.filter((e) => !p.book || typeOf.get(e.logbook_id) === p.book);
  const fullText = (eid: string) => {
    const t = texts.get(eid);
    return t ? [t.description, t.work_performed, t.parts, t.signature_name, t.mechanic_cert_number, ...(t.ad_refs ?? []), ...(t.sb_refs ?? [])].filter(Boolean).join(" ") : "";
  };
  const rows = inBook.filter((e) => (!zoom || (e.entry_date && e.entry_date >= zoom.from && e.entry_date <= zoom.to)) && matches(fullText(e.id), p.q));
  const groups = groupByYear(rows);
  const counts = ["airframe", "engine", "prop", "avionics", "other"]
    .map((t) => ({ t, n: drawable.filter((e) => typeOf.get(e.logbook_id) === t).length }))
    .filter((c) => c.n);

  const selected = p.stop ? (await entriesByIds(supabase, id, [p.stop]))[0] : undefined;
  const sl = selected?.page_id ? pageLabel(model, logbooks, selected.logbook_id, pageSeq.get(selected.page_id) ?? null) : null;

  return (
    <Board section="books">
      <BooksHead
        id={id}
        books={books}
        current="map"
        actions={context.canEdit ? <Button variant="on-board" href={`${a}/capture`}>Add pages</Button> : null}
        spine={{ context: zoom ? `${zoom.from.slice(0, 4)} to ${zoom.to.slice(0, 4)}` : "whole life", window: zoom, linkLabel: "Open the map" }}
      />
      <Leaves split="1.9fr 1fr">
        <Leaf label="Entries">
          <nav aria-label="Books" className="flex flex-wrap items-center gap-1.5">
            {CHIPS.filter((b) => !b || counts.some((c) => c.t === b)).map((b) => (
              <Link
                key={b ?? "all"}
                href={`${base}${withParams(p, { book: b, stop: undefined })}`}
                replace
                aria-current={p.book === b ? "true" : undefined}
                className={`state-layer inline-flex h-8 items-center rounded-pill border px-3 text-small font-semibold ${p.book === b ? "border-ink bg-ink text-leaf" : "border-control-border text-ink"}`}
              >
                {b ? BOOK_NAME[b] : "All books"}
              </Link>
            ))}
            <span className="ml-auto inline-flex overflow-hidden rounded-control border border-control-border text-small font-semibold" role="group" aria-label="View">
              <Link href={`${a}/logbooks/map${withParams(p, {})}`} className="state-layer px-3 py-1.5 text-ink">
                Map
              </Link>
              <span aria-current="page" className="bg-ink px-3 py-1.5 text-leaf">List</span>
            </span>
          </nav>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <ListSearch q={p.q ?? ""} />
            <span className="text-small text-ink-2">
              {zoom ? `${fmtDay(zoom.from)} to ${fmtDay(zoom.to)}` : "Whole life"}
              {zoom && (
                <>
                  {" "}
                  <Link className="font-semibold text-board-ink underline decoration-dotted" href={`${base}${withParams(p, { from: undefined, to: undefined })}`}>
                    Clear
                  </Link>
                </>
              )}
            </span>
          </div>
          <p className="mt-2 text-small text-ink-3">{counts.map((c) => `${BOOK_NAME[c.t]} ${c.n}`).join(" · ")}</p>
          <h2 className="mt-3 text-heading">
            {p.q ? `${rows.length} ${rows.length === 1 ? "result" : "results"} for “${p.q}”` : `${rows.length} ${rows.length === 1 ? "entry" : "entries"}, newest first`}
          </h2>
          {rows.length === 0 && (
            <p className="mt-3 text-body text-ink-2">
              {p.q ? (
                <>
                  No entries match “{p.q}”.{" "}
                  <Link className="font-semibold text-board-ink underline decoration-dotted" href={`${base}${withParams(p, { q: undefined })}`}>
                    Clear the search
                  </Link>
                </>
              ) : (
                "No confirmed entries yet. Add pages and confirm them to fill the list."
              )}
            </p>
          )}
          {groups.map((g, gi) => (
            <details key={g.year} open={!!p.q || gi === 0 || g.rows.some((r) => r.id === p.stop)} className="border-t border-rule">
              <summary className="cursor-pointer py-2.5 text-section">
                <h3 className="inline">{g.year}</h3> <span className="text-small font-normal text-ink-3">{g.rows.length}</span>
              </summary>
              <ul>
                {g.rows.map((e) => {
                  const pl = pageLabel(model, logbooks, e.logbook_id, e.page_id ? pageSeq.get(e.page_id) ?? null : null);
                  const text = fullText(e.id) || e.description || "";
                  const sel = p.stop === e.id;
                  return (
                    <li
                      key={e.id}
                      className={`grid grid-cols-[112px_1fr_92px] items-baseline gap-x-[18px] gap-y-0.5 border-b border-rule py-[13px] ${sel ? "-mx-2.5 bg-leaf-2 px-2.5 shadow-[inset_4px_0_0_var(--color-board)]" : ""}`}
                    >
                      <div>
                        <Link
                          href={`${base}${withParams(p, { stop: e.id })}`}
                          replace
                          scroll={false}
                          aria-current={sel ? "true" : undefined}
                          className="text-body-strong underline-offset-2 hover:underline"
                        >
                          {e.entry_date ? fmtDay(e.entry_date) : "No date"}
                        </Link>
                        <div className="text-small text-ink-3">{pl.short}</div>
                      </div>
                      <p className="line-clamp-2 font-paper text-paper">
                        {highlight(text, p.q).map((s, i) => (s.hit ? <b key={i}>{s.text}</b> : <span key={i}>{s.text}</span>))}
                      </p>
                      <div className="text-right font-bold">{e.tach != null ? fmtMeter(e.tach) : ""}</div>
                      <div className="col-start-2 col-end-4 flex flex-wrap gap-x-3.5 text-small text-ink-3">
                        <TrustMark level={e.trust} label={e.trust === "ai_read" ? "Read by AI, not yet confirmed" : undefined} />
                        <Link className="font-semibold text-board-ink underline decoration-dotted" href={`${a}/logbooks/entries/${e.id}`}>
                          Open entry
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </details>
          ))}
        </Leaf>
        <SourceMat title={sl?.long} meta={selected?.entry_date ? fmtDay(selected.entry_date) : undefined}>
          {selected?.page_id ? (
            <>
              <ScanViewer key={selected.page_id} src={`/api/page/${selected.page_id}/image`} alt={`${sl?.long}, scanned page`} lit={entryBox(selected)} />
              <div>
                <Button variant="on-mat" size="s" href={`${a}/logbooks/entries/${selected.id}`}>
                  Open entry
                </Button>
              </div>
            </>
          ) : selected ? (
            <p className="m-auto text-[15px] text-on-cover-2">No page is linked to this entry.</p>
          ) : undefined}
        </SourceMat>
      </Leaves>
    </Board>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Board, HungSection, Leaf, Leaves, SourceMat } from "@/ui/Board";
import { Button } from "@/ui/Button";
import { TrustMark } from "@/ui/Marks";
import { ScanViewer } from "@/ui/ScanViewer";
import { aircraftTail } from "@/lib/v2/landing";
import { PAGE_COLUMNS, entriesByIds, entriesOnPages, loadBooks, pageLabel, waitingPageIds, withDoubt, type PageRow } from "@/lib/v2/booksLoad";
import { entryBox, fmtDay, pageDoubt, pageIsClean } from "@/lib/v2/books";
import { BooksHead } from "../BooksHead";
import { ConfirmClean, ConfirmImported } from "./ReviewAllControls";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Review · ${await aircraftTail(id)}` };
}

/** W-BOOKS-08 Review all: doubtful pages first with the doubt in words, clean pages confirmed in one press. */
export default async function ReviewAllPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; filter?: string; done?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const books = await loadBooks(id);
  const { supabase, model, due, context } = books;
  const a = `/aircraft/${id}`;
  if (!context.canEdit) redirect(`${a}/logbooks/map`);
  const input = due?.loaded.input;
  const logbooks = input?.logbook ?? [];

  const ids = waitingPageIds(books);
  const [{ data: pageRows }, rows] = await Promise.all([
    ids.length ? supabase.from("page").select(PAGE_COLUMNS).in("id", ids.slice(0, 500)) : Promise.resolve({ data: [] as PageRow[] }),
    entriesOnPages(supabase, id, ids),
  ]);
  const doubted = withDoubt(books, rows.filter((r) => !r.replaced_by_entry_id));
  const pages = ((pageRows ?? []) as PageRow[])
    .map((pg) => {
      const es = doubted.filter((d) => d.row.page_id === pg.id);
      const clean =
        !pg.needs_look && !pg.unread_rotated_content && (pg.detected_page_count ?? 1) <= 1 &&
        pageIsClean(es.map((d) => ({ ...d.row, ad_refs: d.row.ad_refs ?? [], sb_refs: d.row.sb_refs ?? [] }))) &&
        !es.some((d) => !d.row.owner_confirmed && d.fields.some((f) => f.plausibility));
      const doubt =
        pageDoubt(es.map((d) => ({ fields: d.fields, confirmed: d.row.owner_confirmed }))) ??
        (es.some((d) => d.row.is_continuation) ? "Starts with the rest of an entry from the page before" : pg.unread_rotated_content ? "Sideways text that couldn't be read in full" : (pg.detected_page_count ?? 1) > 1 ? "Read as a two-page spread" : "Needs a look");
      return { pg, es, clean, doubt, label: pageLabel(model, logbooks, pg.logbook_id, pg.page_sequence) };
    })
    .sort((x, y) => x.label.type.localeCompare(y.label.type) || (x.pg.page_sequence ?? 0) - (y.pg.page_sequence ?? 0));
  const eyes = pages.filter((p) => !p.clean);
  const clean = pages.filter((p) => p.clean);
  const importedIds = (input?.log_entry ?? []).filter((e) => e.trust === "ai_read" && !e.page_id && !e.replaced_by_entry_id).map((e) => e.id);
  const imported = await entriesByIds(supabase, id, importedIds);
  const beingRead = due?.snap.counts.pagesBeingRead ?? 0;
  const sel = pages.find((p) => p.pg.id === sp.page) ?? eyes[0] ?? clean[0];
  const first = sel?.es[0]?.row;

  const row = (p: (typeof pages)[number], words: string) => (
    <li key={p.pg.id} className={`grid grid-cols-[64px_1fr_auto] items-center gap-4 border-b border-rule py-3 ${sel?.pg.id === p.pg.id ? "-mx-2.5 bg-leaf-2 px-2.5" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- authenticated thumbnail route */}
      <img src={`/api/page/${p.pg.id}/image?thumb=1`} alt="" className="h-[86px] w-16 rounded-[2px] bg-cover-2 object-cover" loading="lazy" />
      <div>
        <Link href={`${a}/logbooks/review?page=${p.pg.id}`} replace scroll={false} className="text-body-strong hover:underline" aria-current={sel?.pg.id === p.pg.id ? "true" : undefined}>
          {p.label.short}
        </Link>
        <p className="text-small text-ink-2">{words}</p>
      </div>
      <Button size="s" href={`${a}/logbooks/review/${p.pg.id}`}>
        Open in the desk
      </Button>
    </li>
  );

  return (
    <Board section="books">
      <BooksHead
        id={id}
        books={books}
        current="review"
        spine={{ context: pages.length ? "pages waiting" : "whole life" }}
      />
      <Leaves split="1.4fr 1fr">
        <Leaf label="Review">
          {pages.length === 0 && imported.length === 0 ? (
            <>
              <h2 className="text-heading">Nothing is waiting for review.</h2>
              <p className="mt-1 text-body text-ink-2">Every entry read so far is confirmed.</p>
              {sp.done && <p role="status" className="mt-2 text-body">{sp.done}</p>}
              <div className="mt-4">
                <Button href={`${a}/logbooks/add`}>Add pages</Button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-lede">
                {clean.length} {clean.length === 1 ? "page" : "pages"} read cleanly. {eyes.length} {eyes.length === 1 ? "needs" : "need"} your eyes.
              </h2>
              <p className="mt-1 text-small text-ink-2">Nothing on them counts toward what is due until you confirm it.</p>
              {beingRead > 0 && (
                <p className="mt-1 text-small text-ink-2">
                  {beingRead} more {beingRead === 1 ? "page is" : "pages are"} being read and will join this list.
                </p>
              )}
              <HungSection title="Need your eyes" count={`${eyes.length}`} first>
                {eyes.length ? <ul>{eyes.map((p) => row(p, p.doubt))}</ul> : <p className="text-body text-ink-2">None. Every page left read cleanly.</p>}
              </HungSection>
              <HungSection title="Read cleanly" count={`${clean.length}`}>
                {clean.length ? (
                  <>
                    <ul>{clean.map((p) => row(p, `Read by AI · ${p.es.length} ${p.es.length === 1 ? "entry" : "entries"}, every field clear`))}</ul>
                    <ConfirmClean versions={Object.fromEntries(clean.flatMap((p) => p.es).filter((e) => !e.row.owner_confirmed).map((e) => [e.row.id, e.row.updated_at]))} aircraftId={id} pages={clean.length} entries={clean.reduce((n, p) => n + p.es.filter((d) => !d.row.owner_confirmed).length, 0)} eyes={eyes.length} />
                  </>
                ) : (
                  <p className="text-body text-ink-2">Nothing clean to confirm in one go. The rest need your eyes.</p>
                )}
              </HungSection>
              {imported.length > 0 && (
                <HungSection title="Imported, no page" count={`${imported.length}`}>
                  <ConfirmImported
                    aircraftId={id}
                    rows={imported.map((e) => ({ id: e.id, base: e.updated_at, date: e.entry_date ? fmtDay(e.entry_date) : "No date", text: [e.description, e.work_performed].filter(Boolean).join(" ") }))}
                  />
                </HungSection>
              )}
            </>
          )}
        </Leaf>
        <SourceMat title={sel?.label.long} meta={sel ? (sel.clean ? "Read by AI · every field clear" : sel.doubt) : undefined}>
          {sel && (
            <>
              <ScanViewer key={sel.pg.id} src={`/api/page/${sel.pg.id}/image`} alt={`${sel.label.long}, scanned page`} lit={entryBox(first)} />
              {first && (
                <p className="font-paper text-paper-small text-on-cover">
                  “{[first.description, first.work_performed].filter(Boolean).join(" ").slice(0, 220)}”
                </p>
              )}
              <div className="flex items-center gap-3">
                <Button variant="on-mat" size="s" href={`${a}/logbooks/review/${sel.pg.id}`}>
                  Open in the desk
                </Button>
                {first && <TrustMark level={first.trust} onMat />}
              </div>
            </>
          )}
        </SourceMat>
      </Leaves>
    </Board>
  );
}

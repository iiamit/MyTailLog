import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Board, HungSection, Leaf, Leaves, SourceMat } from "@/ui/Board";
import { Button } from "@/ui/Button";
import { TrustMark } from "@/ui/Marks";
import { ScanViewer } from "@/ui/ScanViewer";
import { aircraftTail } from "@/lib/v2/landing";
import { entriesByIds, loadBooks, pageLabel } from "@/lib/v2/booksLoad";
import { addDays, entryBox, entryTitle, fmtDay } from "@/lib/v2/books";
import { fmtMeter } from "@/lib/v2/status";
import { BooksHead } from "../../BooksHead";
import { EntryKeys, UnconfirmButton } from "./EntryControls";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Entry · ${await aircraftTail(id)}` };
}

/** W-BOOKS-10 Entry detail: the words as written, meters, trust, what it satisfied, attachments, corrections, the page. */
export default async function EntryPage({
  params,
}: {
  params: Promise<{ id: string; entryId: string }>;
}) {
  const { id, entryId } = await params;
  const books = await loadBooks(id);
  const { supabase, model, due, context } = books;
  const a = `/aircraft/${id}`;
  const [e] = await entriesByIds(supabase, id, [entryId]);
  if (!e) notFound();
  const input = due?.loaded.input;
  const logbooks = input?.logbook ?? [];
  const pageSeq = new Map((input?.page ?? []).map((pg) => [pg.id, pg.page_sequence]));
  const pl = pageLabel(model, logbooks, e.logbook_id, e.page_id ? pageSeq.get(e.page_id) ?? null : null);

  // Walk the line in date order (StopStepper, 02 §4.9): previous and next stop on this book's line.
  const stop = model?.stops.find((s) => s.entryIds.includes(e.id));
  const line = stop ? model!.stops.filter((s) => s.lineId === stop.lineId).sort((x, y) => x.date.localeCompare(y.date)) : [];
  const i = stop ? line.findIndex((s) => s.id === stop.id) : -1;
  const prev = i > 0 ? line[i - 1] : null;
  const next = i >= 0 && i < line.length - 1 ? line[i + 1] : null;
  const byId = new Map((input?.log_entry ?? []).map((x) => [x.id, x]));
  const stopName = (s: NonNullable<typeof prev>) => {
    const x = byId.get(s.entryIds[0]);
    return `${fmtDay(s.date)}, ${s.label ?? (x ? entryTitle(x) : "entry")}`;
  };
  const href = (s: NonNullable<typeof prev>) => `${a}/logbooks/entries/${s.entryIds[0]}`;

  // What it satisfied: completions recorded from this entry.
  const done = (input?.item_completion ?? []).filter((c) => c.log_entry_id === e.id);
  const items = done.map((c) => due?.snap.items.find((it) => it.key === `mx:${c.maintenance_item_id}` || it.key === `ad:${c.ad_compliance_id}`)).filter(Boolean);
  const [{ data: docs }, corrections] = await Promise.all([
    supabase.from("document").select("id, title, file_name, type").eq("log_entry_id", e.id),
    entriesByIds(supabase, id, [e.supersedes_entry_id, e.authored_superseded_by].filter((x): x is string => !!x)),
  ]);
  const authored = !!e.authored_by;
  const signed = e.trust === "signed";
  const title = entryTitle(e);

  return (
    <Board section="books">
      <BooksHead
        id={id}
        books={books}
        current="map"
        actions={
          authored && signed ? (
            <>
              <Button variant="on-board" href={`${a}/entries/${e.id}`}>Print sticker</Button>
              {context.canEdit && <Button variant="on-board" href={`${a}/entries/new?corrects=${e.id}`}>Write a correction</Button>}
            </>
          ) : null
        }
        spine={{
          context: e.entry_date ? fmtDay(e.entry_date) : "No date",
          window: e.entry_date ? { from: addDays(e.entry_date, -31), to: addDays(e.entry_date, 31) } : null,
          linkLabel: "Back to the map",
          href: `${a}/logbooks/map?stop=${e.id}`,
          windowDescription: e.entry_date ? `${fmtDay(e.entry_date)} bracketed` : undefined,
        }}
      />
      <Leaves split="1.6fr 1fr">
        <Leaf label="Entry">
          <EntryKeys prev={prev ? href(prev) : null} next={next ? href(next) : null} />
          <Link href={`${a}/logbooks/map?stop=${e.id}`} className="text-small font-semibold text-board-ink underline decoration-dotted">
            Back to the map
          </Link>
          {stop && (
            <nav aria-label="Stops on this line" className="mt-3 inline-flex flex-wrap overflow-hidden rounded-[var(--radius-m)] border border-rule-2 text-[14px] font-semibold">
              {prev && (
                <Link href={href(prev)} replace className="state-layer inline-flex h-[34px] items-center gap-1.5 border-r border-rule-2 px-3" aria-keyshortcuts="[">
                  <ChevronLeft aria-hidden size={16} /> {stopName(prev)}
                </Link>
              )}
              <span className="inline-flex h-[34px] items-center bg-leaf-2 px-3 font-normal text-ink-3">
                Stop {i + 1} of {line.length}
              </span>
              {next && (
                <Link href={href(next)} replace className="state-layer inline-flex h-[34px] items-center gap-1.5 border-l border-rule-2 px-3" aria-keyshortcuts="]">
                  Next: {stopName(next)} <ChevronRight aria-hidden size={16} />
                </Link>
              )}
            </nav>
          )}
          <h2 className="mt-4 text-heading">{title}</h2>
          <p className="text-small text-ink-2">
            {[e.entry_date ? fmtDay(e.entry_date) : "No date", e.page_id ? `${pl.book} logbook, page ${pageSeq.get(e.page_id) ?? "?"}` : `${pl.book} logbook`, authored ? "written in MyTailLog" : e.page_id ? "read from a scan" : "imported"].join(" · ")}
          </p>
          {e.trust === "ai_read" && (
            <div className="mt-3 rounded-control bg-leaf-2 px-3 py-2.5 text-body">
              Read by AI, not yet confirmed. It doesn’t count toward anything.{" "}
              {context.canEdit && e.page_id && (
                <Link className="font-semibold text-board-ink underline decoration-dotted" href={`${a}/logbooks/review/${e.page_id}?entry=${e.id}`}>
                  Review it
                </Link>
              )}
            </div>
          )}
          <div className="mt-3">
            <HungSection title="Trust" first>
              <ul className="flex flex-wrap gap-x-5 gap-y-1">
                <li><TrustMark level="ai_read" label={authored ? "Written in MyTailLog" : "Read by AI"} /></li>
                <li className={e.trust === "ai_read" ? "opacity-40" : ""}>
                  <TrustMark level="confirmed" label={e.trust === "ai_read" ? "Not yet confirmed by you" : "Confirmed by you"} />
                </li>
                <li className={signed ? "" : "opacity-40"}>
                  <TrustMark level="signed" label={signed ? `Signed by ${e.signature_name ?? "a mechanic"}${e.mechanic_cert_number ? `, ${e.mechanic_cert_number}` : ""}` : "Not signed"} />
                </li>
              </ul>
            </HungSection>
            <HungSection title="In the book">
              {[e.description, e.work_performed, e.parts && `Parts: ${e.parts}`].filter(Boolean).map((t, k) => (
                <p key={k} className="mb-2 font-paper text-paper whitespace-pre-line">{t}</p>
              ))}
              {(e.ad_refs?.length || e.sb_refs?.length) ? (
                <p className="text-small text-ink-2">{[...(e.ad_refs ?? []).map((r) => `AD ${r}`), ...(e.sb_refs ?? []).map((r) => `SB ${r}`)].join(" · ")}</p>
              ) : null}
            </HungSection>
            <HungSection title="Meters">
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-body">
                {([["Tach", e.tach], ["Hobbs", e.hobbs], ["Airframe", e.airframe]] as const).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-ink-2">{k}</dt>
                    <dd className="font-bold">{v != null ? fmtMeter(v) : "Not written"}</dd>
                  </div>
                ))}
              </dl>
            </HungSection>
            <HungSection title="What it satisfied">
              {items.length ? (
                <ul className="space-y-1">
                  {items.map((it) => (
                    <li key={it!.key}>
                      <Link className="font-semibold text-board-ink underline decoration-dotted" href={`${a}/status/item/${encodeURIComponent(it!.key)}`}>
                        {it!.label}
                      </Link>{" "}
                      <span className="text-small text-ink-2">{it!.rule}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-body text-ink-2">Not linked to a tracked item.</p>
              )}
            </HungSection>
            <HungSection title="Attached">
              {docs?.length ? (
                <ul className="space-y-1">
                  {docs.map((d) => (
                    <li key={d.id} className="text-body">
                      {d.title ?? d.file_name} <span className="text-small text-ink-3">· in Documents</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-body text-ink-2">Nothing attached.</p>
              )}
            </HungSection>
            <HungSection title="Corrections">
              {e.authored_superseded_by ? (
                <p className="text-body">
                  Superseded by{" "}
                  <Link className="font-semibold text-board-ink underline decoration-dotted" href={`${a}/logbooks/entries/${e.authored_superseded_by}`}>
                    the correction{corrections.find((c) => c.id === e.authored_superseded_by)?.entry_date ? ` signed ${fmtDay(corrections.find((c) => c.id === e.authored_superseded_by)!.entry_date!)}` : ""}
                  </Link>
                  .
                </p>
              ) : e.supersedes_entry_id ? (
                <p className="text-body">
                  Corrects{" "}
                  <Link className="font-semibold text-board-ink underline decoration-dotted" href={`${a}/logbooks/entries/${e.supersedes_entry_id}`}>
                    an earlier signed entry
                  </Link>
                  .
                </p>
              ) : authored ? (
                <p className="text-body text-ink-2">None. A signed entry stays as written; a correction is a new signed entry that points back here.</p>
              ) : (
                <p className="text-body text-ink-2">None.</p>
              )}
              {!authored && context.canEdit && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {e.page_id && (
                    <Button size="s" href={`${a}/logbooks/review/${e.page_id}?entry=${e.id}`}>
                      Fix the reading
                    </Button>
                  )}
                  {e.owner_confirmed && <UnconfirmButton aircraftId={id} entryId={e.id} />}
                </div>
              )}
            </HungSection>
          </div>
        </Leaf>
        <SourceMat title={e.page_id ? pl.long : undefined} meta={e.page_id ? `${e.entry_date ? fmtDay(e.entry_date) : "No date"} · ${e.trust === "ai_read" ? "read by AI" : e.trust === "signed" ? "signed" : "confirmed by you"}` : undefined}>
          {e.page_id ? (
            <ScanViewer src={`/api/page/${e.page_id}/image`} alt={`${pl.long}, scanned page`} lit={entryBox(e)} />
          ) : (
            <p className="m-auto max-w-[300px] text-center text-[15px] text-on-cover-2">
              No page is linked yet.{" "}
              {authored ? "When the page with this sticker is scanned, it links here by itself." : "Imported without a page."}
            </p>
          )}
        </SourceMat>
      </Leaves>
    </Board>
  );
}

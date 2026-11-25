import { ScannedDocumentReview } from "@/components/review/ScannedDocumentReview";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Board } from "@/ui/Board";
import { aircraftTail } from "@/lib/v2/landing";
import { PAGE_COLUMNS, entriesOnPages, loadBooks, pageLabel, waitingPageIds, withDoubt, type PageRow } from "@/lib/v2/booksLoad";
import { parseReviewReceipt, addDays, fmtDay, fmtMonth } from "@/lib/v2/books";
import { BooksHead } from "../../BooksHead";
import { ReviewDesk } from "./ReviewDesk";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Review desk · ${await aircraftTail(id)}` };
}

/**
 * W-BOOKS-07 Review desk. Editors check one page's entries field by field, least certain first, and move to the
 * next waiting page with Shift+Enter. Viewers get the desk read-only (07 F05 B-VIEWER) rather than a redirect,
 * since the Pages library (W-BOOKS-05) that 04 redirects them to is not built in v2 yet.
 */
export default async function ReviewDeskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; pageId: string }>;
  searchParams: Promise<{ entry?: string; field?: string; undo?: string; from?: string; n?: string }>;
}) {
  const { id, pageId } = await params;
  const sp = await searchParams;
  const books = await loadBooks(id);
  const { supabase, model, due, context } = books;
  const a = `/aircraft/${id}`;
  const { data: pageData } = await supabase.from("page").select(`${PAGE_COLUMNS}, ocr_text, aircraft_id`).eq("id", pageId).maybeSingle();
  const page = pageData as (PageRow & { aircraft_id: string; ocr_text: string | null }) | null;
  if (!page || page.aircraft_id !== id) notFound();

  const input = due?.loaded.input;
  const logbooks = input?.logbook ?? [];
  const label = pageLabel(model, logbooks, page.logbook_id, page.page_sequence);
  const [rows, { data: siblings }, { data: scanned }, { data: stickers }, { data: identityAircraft }, { data: identityComponents }] = await Promise.all([
    entriesOnPages(supabase, id, [pageId]),
    supabase.from("page").select("id, page_sequence, created_at").eq("logbook_id", page.logbook_id).order("page_sequence", { ascending: true, nullsFirst: true }).order("created_at"),
    supabase.from("scanned_document").select("doc_type, document_date, summary, extracted, applied, updated_at").eq("page_id", pageId).maybeSingle(),
    supabase.from("signed_entry_scan").select("entry_id").eq("page_id", pageId),
    supabase.from("aircraft").select("id, updated_at, tail_number, make, model, serial_number").eq("id", id).single(),
    supabase.from("component").select("id, updated_at, name, category, make, model, serial_number, part_number").eq("aircraft_id", id),
  ]);
  const entries = withDoubt(books, rows.filter((r) => !r.replaced_by_entry_id));
  const order = siblings ?? [];
  const pos = order.findIndex((p) => p.id === pageId);
  const prev = pos > 0 ? order[pos - 1].id : null;
  const next = pos >= 0 && pos < order.length - 1 ? order[pos + 1].id : null;
  const waiting = waitingPageIds(books).length;

  const notices: string[] = [];
  if ((page.detected_page_count ?? 1) > 1) notices.push("Read as a two-page spread. Entries from both pages are listed; check that none were missed.");
  if (page.unread_rotated_content) notices.push("There is sideways text on this page, often a sticker, that couldn't be read in full. If an entry is missing, add it.");
  if (scanned) {
    const kind = scanned.doc_type === "weight_balance" ? "weight and balance document" : scanned.doc_type === "ad_report" ? "AD compliance report" : "document";
    notices.push(`Filed as a ${kind}${scanned.document_date ? ` dated ${fmtDay(scanned.document_date)}` : ""}${scanned.summary ? `: ${scanned.summary}` : ""}.`);
  }
  for (const s of stickers ?? []) {
    const e = input?.log_entry?.find((x) => x.id === s.entry_id);
    notices.push(`This page carries a MyTailLog sticker matched to the entry signed${e?.entry_date ? ` on ${fmtDay(e.entry_date)}` : ""}. No duplicate was added.`);
  }

  // The gap this page lands in, if any (the landing note).
  const firstDate = rows.map((r) => r.entry_date).filter((d): d is string => !!d).sort()[0] ?? null;
  const gap = firstDate ? model?.gaps.find((g) => g.lineId === model.lines.find((l) => l.volumes.some((v) => v.id === page.logbook_id))?.lineId && firstDate > g.from && firstDate < g.to) : undefined;
  const landing = gap ? `This page fills ${firstDate!.slice(0, 4)} in the ${label.book.toLowerCase()} gap. Confirmed, that stretch turns solid.` : null;

  const state =
    page.extraction_status === "failed" ? "failed"
    : ["pending", "queued", "processing", "waiting_allowance"].includes(page.extraction_status) ? "reading"
    : "read";

  return (
    <Board section="books">
      <BooksHead
        id={id}
        books={books}
        current="review"
        spine={{
          context: firstDate ? fmtMonth(firstDate) : "No date yet",
          window: firstDate ? { from: addDays(firstDate, -15), to: addDays(firstDate, 15) } : null,
          linkLabel: "See it on the map",
          href: rows[0] && firstDate ? `${a}/logbooks/map?stop=${rows.find((r) => r.entry_date === firstDate)!.id}` : `${a}/logbooks/map`,
        }}
      />
      {scanned && <ScannedDocumentReview pageId={pageId} doc={scanned} canEdit={context.canEdit} />}
      <ReviewDesk
        key={pageId}
        aircraftId={id}
        contentKinds={page.content_kinds ?? []}
        identitySuggestions={page.identity_suggestions ?? []}
        identityTargets={[...(identityAircraft ? [identityAircraft] : []), ...(identityComponents ?? [])]}
        pageId={pageId}
        pageBase={page.updated_at}
        logbookId={page.logbook_id}
        canEdit={context.canEdit}
        ownerName={context.isOwner ? null : "the owner"}
        title={label.long}
        bookName={label.book}
        position={pos >= 0 ? `${label.book}, page ${page.page_sequence ?? pos + 1} (${pos + 1} of ${order.length} in this book)` : label.long}
        meta={`Scanned ${fmtDay(page.created_at.slice(0, 10))}`}
        entries={entries.map(({ row, fields }) => ({
          input: { ...row, ad_refs: row.ad_refs ?? [], sb_refs: row.sb_refs ?? [] },
          fields,
          boxes: row.field_boxes ?? {},
          continuation: row.is_continuation,
        }))}
        books={logbooks.filter((b) => b.type !== "other" || b.id === page.logbook_id).map((b) => ({ id: b.id, label: pageLabel(model, logbooks, b.id, null).book }))}
        prevHref={prev ? `${a}/logbooks/review/${prev}` : null}
        nextHref={next ? `${a}/logbooks/review/${next}` : null}
        backHref={`${a}/logbooks/review`}
        waiting={waiting}
        notices={notices}
        landing={landing}
        readState={state}
        readError={page.extraction_error}
        ocrText={page.ocr_text}
        initial={{ entry: sp.entry ?? null, field: sp.field ?? null }}
        undo={parseReviewReceipt(sp.undo)}
      />
    </Board>
  );
}

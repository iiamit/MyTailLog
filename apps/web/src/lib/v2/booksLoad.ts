import type { IdentitySuggestion } from "@/lib/extraction/pageDetails";
import { cache } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAircraftShellContext } from "@/lib/aircraftContext";
import { dueSnapshot } from "@/lib/due/load";
import { buildMapModel, type MapModel } from "@/lib/mapModel";
import type { LogEntry } from "@/lib/database.types";
import { deskFields } from "@/lib/v2/books";

// Server loaders for the Logbooks screens. One due-engine run per request (dueSnapshot is cached), and the
// MapModel is derived from the same rows the rail and Status use, so counts agree across the binder.

export type BooksContext = Awaited<ReturnType<typeof loadBooks>>;

export const loadBooks = cache(async (id: string) => {
  const supabase = await createClient();
  const [context, { data: auth }, { data: pendingDocuments, error: pendingError }, { data: referencePages, error: referenceError }] = await Promise.all([
    getAircraftShellContext(supabase, id), supabase.auth.getUser(),
    supabase.from("scanned_document").select("page_id").eq("aircraft_id", id).eq("applied", false).in("doc_type", ["ad_report", "weight_balance"]),
    supabase.from("page").select("id").eq("aircraft_id", id).eq("extraction_status", "extracted").eq("review_status", "unreviewed").not("content_kinds", "eq", "{}"),
  ]);
  if (pendingError || referenceError) throw new Error(pendingError?.message ?? referenceError!.message);
  if (!context || !auth.user) notFound();
  const due = await dueSnapshot(id, auth.user.id).catch(() => undefined);
  if (due === null) notFound();
  const model: MapModel | null = due ? buildMapModel(due.loaded.input, due.loaded.today) : null;
  return { supabase, context, userId: auth.user.id, due: due ?? null, model, pendingDocumentIds: (pendingDocuments ?? []).map((d) => d.page_id), referencePageIds: (referencePages ?? []).map((p) => p.id) };
});

export type EntryRow = Pick<
  LogEntry,
  | "id" | "page_id" | "logbook_id" | "entry_date" | "tach" | "hobbs" | "airframe" | "description" | "work_performed" | "parts"
  | "signature_name" | "mechanic_cert_number" | "ad_refs" | "sb_refs" | "confidence" | "field_confidence" | "field_boxes"
  | "owner_confirmed" | "trust" | "entry_index" | "is_continuation" | "continues_next" | "entry_kind" | "authored_by"
  | "authored_signed_at" | "supersedes_entry_id" | "authored_superseded_by" | "replaced_by_entry_id" | "updated_at" | "created_at"
>;
export const ENTRY_COLUMNS =
  "id, page_id, logbook_id, entry_date, tach, hobbs, airframe, description, work_performed, parts, signature_name, mechanic_cert_number, ad_refs, sb_refs, confidence, field_confidence, field_boxes, owner_confirmed, trust, entry_index, is_continuation, continues_next, entry_kind, authored_by, authored_signed_at, supersedes_entry_id, authored_superseded_by, replaced_by_entry_id, updated_at, created_at";

type Db = Awaited<ReturnType<typeof createClient>>;

export async function entriesByIds(supabase: Db, aircraftId: string, ids: string[]): Promise<EntryRow[]> {
  if (!ids.length) return [];
  const { data } = await supabase.from("log_entry").select(ENTRY_COLUMNS).eq("aircraft_id", aircraftId).in("id", ids.slice(0, 500));
  return (data ?? []) as EntryRow[];
}

export async function entriesOnPages(supabase: Db, aircraftId: string, pageIds: string[]): Promise<EntryRow[]> {
  if (!pageIds.length) return [];
  const { data } = await supabase
    .from("log_entry")
    .select(ENTRY_COLUMNS)
    .eq("aircraft_id", aircraftId)
    .in("page_id", pageIds.slice(0, 500))
    .order("entry_index", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  return (data ?? []) as EntryRow[];
}

/** Every entry's searchable text (W-BOOKS-12 search covers every text field), paged past the 1,000-row cap. */
export async function entryTexts(supabase: Db, aircraftId: string) {
  const out: { id: string; description: string | null; work_performed: string | null; parts: string | null; signature_name: string | null; mechanic_cert_number: string | null; ad_refs: string[] | null; sb_refs: string[] | null }[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase
      .from("log_entry")
      .select("id, description, work_performed, parts, signature_name, mechanic_cert_number, ad_refs, sb_refs")
      .eq("aircraft_id", aircraftId)
      .order("id")
      .range(start, start + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

export type PageRow = {
  content_kinds?: string[]; identity_suggestions?: IdentitySuggestion[];
  id: string; logbook_id: string; page_sequence: number | null; created_at: string; review_status: string; extraction_status: string;
  extraction_error: string | null; needs_look: boolean | null; unread_rotated_content: boolean; detected_page_count: number | null; ocr_text?: string | null; updated_at: string;
};
export const PAGE_COLUMNS = "content_kinds, identity_suggestions, id, logbook_id, page_sequence, created_at, review_status, extraction_status, extraction_error, needs_look, unread_rotated_content, detected_page_count, updated_at";

// --- Review (W-BOOKS-07, W-BOOKS-08) ---------------------------------------------------------------------------

/** Pages that hold entries read by AI and not yet confirmed (the engine's pagesToReview set). */
export function waitingPageIds(books: BooksContext): string[] {
  const es = books.due?.loaded.input.log_entry ?? [];
  return [...new Set([...es.filter((e) => e.trust === "ai_read" && !e.replaced_by_entry_id && e.page_id).map((e) => e.page_id!), ...(books.pendingDocumentIds ?? []), ...(books.referencePageIds ?? [])])];
}

/** Each entry with its fields ordered by doubt (09 §3.9.2), checked against the same book and the same page. */
export function withDoubt(books: BooksContext, rows: EntryRow[]) {
  const input = books.due?.loaded.input;
  const pageSeq = new Map((input?.page ?? []).map((pg) => [pg.id, pg.page_sequence]));
  const all = input?.log_entry ?? [];
  const n = (x: { id: string; entry_date: string | null; tach?: number | null; hobbs?: number | null; page_id?: string | null }) => ({
    id: x.id, entry_date: x.entry_date, tach: x.tach ?? null, hobbs: x.hobbs ?? null, page: x.page_id ? pageSeq.get(x.page_id) ?? null : null,
  });
  const year = (input?.aircraft as { year?: number | null } | undefined)?.year ?? null;
  return rows.map((row) => ({
    row,
    fields: deskFields(
      { ...row, ad_refs: row.ad_refs ?? [], sb_refs: row.sb_refs ?? [] },
      {
        samePage: rows.filter((r) => r.page_id === row.page_id).map(n),
        sameBook: all.filter((x) => x.logbook_id === row.logbook_id && !x.replaced_by_entry_id && !x.is_continuation).map(n),
        today: books.due?.loaded.today ?? new Date().toISOString().slice(0, 10),
        aircraftYear: year,
      },
    ),
  }));
}

/** Book name and page label for a page: "Airframe p. 41". */
export function pageLabel(model: MapModel | null, logbooks: { id: string; type: string; title?: string | null }[], logbookId: string, sequence: number | null) {
  const book = logbooks.find((b) => b.id === logbookId);
  const NAME: Record<string, string> = { airframe: "Airframe", engine: "Engine", prop: "Propeller", avionics: "Avionics", other: "Other" };
  const name = (book && (model?.lines.find((l) => l.volumes.some((v) => v.id === book.id))?.name ?? NAME[book.type])) ?? "Logbook";
  return { book: name, type: book?.type ?? "other", short: sequence != null ? `${name} p. ${sequence}` : name, long: sequence != null ? `${name} logbook, page ${sequence}` : `${name} logbook` };
}

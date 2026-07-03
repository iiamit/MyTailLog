import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LOGBOOK_LABEL } from "@/lib/logbooks";
import { getAircraftRole, canEditRole } from "@/lib/access";
import { ReviewClient, type ReviewEntry } from "./ReviewClient";
import { ReextractButton } from "./ReextractButton";

const BUCKET = process.env.LOGBOOK_STORAGE_BUCKET || "logbook-pages";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string; pageId: string }>;
}) {
  const { id, pageId } = await params;
  const supabase = await createClient();

  // RLS scopes both queries to the owner.
  const { data: page } = await supabase
    .from("page")
    .select(
      "id, aircraft_id, logbook_id, page_sequence, storage_path, ocr_text, review_status, extraction_status, detected_page_count",
    )
    .eq("id", pageId)
    .single();

  if (!page || page.aircraft_id !== id) notFound();

  // Role gates the re-extract control (RLS is the real guard).
  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("owner_id")
    .eq("id", id)
    .single();
  const role = aircraft ? await getAircraftRole(supabase, id, aircraft.owner_id) : "viewer";
  const canEdit = canEditRole(role);
  const extractionConfigured = Boolean(process.env.ANTHROPIC_API_KEY);

  const { data: logbook } = await supabase
    .from("logbook")
    .select("type, title")
    .eq("id", page.logbook_id)
    .single();

  const { data: entries } = await supabase
    .from("log_entry")
    .select("*")
    .eq("page_id", pageId)
    .order("entry_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  // Pages in the 'other' logbook are classified A&P documents, not log entries —
  // surface what the classifier read and what it updated.
  const { data: scanned } = await supabase
    .from("scanned_document")
    .select("doc_type, document_date, summary")
    .eq("page_id", pageId)
    .maybeSingle();
  const SCANNED_LABEL: Record<string, string> = {
    weight_balance: "Weight & Balance document",
    ad_report: "AD compliance report",
    other: "Unrecognized document",
  };

  // Private bucket: hand the browser a short-lived signed URL for the image.
  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(page.storage_path, 3600);

  // Prev/next page within the same logbook, ordered by capture sequence — so a
  // reviewer (especially handling a split entry) can page back and forth. Pages
  // without a sequence fall back to creation order.
  const { data: siblings } = await supabase
    .from("page")
    .select("id, page_sequence, created_at")
    .eq("logbook_id", page.logbook_id)
    .order("page_sequence", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true });
  const ordered = siblings ?? [];
  const pos = ordered.findIndex((p) => p.id === pageId);
  const prevPageId = pos > 0 ? ordered[pos - 1].id : null;
  const nextPageId = pos >= 0 && pos < ordered.length - 1 ? ordered[pos + 1].id : null;
  const pagePosition = pos >= 0 ? `${pos + 1} of ${ordered.length}` : null;

  const reviewEntries: ReviewEntry[] = (entries ?? []).map((e) => ({
    id: e.id,
    entry_date: e.entry_date,
    hobbs: e.hobbs,
    tach: e.tach,
    description: e.description,
    work_performed: e.work_performed,
    parts: e.parts,
    signature_name: e.signature_name,
    mechanic_cert_number: e.mechanic_cert_number,
    ad_refs: e.ad_refs ?? [],
    sb_refs: e.sb_refs ?? [],
    confidence: e.confidence,
    field_confidence: e.field_confidence,
    owner_confirmed: e.owner_confirmed,
    is_continuation: e.is_continuation,
  }));

  const logbookLabel = logbook
    ? logbook.title ?? LOGBOOK_LABEL[logbook.type] ?? logbook.type
    : "Logbook";

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link
        href={`/aircraft/${id}`}
        className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        ← Back to aircraft
      </Link>

      <header className="mt-2 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">
            Review {logbookLabel}
            {page.page_sequence != null ? ` · page #${page.page_sequence}` : ""}
          </h1>
          <nav className="flex flex-wrap items-center gap-2 text-sm">
            {canEdit && extractionConfigured && <ReextractButton pageId={pageId} />}
            {prevPageId ? (
              <Link
                href={`/aircraft/${id}/pages/${prevPageId}/review`}
                className="rounded-md border border-slate-300 px-3 py-1.5 hover:border-slate-500 dark:border-slate-700"
              >
                ← Previous
              </Link>
            ) : (
              <span className="rounded-md border border-slate-200 px-3 py-1.5 text-slate-300 dark:border-slate-800 dark:text-slate-600">
                ← Previous
              </span>
            )}
            {pagePosition && (
              <span className="text-xs text-slate-500 dark:text-slate-400">{pagePosition}</span>
            )}
            {nextPageId ? (
              <Link
                href={`/aircraft/${id}/pages/${nextPageId}/review`}
                className="rounded-md border border-slate-300 px-3 py-1.5 hover:border-slate-500 dark:border-slate-700"
              >
                Next →
              </Link>
            ) : (
              <span className="rounded-md border border-slate-200 px-3 py-1.5 text-slate-300 dark:border-slate-800 dark:text-slate-600">
                Next →
              </span>
            )}
          </nav>
        </div>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Confirm or correct what the extractor read. Nothing here is a legal
          record — it&apos;s an index of your physical logbooks.
        </p>
      </header>

      {scanned && (
        <div className="mb-6 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm dark:border-emerald-800 dark:bg-emerald-900/20">
          <span className="font-medium">
            Classified as {SCANNED_LABEL[scanned.doc_type] ?? scanned.doc_type}
            {scanned.document_date ? ` · ${scanned.document_date}` : ""}
          </span>
          {scanned.summary && (
            <span className="text-slate-600 dark:text-slate-300"> — {scanned.summary}.</span>
          )}{" "}
          {scanned.doc_type === "weight_balance" && (
            <Link href={`/aircraft/${id}/weight-balance`} className="underline">
              View weight &amp; balance
            </Link>
          )}
          {scanned.doc_type === "ad_report" && (
            <Link href={`/aircraft/${id}/compliance`} className="underline">
              View AD compliance
            </Link>
          )}
        </div>
      )}

      <ReviewClient
        aircraftId={id}
        pageId={pageId}
        logbookId={page.logbook_id}
        imageUrl={signed?.signedUrl ?? null}
        rawText={page.ocr_text}
        reviewStatus={page.review_status}
        extractionStatus={page.extraction_status}
        detectedPageCount={page.detected_page_count}
        entries={reviewEntries}
      />
    </main>
  );
}

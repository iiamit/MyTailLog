import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReviewClient, type ReviewEntry } from "./ReviewClient";

const LOGBOOK_LABEL: Record<string, string> = {
  airframe: "Airframe",
  engine: "Engine",
  prop: "Propeller",
};

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

  // Private bucket: hand the browser a short-lived signed URL for the image.
  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(page.storage_path, 3600);

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
        <h1 className="text-2xl font-bold">
          Review {logbookLabel}
          {page.page_sequence != null ? ` · page #${page.page_sequence}` : ""}
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Confirm or correct what the extractor read. Nothing here is a legal
          record — it&apos;s an index of your physical logbooks.
        </p>
      </header>

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

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Disclaimer } from "@/components/Disclaimer";
import { PagesPanel, type PageRow } from "./PagesPanel";

const LOGBOOK_LABEL: Record<string, string> = {
  airframe: "Airframe",
  engine: "Engine",
  prop: "Propeller",
};

export default async function AircraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // RLS restricts this to the owner; a non-owner id simply returns no row.
  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("*")
    .eq("id", id)
    .single();

  if (!aircraft) notFound();

  const { data: logbooks } = await supabase
    .from("logbook")
    .select("id, type, component_ref, title")
    .eq("aircraft_id", id);

  const labelFor = (logbookId: string) => {
    const lb = logbooks?.find((l) => l.id === logbookId);
    return lb ? lb.title ?? LOGBOOK_LABEL[lb.type] ?? lb.type : "Logbook";
  };

  const { data: pages } = await supabase
    .from("page")
    .select(
      "id, logbook_id, page_sequence, review_status, extraction_status, detected_page_count, extraction_error",
    )
    .eq("aircraft_id", id)
    .order("logbook_id", { ascending: true })
    .order("page_sequence", { ascending: true, nullsFirst: false });

  // Per-page extracted-entry counts.
  const { data: entries } = await supabase
    .from("log_entry")
    .select("page_id")
    .eq("aircraft_id", id);

  const entryCounts = new Map<string, number>();
  for (const e of entries ?? []) {
    if (e.page_id) entryCounts.set(e.page_id, (entryCounts.get(e.page_id) ?? 0) + 1);
  }

  // Per-logbook captured-page counts, for the logbook cards below.
  const pageCounts = new Map<string, number>();
  for (const p of pages ?? []) {
    pageCounts.set(p.logbook_id, (pageCounts.get(p.logbook_id) ?? 0) + 1);
  }

  const pageRows: PageRow[] = (pages ?? []).map((p) => ({
    id: p.id,
    logbookLabel: labelFor(p.logbook_id),
    pageSequence: p.page_sequence,
    reviewStatus: p.review_status,
    extractionStatus: p.extraction_status,
    detectedPageCount: p.detected_page_count,
    extractionError: p.extraction_error,
    entryCount: entryCounts.get(p.id) ?? 0,
  }));

  const extractionConfigured = Boolean(process.env.ANTHROPIC_API_KEY);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href="/dashboard"
        className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        ← All aircraft
      </Link>

      <header className="mt-2 mb-6">
        <h1 className="text-3xl font-bold">{aircraft.tail_number}</h1>
        <p className="text-slate-600 dark:text-slate-300">
          {[aircraft.year, aircraft.make, aircraft.model]
            .filter(Boolean)
            .join(" ") || "Details not set"}
          {aircraft.serial_number ? ` · S/N ${aircraft.serial_number}` : ""}
        </p>
      </header>

      <div className="mb-8">
        <Disclaimer />
      </div>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Logbooks</h2>
          <div className="flex gap-2">
            <Link
              href={`/aircraft/${id}/upload`}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:border-slate-500 dark:border-slate-700"
            >
              Upload scans
            </Link>
            <Link
              href={`/aircraft/${id}/capture`}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
            >
              Capture pages
            </Link>
          </div>
        </div>
        <ul className="grid gap-3 sm:grid-cols-3">
          {logbooks?.map((lb) => {
            const count = pageCounts.get(lb.id) ?? 0;
            return (
              <li
                key={lb.id}
                className="rounded-lg border border-slate-200 bg-white px-4 py-5 text-center dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="font-medium">
                  {lb.title ?? LOGBOOK_LABEL[lb.type] ?? lb.type}
                </div>
                {lb.component_ref && (
                  <div className="text-xs text-slate-500">{lb.component_ref}</div>
                )}
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {count} page{count === 1 ? "" : "s"}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <PagesPanel pages={pageRows} extractionConfigured={extractionConfigured} />
        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          Extraction reads each page with a vision model and saves entries with
          per-field confidence. Nothing is auto-confirmed — a review step (coming
          next) confirms entries before they drive any maintenance reminder.
        </p>
      </section>
    </main>
  );
}

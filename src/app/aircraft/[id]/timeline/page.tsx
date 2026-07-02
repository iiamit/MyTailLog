import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logbookLabel } from "@/lib/logbooks";
import {
  TimelineClient,
  type TimelineEntry,
  type LogbookMeta,
} from "./TimelineClient";

export default async function TimelinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("id, tail_number")
    .eq("id", id)
    .single();
  if (!aircraft) notFound();

  const { data: logbooks } = await supabase
    .from("logbook")
    .select("id, type, title")
    .eq("aircraft_id", id);

  const logbookMap: Record<string, LogbookMeta> = {};
  for (const lb of logbooks ?? []) {
    logbookMap[lb.id] = { label: logbookLabel(lb.type, lb.title), type: lb.type };
  }

  // The unified cross-logbook timeline: all entries merged and ordered by date.
  const { data: entries } = await supabase
    .from("log_entry")
    .select(
      "id, page_id, logbook_id, entry_date, hobbs, tach, description, work_performed, parts, ad_refs, sb_refs, confidence, owner_confirmed",
    )
    .eq("aircraft_id", id)
    .order("entry_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  const timeline: TimelineEntry[] = (entries ?? []).map((e) => ({
    id: e.id,
    pageId: e.page_id,
    logbookId: e.logbook_id,
    logbookLabel: logbookMap[e.logbook_id]?.label ?? "Logbook",
    logbookType: logbookMap[e.logbook_id]?.type ?? "",
    entryDate: e.entry_date,
    hobbs: e.hobbs,
    tach: e.tach,
    description: e.description,
    workPerformed: e.work_performed,
    parts: e.parts,
    adRefs: e.ad_refs ?? [],
    sbRefs: e.sb_refs ?? [],
    confidence: e.confidence,
    ownerConfirmed: e.owner_confirmed,
  }));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href={`/aircraft/${id}`}
        className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        ← {aircraft.tail_number}
      </Link>

      <header className="mt-2 mb-6">
        <h1 className="text-2xl font-bold">Logbook timeline</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Every extracted entry across airframe, engine, prop, and avionics —
          merged by date and searchable.
        </p>
      </header>

      <TimelineClient aircraftId={id} entries={timeline} logbookMap={logbookMap} />
    </main>
  );
}

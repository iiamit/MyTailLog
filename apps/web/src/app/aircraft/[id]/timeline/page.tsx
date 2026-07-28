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

  // Signed thumbnail URL per page (private bucket), keyed by page id so both the
  // rendered timeline and live search results can show the page image.
  const { data: pages } = await supabase
    .from("page")
    .select("id, storage_path, thumbnail_path")
    .eq("aircraft_id", id);

  // Stable, browser-cacheable image URLs (see /api/page/[pageId]/image).
  const thumbnailByPageId: Record<string, string> = {};
  const fullByPageId: Record<string, string> = {};
  for (const p of pages ?? []) {
    fullByPageId[p.id] = `/api/page/${p.id}/image`;
    thumbnailByPageId[p.id] = `/api/page/${p.id}/image?thumb=1`;
  }
  // Thumbnail for the list; fall back to the original when no thumbnail exists.
  const listThumbByPageId: Record<string, string> = { ...fullByPageId, ...thumbnailByPageId };

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
    thumbnailUrl: e.page_id ? listThumbByPageId[e.page_id] ?? null : null,
    fullUrl: e.page_id ? fullByPageId[e.page_id] ?? null : null,
  }));

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">Logbook</div>
          <h1 className="font-display text-[27px] font-semibold leading-none">
            Logbook timeline
          </h1>
          <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-dim">
            Every extracted entry across airframe, engine, prop, and avionics —
            merged by date and searchable.
          </p>
        </div>
      </header>

      <TimelineClient
        aircraftId={id}
        entries={timeline}
        logbookMap={logbookMap}
        thumbnailByPageId={listThumbByPageId}
        fullByPageId={fullByPageId}
      />
    </main>
  );
}

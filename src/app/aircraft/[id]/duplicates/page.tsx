import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LOGBOOK_LABEL } from "@/lib/logbooks";
import { getAircraftRole, canEditRole } from "@/lib/access";
import {
  findEntryDuplicates,
  findPageDuplicates,
  filterEntryClusters,
  type DupEntry,
  type DupPage,
} from "@/lib/duplicates";
import { getHoursAnomalies } from "@/lib/aircraftHours";
import { DuplicatesClient, type AnomalyRow, type EntryRow, type PageRow } from "./DuplicatesClient";


// Find likely-duplicate pages and entries (from re-uploads / re-extracts) and
// let the owner delete the redundant copies. Detection is O(n^2) per logbook,
// so it runs only here — never on every page load.
export default async function DuplicatesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("id, owner_id, tail_number, enrollment_hobbs, enrollment_tach")
    .eq("id", id)
    .single();
  if (!aircraft) notFound();

  const role = await getAircraftRole(supabase, id, aircraft.owner_id);
  if (!canEditRole(role)) redirect(`/aircraft/${id}`); // resolution deletes rows

  const { data: logbooks } = await supabase
    .from("logbook")
    .select("id, type, title")
    .eq("aircraft_id", id);
  const labelFor = (lid: string) => {
    const lb = logbooks?.find((l) => l.id === lid);
    return lb ? lb.title ?? LOGBOOK_LABEL[lb.type] ?? lb.type : "Logbook";
  };

  const { data: entryRows } = await supabase
    .from("log_entry")
    .select("id, page_id, logbook_id, entry_date, tach, hobbs, description, work_performed, owner_confirmed, created_at")
    .eq("aircraft_id", id);
  const { data: pageRows } = await supabase
    .from("page")
    .select("id, logbook_id, page_sequence, ocr_text, storage_path, thumbnail_path, created_at")
    .eq("aircraft_id", id);

  const entries: DupEntry[] = (entryRows ?? []).map((e) => ({
    id: e.id,
    page_id: e.page_id,
    logbook_id: e.logbook_id,
    entry_date: e.entry_date,
    tach: e.tach,
    hobbs: e.hobbs,
    text: `${e.description ?? ""} ${e.work_performed ?? ""}`.trim(),
    owner_confirmed: e.owner_confirmed,
    created_at: e.created_at,
  }));

  const entryIdsByPage = new Map<string, string[]>();
  for (const e of entries) {
    if (e.page_id) (entryIdsByPage.get(e.page_id) ?? entryIdsByPage.set(e.page_id, []).get(e.page_id)!).push(e.id);
  }
  const dupPages: DupPage[] = (pageRows ?? []).map((p) => ({
    id: p.id,
    logbook_id: p.logbook_id,
    ocr_text: p.ocr_text,
    created_at: p.created_at,
    entryIds: entryIdsByPage.get(p.id) ?? [],
  }));

  const entryClustersRaw = findEntryDuplicates(entries);
  const pageClusters = findPageDuplicates(dupPages, entryClustersRaw);
  const pageOfEntry = new Map(entries.map((e) => [e.id, e.page_id]));
  const entryClusters = filterEntryClusters(entryClustersRaw, pageClusters, pageOfEntry);

  // Sign thumbnails for the pages we're about to show (dup pages + the pages the
  // shown entries live on), preferring the small thumbnail.
  const shownPageIds = new Set<string>();
  pageClusters.forEach((c) => c.ids.forEach((pid) => shownPageIds.add(pid)));
  entryClusters.forEach((c) => c.ids.forEach((eid) => {
    const pid = pageOfEntry.get(eid);
    if (pid) shownPageIds.add(pid);
  }));
  // Stable, browser-cacheable thumbnail URLs (see /api/page/[pageId]/image).
  const thumbByPage = new Map<string, string>();
  for (const p of pageRows ?? []) {
    if (shownPageIds.has(p.id)) thumbByPage.set(p.id, `/api/page/${p.id}/image?thumb=1`);
  }

  const pageMeta = new Map(
    (pageRows ?? []).map((p) => [
      p.id,
      { label: labelFor(p.logbook_id), sequence: p.page_sequence, thumb: thumbByPage.get(p.id) ?? null },
    ]),
  );
  const entryById = new Map(entries.map((e) => [e.id, e]));

  // Shape the clusters for the client (only what it renders).
  const pageClusterRows: PageRow[][] = pageClusters.map((c) =>
    c.ids.map((pid) => {
      const m = pageMeta.get(pid);
      return {
        id: pid,
        keep: pid === c.keepId,
        label: m?.label ?? "Logbook",
        sequence: m?.sequence ?? null,
        thumb: m?.thumb ?? null,
        entryCount: entryIdsByPage.get(pid)?.length ?? 0,
      };
    }),
  );
  const entryClusterRows: EntryRow[][] = entryClusters.map((c) =>
    c.ids.map((eid) => {
      const e = entryById.get(eid)!;
      const m = e.page_id ? pageMeta.get(e.page_id) : undefined;
      return {
        id: eid,
        pageId: e.page_id,
        keep: eid === c.keepId,
        confirmed: e.owner_confirmed,
        date: e.entry_date,
        tach: e.tach,
        hobbs: e.hobbs,
        text: e.text,
        pageLabel: m?.label ?? null,
        pageSequence: m?.sequence ?? null,
        thumb: m?.thumb ?? null,
      };
    }),
  );

  // Likely mis-keyed hobbs/tach readings (dropped/extra digit, fat-finger).
  const anomalyRows: AnomalyRow[] = (
    await getHoursAnomalies(supabase, id, {
      hobbs: aircraft.enrollment_hobbs,
      tach: aircraft.enrollment_tach,
    })
  )
    .filter((a): a is typeof a & { source: "entry" | "mfb" } => a.source === "entry" || a.source === "mfb")
    .map((a) => ({
      readingId: a.readingId,
      source: a.source,
      field: a.field,
      value: a.value,
      suggested: a.suggested,
      reason: a.reason,
      date: a.date,
      pageId: a.source === "entry" ? entryById.get(a.readingId)?.page_id ?? null : null,
    }));

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <div className="eyebrow mb-2">Add records</div>
        <h1 className="font-display text-[27px] font-semibold leading-none">Duplicates &amp; fixes</h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-dim">
          Duplicate scans and entries from re-uploads, plus hobbs/tach readings
          that look mis-keyed (a dropped or extra digit). All heuristic matches —
          review each before acting. Deleting a page removes its entries too; one
          copy in each duplicate group is suggested to keep.
        </p>
      </header>

      <DuplicatesClient
        aircraftId={id}
        pageClusters={pageClusterRows}
        entryClusters={entryClusterRows}
        anomalies={anomalyRows}
      />
    </main>
  );
}

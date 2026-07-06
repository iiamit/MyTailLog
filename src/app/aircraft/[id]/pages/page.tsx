import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LOGBOOK_LABEL } from "@/lib/logbooks";
import { getAircraftRole, canEditRole } from "@/lib/access";
import { CameraIcon, UploadIcon } from "@/components/icons";
import { PagesPanel, type PageRow, type LogbookTile } from "../PagesPanel";

const BUCKET = process.env.LOGBOOK_STORAGE_BUCKET || "logbook-pages";

// The "Logbooks & pages" browser — every captured scan grouped by logbook, with
// extraction status and a link into each page's review. Lives on its own rail
// destination (the redesigned overview only shows a capture summary card).
export default async function LogbookPagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("id, owner_id, tail_number")
    .eq("id", id)
    .single();
  if (!aircraft) notFound();

  const role = await getAircraftRole(supabase, id, aircraft.owner_id);
  const canEdit = canEditRole(role);

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
      "id, logbook_id, page_sequence, review_status, extraction_status, detected_page_count, extraction_error, storage_path, thumbnail_path",
    )
    .eq("aircraft_id", id)
    .order("logbook_id", { ascending: true })
    .order("page_sequence", { ascending: true, nullsFirst: false });

  // Short-lived signed URLs for thumbnails (private bucket): prefer the small
  // thumbnail, fall back to the original; sign the original too for the lightbox.
  const thumbById = new Map<string, string>();
  const fullById = new Map<string, string>();
  const pathMeta = new Map<string, { id: string; kind: "thumb" | "full" }>();
  for (const p of pages ?? []) {
    pathMeta.set(p.storage_path, { id: p.id, kind: "full" });
    if (p.thumbnail_path) pathMeta.set(p.thumbnail_path, { id: p.id, kind: "thumb" });
  }
  const paths = [...pathMeta.keys()];
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
    for (const s of signed ?? []) {
      const meta = s.path ? pathMeta.get(s.path) : undefined;
      if (meta && s.signedUrl) {
        (meta.kind === "thumb" ? thumbById : fullById).set(meta.id, s.signedUrl);
      }
    }
  }

  const { data: entries } = await supabase
    .from("log_entry")
    .select("page_id, entry_date, hobbs, tach, owner_confirmed")
    .eq("aircraft_id", id);
  const entryCounts = new Map<string, number>();
  // A page "needs review" when it still has an unconfirmed entry — NOT merely
  // when review_status is 'unreviewed'. Entry-less extracted pages (covers,
  // classified docs) and pages whose entries are all confirmed have nothing to
  // review, so counting them nagged forever with no way to clear them.
  const unconfirmedByPage = new Map<string, number>();
  // Per page: the latest entry date and the tach/hobbs at that date, so a long
  // list of pages can be scanned by when they cover (dates/hours often aren't on
  // the scan itself, only in the extracted entries).
  const pageContext = new Map<
    string,
    { date: string | null; tach: number | null; hobbs: number | null }
  >();
  for (const e of entries ?? []) {
    if (!e.page_id) continue;
    entryCounts.set(e.page_id, (entryCounts.get(e.page_id) ?? 0) + 1);
    if (!e.owner_confirmed) {
      unconfirmedByPage.set(e.page_id, (unconfirmedByPage.get(e.page_id) ?? 0) + 1);
    }
    const cur = pageContext.get(e.page_id);
    // Prefer the newest-dated entry; undated entries only fill blanks.
    const newer = !cur || (e.entry_date && (!cur.date || e.entry_date > cur.date));
    if (newer) {
      pageContext.set(e.page_id, {
        date: e.entry_date ?? cur?.date ?? null,
        tach: e.tach ?? cur?.tach ?? null,
        hobbs: e.hobbs ?? cur?.hobbs ?? null,
      });
    } else if (cur) {
      // Keep the latest date, but backfill tach/hobbs if the newest entry lacked them.
      pageContext.set(e.page_id, {
        date: cur.date,
        tach: cur.tach ?? e.tach ?? null,
        hobbs: cur.hobbs ?? e.hobbs ?? null,
      });
    }
  }
  const pageCounts = new Map<string, number>();
  for (const p of pages ?? []) pageCounts.set(p.logbook_id, (pageCounts.get(p.logbook_id) ?? 0) + 1);

  const pageRows: PageRow[] = (pages ?? []).map((p) => ({
    id: p.id,
    logbookId: p.logbook_id,
    logbookLabel: labelFor(p.logbook_id),
    pageSequence: p.page_sequence,
    reviewStatus: p.review_status,
    extractionStatus: p.extraction_status,
    detectedPageCount: p.detected_page_count,
    extractionError: p.extraction_error,
    entryCount: entryCounts.get(p.id) ?? 0,
    unconfirmedCount: unconfirmedByPage.get(p.id) ?? 0,
    latestDate: pageContext.get(p.id)?.date ?? null,
    tach: pageContext.get(p.id)?.tach ?? null,
    hobbs: pageContext.get(p.id)?.hobbs ?? null,
    thumbnailUrl: thumbById.get(p.id) ?? fullById.get(p.id) ?? null,
    fullUrl: fullById.get(p.id) ?? null,
    storagePath: p.storage_path,
    needsThumbnail: !p.thumbnail_path,
  }));
  const logbookTiles: LogbookTile[] = (logbooks ?? []).map((lb) => ({
    id: lb.id,
    label: lb.title ?? LOGBOOK_LABEL[lb.type] ?? lb.type,
    componentRef: lb.component_ref,
    pageCount: pageCounts.get(lb.id) ?? 0,
  }));

  const extractionConfigured = Boolean(process.env.ANTHROPIC_API_KEY);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">Capture</div>
          <h1 className="font-display text-[27px] font-semibold leading-none">Logbooks &amp; pages</h1>
          <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-dim">
            Every captured scan, grouped by logbook. Click a logbook to filter; click a page to
            open its review, or a thumbnail to magnify it.
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Link
              href={`/aircraft/${id}/upload`}
              className="inline-flex items-center gap-1.5 rounded-md border border-line2 bg-panel2 px-4 py-2 text-sm font-medium text-ink hover:border-accent"
            >
              <UploadIcon />
              Upload scans
            </Link>
            <Link
              href={`/aircraft/${id}/capture`}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90"
            >
              <CameraIcon />
              Capture pages
            </Link>
          </div>
        )}
      </header>

      <PagesPanel
        aircraftId={id}
        logbooks={logbookTiles}
        pages={pageRows}
        extractionConfigured={extractionConfigured && canEdit}
        canEdit={canEdit}
      />
    </main>
  );
}

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LOGBOOK_LABEL } from "@/lib/logbooks";
import { getAircraftRole, canEditRole } from "@/lib/access";
import { ReviewAllClient, type FlatEntry } from "./ReviewAllClient";


export default async function ReviewAllPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // RLS returns null if the caller has no access.
  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("owner_id, tail_number")
    .eq("id", id)
    .single();
  if (!aircraft) notFound();

  // Bulk confirm + inline edit are writes — viewers have nothing to do here.
  const role = await getAircraftRole(supabase, id, aircraft.owner_id);
  if (!canEditRole(role)) redirect(`/aircraft/${id}`);

  const [{ data: entries }, { data: pages }, { data: logbooks }] = await Promise.all([
    // Scan-less entries (CSV imports — log_entry.page_id is nullable) are
    // included: they need review exactly as much as extracted ones, and this
    // screen already has the bulk-confirm a 200-row import wants. A second
    // review surface would be a second place to forget.
    supabase
      .from("log_entry")
      .select("*")
      .eq("aircraft_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("page")
      .select("id, logbook_id, page_sequence, storage_path, thumbnail_path, updated_at")
      .eq("aircraft_id", id),
    supabase.from("logbook").select("id, type, title").eq("aircraft_id", id),
  ]);

  const logbookLabel = new Map(
    (logbooks ?? []).map((l) => [l.id, l.title ?? LOGBOOK_LABEL[l.type] ?? l.type]),
  );
  const pageById = new Map((pages ?? []).map((p) => [p.id, p]));

  // Page ordering: logbook label, then capture sequence. Entries inherit their
  // page's slot so a page's entries stay together and in reading order.
  const orderedPages = [...(pages ?? [])].sort((a, b) => {
    const la = logbookLabel.get(a.logbook_id) ?? "";
    const lb = logbookLabel.get(b.logbook_id) ?? "";
    if (la !== lb) return la.localeCompare(lb);
    return (a.page_sequence ?? 1e9) - (b.page_sequence ?? 1e9);
  });
  const pageOrder = new Map(orderedPages.map((p, i) => [p.id, i]));

  // `?v=` is updated_at — the route caches immutably for 7 days, so an edited
  // page would otherwise show its old scan until the cache expired.
  const ver = (u: string | null) => (u ? Date.parse(u) : 0);
  // Stable, browser-cacheable image URLs (see /api/page/[pageId]/image) instead
  // of a fresh signed URL per view. ?thumb=1 serves thumb-or-full.
  const thumbUrl = new Map(
    orderedPages.map((p) => [p.id, `/api/page/${p.id}/image?thumb=1&v=${ver(p.updated_at)}`]),
  );
  const fullUrl = new Map(orderedPages.map((p) => [p.id, `/api/page/${p.id}/image?v=${ver(p.updated_at)}`]));

  // Imported entries have no page, so they can't inherit a page's slot. They sit
  // after every scanned page, grouped by logbook, in date order — a defined
  // position rather than an accident of created_at.
  const IMPORTED_SLOT = orderedPages.length;

  const flat: FlatEntry[] = (entries ?? [])
    .filter((e) => !e.page_id || pageById.has(e.page_id))
    .map((e) => {
      const page = e.page_id ? pageById.get(e.page_id) : undefined;
      if (!page) {
        const label = logbookLabel.get(e.logbook_id) ?? "Logbook";
        return {
          id: e.id,
          entry_date: e.entry_date,
          hobbs: e.hobbs,
          airframe: e.airframe,
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
          field_boxes: e.field_boxes,
          owner_confirmed: e.owner_confirmed,
          is_continuation: e.is_continuation,
          reference_links: e.reference_links ?? [],
          pageId: null,
          logbookId: e.logbook_id,
          pageLabel: `${label} · imported (no scan)`,
          thumbnailUrl: null,
          fullUrl: null,
        };
      }
      const label = logbookLabel.get(page.logbook_id) ?? "Logbook";
      return {
        id: e.id,
        entry_date: e.entry_date,
        hobbs: e.hobbs,
        airframe: e.airframe,
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
        field_boxes: e.field_boxes,
        owner_confirmed: e.owner_confirmed,
        is_continuation: e.is_continuation,
        reference_links: e.reference_links ?? [],
        pageId: page.id,
        logbookId: page.logbook_id,
        pageLabel: `${label}${page.page_sequence != null ? ` · page #${page.page_sequence}` : ""}`,
        thumbnailUrl: thumbUrl.get(page.id) ?? null,
        fullUrl: fullUrl.get(page.id) ?? null,
      };
    })
    .sort((a, b) => {
      const sa = a.pageId ? (pageOrder.get(a.pageId) ?? 0) : IMPORTED_SLOT;
      const sb = b.pageId ? (pageOrder.get(b.pageId) ?? 0) : IMPORTED_SLOT;
      if (sa !== sb) return sa - sb;
      if (!a.pageId && !b.pageId) {
        // Within the imported block: logbook, then date (undated last).
        if (a.logbookId !== b.logbookId) return a.pageLabel.localeCompare(b.pageLabel);
        return (a.entry_date ?? "9999").localeCompare(b.entry_date ?? "9999");
      }
      return 0;
    });

  // Documents attached to any of these entries (Vault items linked to an entry).
  const attachmentsByEntry: Record<string, { id: string; title: string | null; file_name: string | null }[]> = {};
  const flatIds = flat.map((e) => e.id);
  if (flatIds.length) {
    const { data: docs } = await supabase
      .from("document")
      .select("id, title, file_name, log_entry_id")
      .in("log_entry_id", flatIds);
    for (const d of docs ?? []) {
      if (!d.log_entry_id) continue;
      (attachmentsByEntry[d.log_entry_id] ??= []).push({ id: d.id, title: d.title, file_name: d.file_name });
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mt-2 mb-6">
        <div className="eyebrow mb-2">Add records</div>
        <h1 className="text-2xl font-bold">
          Review all entries{aircraft.tail_number ? ` · ${aircraft.tail_number}` : ""}
        </h1>
        <p className="mt-1 text-sm text-dim">
          Every extracted entry in one scroll — edit inline, confirm as you go, or
          confirm all the clean ones at once. Low-confidence fields are flagged;
          use <span className="font-medium">Open page ↗</span> to check against the
          original scan. This is an index of your logbooks, not a legal record.
        </p>
      </header>

      <ReviewAllClient aircraftId={id} entries={flat} attachmentsByEntry={attachmentsByEntry} />
    </main>
  );
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { AircraftShellContext } from "@/lib/aircraftContext";

/** Counts behind the six SectionTabs (03 §13). Confirmed data only; a failed count drops its line, never the tab. */
export type RailCounts = {
  overdue: number | null;
  dueSoon: number | null;
  pages: number | null;
  booksWithPages: number | null;
  confirmedEntries: number | null;
  toReview: number;
  trackedItems: number | null;
  openSquawks: number | null;
  toAnswer: number;
  documents: number | null;
  liveLinks: number | null;
  people: number | null;
};

export type RailTab = {
  section: "status" | "books" | "maint" | "aircraft" | "docs" | "share";
  label: string;
  href: string;
  lines: string[];
  flag?: string;
  /** √n share of the free rail height (02 §3.4). */
  weight: number;
};

export async function loadRailCounts(
  supabase: SupabaseClient<Database>,
  ctx: AircraftShellContext,
): Promise<RailCounts> {
  const id = ctx.id;
  const count = (q: PromiseLike<{ count: number | null; error: unknown }>) =>
    Promise.resolve(q).then((r) => (r.error ? null : (r.count ?? 0)));
  const nowIso = new Date().toISOString();
  const [pageRows, confirmedEntries, items, ads, openSquawks, documents, liveLinks, people] = await Promise.all([
    supabase.from("page").select("logbook_id").eq("aircraft_id", id),
    count(supabase.from("log_entry").select("id", { count: "exact", head: true }).eq("aircraft_id", id).eq("owner_confirmed", true)),
    count(supabase.from("maintenance_item").select("id", { count: "exact", head: true }).eq("aircraft_id", id)),
    count(
      supabase
        .from("ad_compliance")
        .select("id", { count: "exact", head: true })
        .eq("aircraft_id", id)
        .in("status", ["open", "complied", "previously_complied"]),
    ),
    count(supabase.from("squawk").select("id", { count: "exact", head: true }).eq("aircraft_id", id).eq("status", "open")),
    count(supabase.from("document").select("id", { count: "exact", head: true }).eq("aircraft_id", id)),
    ctx.isOwner
      ? count(
          supabase
            .from("record_room")
            .select("id", { count: "exact", head: true })
            .eq("aircraft_id", id)
            .is("revoked_at", null)
            .gt("expires_at", nowIso),
        )
      : Promise.resolve(null),
    ctx.isOwner
      ? count(supabase.from("aircraft_share").select("id", { count: "exact", head: true }).eq("aircraft_id", id))
      : Promise.resolve(null),
  ]);
  const pages = pageRows.error ? null : (pageRows.data ?? []);
  return {
    overdue: ctx.annun?.overdue ?? null,
    dueSoon: ctx.annun?.due ?? null,
    pages: pages ? pages.length : null,
    booksWithPages: pages ? new Set(pages.map((p) => p.logbook_id)).size : null,
    confirmedEntries,
    toReview: ctx.canEdit ? ctx.badges.review : 0,
    trackedItems: items == null || ads == null ? null : items + ads,
    openSquawks,
    toAnswer: ctx.canEdit ? ctx.badges.equipment : 0,
    documents,
    liveLinks,
    people,
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Tab text per 03 §13. */
export function railTabs(aircraftId: string, c: RailCounts, isOwner: boolean): RailTab[] {
  const a = `/aircraft/${aircraftId}`;
  const statusLine =
    c.overdue == null || c.dueSoon == null
      ? []
      : c.overdue > 0
        ? [`${c.overdue} overdue, ${c.dueSoon} soon`]
        : c.dueSoon > 0
          ? [`${c.dueSoon} due soon`]
          : c.trackedItems
            ? ["Nothing tracked is overdue"]
            : ["Nothing tracked yet"];
  const books =
    c.pages == null
      ? []
      : c.pages === 0
        ? ["No pages yet", "Add the first book"]
        : [
            `${plural(c.pages, "page")} in ${plural(c.booksWithPages ?? 0, "book")}`,
            ...(c.confirmedEntries == null ? [] : [plural(c.confirmedEntries, "entry", "entries")]),
          ];
  const maint = [
    ...(c.trackedItems == null ? [] : [c.trackedItems === 0 ? "Nothing tracked yet" : plural(c.trackedItems, "tracked item")]),
    ...(c.openSquawks == null ? [] : [c.openSquawks === 0 ? "No open squawks" : plural(c.openSquawks, "open squawk")]),
  ];
  const share = isOwner
    ? c.liveLinks == null
      ? []
      : [c.liveLinks === 0 ? "No links live" : `${plural(c.liveLinks, "link")} live`]
    : ["Dossier and summary"];
  return [
    { section: "status", label: "Status", href: `${a}/status`, lines: statusLine, weight: Math.sqrt(c.trackedItems ?? 0) },
    {
      section: "books",
      label: "Logbooks",
      href: `${a}/logbooks`,
      lines: books,
      flag: c.toReview > 0 ? `${c.toReview} to review` : undefined,
      weight: Math.sqrt(c.pages ?? 0),
    },
    {
      section: "maint",
      label: "Maintenance",
      href: `${a}/maintenance`,
      lines: maint,
      weight: Math.sqrt((c.trackedItems ?? 0) + (c.openSquawks ?? 0)),
    },
    {
      section: "aircraft",
      label: "Aircraft",
      href: `${a}/hours`,
      lines: ["Hours, equipment, W&B", ...(c.toAnswer > 0 ? [`${c.toAnswer} to answer`] : [])],
      weight: Math.sqrt(c.toAnswer + 1),
    },
    {
      section: "docs",
      label: "Documents",
      href: `${a}/documents`,
      lines: c.documents == null ? [] : [c.documents === 0 ? "Nothing filed yet" : `${c.documents} in the vault`],
      weight: Math.sqrt(c.documents ?? 0),
    },
    {
      section: "share",
      label: "Share",
      href: `${a}/share`,
      lines: share,
      weight: Math.sqrt((c.liveLinks ?? 0) + (c.people ?? 0)),
    },
  ];
}

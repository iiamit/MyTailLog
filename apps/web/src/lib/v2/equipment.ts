import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { BOOK_NAME } from "@/lib/v2/books";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "every 100 hours or 12 months" (12 copy: plain words, both limits named). */
export function intervalPhrase(hours: number | null, months: number | null): string | null {
  const parts = [hours ? plural(hours, "hour") : null, months ? plural(months, "month") : null].filter(Boolean);
  return parts.length ? `every ${parts.join(" or ")}` : null;
}

export type LinkedAd = {
  reference: string;
  kind: string;
  status: string;
  recurring: boolean;
  interval_hours: number | null;
  interval_months: number | null;
};

/** The ADs cell of the installed table (W-AIRCRAFT-03): "AD 2011-10-09 every 100 hours", "AD … not applicable". */
export function adPhrase(ad: LinkedAd): string {
  const ref = `${ad.kind === "sb" ? "SB" : "AD"} ${ad.reference}`;
  if (ad.status === "not_applicable") return `${ref} not applicable`;
  if (ad.status === "superseded") return `${ref} superseded`;
  const every = ad.recurring ? intervalPhrase(ad.interval_hours, ad.interval_months) : null;
  return every ? `${ref} ${every}` : ad.status === "open" ? `${ref}, open` : `${ref}, complied once`;
}

/** "{n} parts installed, {m} removed. {k} more turned up in the logbooks and need your answer." */
export function equipmentVerdict(installed: number, removed: number, proposals: number): string {
  const head = `${plural(installed, "part")} installed, ${removed} removed.`;
  if (!proposals) return head;
  return `${head} ${proposals} more turned up in the logbooks and ${proposals === 1 ? "needs" : "need"} your answer.`;
}

/** "Airframe p. 41" for each page id, from the aircraft's logbooks. Unknown pages are left out. */
export async function pageLabels(
  supabase: SupabaseClient<Database>,
  aircraftId: string,
  pageIds: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const ids = [...new Set(pageIds.filter((x): x is string => !!x))];
  if (!ids.length) return new Map();
  const [{ data: pages }, { data: books }] = await Promise.all([
    supabase.from("page").select("id, logbook_id, page_sequence").eq("aircraft_id", aircraftId).in("id", ids),
    supabase.from("logbook").select("id, type").eq("aircraft_id", aircraftId),
  ]);
  const type = new Map((books ?? []).map((b) => [b.id, b.type as string]));
  return new Map(
    (pages ?? []).map((p) => {
      const name = BOOK_NAME[type.get(p.logbook_id) ?? ""] ?? "Logbook";
      return [p.id, p.page_sequence != null ? `${name} p. ${p.page_sequence}` : name];
    }),
  );
}

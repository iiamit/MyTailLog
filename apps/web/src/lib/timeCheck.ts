// Written versus calculated time since overhaul (09 §3.10, §4.7; W-AIRCRAFT-01 "Written against
// calculated"). Pure: rows in, checks out. The app never corrects the book; it only points at the page.

export type TimeCheckComponent = "engine" | "prop";
export type TimeCheckInput = {
  maintenance_item: { id: string; kind: string }[];
  item_completion: { maintenance_item_id: string | null; log_entry_id: string | null; done_date: string; done_hours: number | null }[];
  log_entry: {
    id: string; logbook_id: string; page_id: string | null; entry_date: string | null; tach: number | null; trust: string;
    replaced_by_entry_id: string | null; stated_times: { component: string; basis: string; value: number }[] | null;
  }[];
  logbook: { id: string; type: string; title: string | null }[];
  page: { id: string; logbook_id: string; page_sequence: number | null }[];
  meter_reset: { meter: string; reset_date: string; prior_value: number | null; new_value: number }[];
  time_check_dismissal: { component: string; log_entry_id: string; written_value: number; calculated_value: number }[];
};
export type PageRef = { pageId: string; logbook: string; volume: string | null; pageNumber: number | null; label: string; entryId?: string };
export type TimeCheck = {
  component: TimeCheckComponent; entryId: string; pageRef: PageRef | null; written: number; calculated: number;
  result: "agree" | "apart"; difference: number; digitSwap: boolean; dismissed: boolean;
};

const ANCHOR: Record<TimeCheckComponent, string> = { engine: "engine_tbo", prop: "prop_overhaul" };
const BASES: Record<TimeCheckComponent, string[]> = { engine: ["SMOH", "TSO"], prop: ["SPOH", "TSO"] };
const BOOK: Record<string, string> = { airframe: "Airframe", engine: "Engine", prop: "Propeller", avionics: "Avionics", other: "Other" };
const EARLIER = 3;
const round1 = (x: number) => Math.round(x * 10) / 10;

/** Two one-decimal strings that differ only by swapping two adjacent digits ("1324.5" vs "1342.5"). */
export function isDigitSwap(a: number, b: number): boolean {
  const x = a.toFixed(1);
  const y = b.toFixed(1);
  if (x.length !== y.length || x === y) return false;
  const diff = [...x].map((c, i) => (c !== y[i] ? i : -1)).filter((i) => i >= 0);
  return diff.length === 2 && diff[1] === diff[0] + 1 && x[diff[0]] === y[diff[1]] && x[diff[1]] === y[diff[0]] && /\d/.test(x[diff[0]] + x[diff[1]]);
}

export function computeTimeChecks(input: TimeCheckInput): TimeCheck[] {
  const entries = new Map(input.log_entry.map((e) => [e.id, e]));
  const counts = (id: string | null) => {
    const e = id ? entries.get(id) : undefined;
    return !e || (e.trust !== "ai_read" && !e.replaced_by_entry_id);
  };
  // Tach on the continuous scale across recorded meter replacements (09 §3.1).
  // shortcut: a reset without a recorded prior value is ignored here; the due engine infers it. Record the prior to compare across it.
  const stitched = (tach: number, date: string | null) => tach + input.meter_reset
    .filter((r) => r.meter === "tach" && r.prior_value != null && (date ?? "") >= r.reset_date)
    .reduce((s, r) => s + (r.prior_value! - r.new_value), 0);
  const books = new Map(input.logbook.map((b) => [b.id, b]));
  const pages = new Map(input.page.map((p) => [p.id, p]));
  const pageRef = (e: TimeCheckInput["log_entry"][number]): PageRef | null => {
    const p = e.page_id ? pages.get(e.page_id) : undefined;
    const b = books.get(e.logbook_id);
    if (!p || !b) return null;
    return { pageId: p.id, logbook: b.type, volume: b.title, pageNumber: p.page_sequence,
      label: `${BOOK[b.type] ?? "Other"} p. ${p.page_sequence ?? "?"}`, entryId: e.id };
  };

  const out: TimeCheck[] = [];
  for (const component of ["engine", "prop"] as const) {
    const items = new Set(input.maintenance_item.filter((m) => m.kind === ANCHOR[component]).map((m) => m.id));
    const anchor = input.item_completion
      .filter((c) => c.maintenance_item_id && items.has(c.maintenance_item_id) && counts(c.log_entry_id))
      .map((c) => {
        const e = c.log_entry_id ? entries.get(c.log_entry_id) : undefined;
        const tach = c.done_hours ?? e?.tach ?? null;
        return tach == null ? null : { date: c.done_date, tach: stitched(tach, c.done_date) };
      })
      .filter((a): a is { date: string; tach: number } => !!a)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.tach - a.tach))[0];
    if (!anchor) continue; // "Add the overhaul to compare times"
    const checks = input.log_entry
      .filter((e) => counts(e.id) && e.entry_date && e.entry_date > anchor.date && e.tach != null)
      .flatMap((e) => (e.stated_times ?? [])
        .filter((s) => s.component === component && BASES[component].includes(s.basis) && Number.isFinite(s.value))
        .slice(0, 1)
        .map((s) => ({ e, written: round1(s.value) })))
      .sort((a, b) => (a.e.entry_date! < b.e.entry_date! ? 1 : a.e.entry_date! > b.e.entry_date! ? -1 : a.e.id < b.e.id ? -1 : 1))
      .slice(0, 1 + EARLIER);
    for (const { e, written } of checks) {
      const calculated = round1(stitched(e.tach!, e.entry_date) - anchor.tach);
      const difference = round1(written - calculated);
      const dismissed = input.time_check_dismissal.some((d) => d.component === component && d.log_entry_id === e.id &&
        round1(Number(d.written_value)) === written && round1(Number(d.calculated_value)) === calculated);
      out.push({
        component, entryId: e.id, pageRef: pageRef(e), written, calculated,
        result: Math.abs(difference) <= 1.0 ? "agree" : "apart", difference,
        digitSwap: Math.abs(difference) > 1.0 && isDigitSwap(written, calculated), dismissed,
      });
    }
  }
  return out;
}

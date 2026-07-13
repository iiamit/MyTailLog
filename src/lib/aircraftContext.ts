import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getAircraftRole, canEditRole } from "@/lib/access";
import { buildStatusItems } from "@/lib/status";
import { currentTach, currentHobbs, meterValueAtDate, type Reading as HTReading } from "@/lib/hobbsTach";

/**
 * Everything the persistent aircraft shell (top bar + nav rail) needs, loaded
 * once in aircraft/[id]/layout.tsx: identity, live hours, the airworthiness
 * annunciator counts, and the nav badge numbers. Returns null when the caller
 * has no access to the aircraft (RLS returns no row) — the layout 404s on null.
 */
export type AircraftShellContext = {
  id: string;
  reg: string;
  type: string;
  serial: string | null;
  demo: boolean;
  isOwner: boolean;
  canEdit: boolean;
  tach: number | null;
  hobbs: number | null;
  currentHours: number | null;
  annun: { overdue: number; due: number; current: number };
  badges: { equipment: number; status: number; review: number };
};

export async function getAircraftShellContext(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<AircraftShellContext | null> {
  const { data: aircraft } = await supabase
    .from("aircraft")
    .select(
      "id, tail_number, year, make, model, serial_number, is_demo, owner_id, enrollment_hobbs, enrollment_tach",
    )
    .eq("id", id)
    .single();
  if (!aircraft) return null;

  const [
    role,
    { data: entryHours },
    { data: readings },
    { data: items },
    { data: ads },
    { count: equipment },
    { data: unconfirmed },
  ] = await Promise.all([
    getAircraftRole(supabase, id, aircraft.owner_id),
    supabase.from("log_entry").select("hobbs, tach, entry_date").eq("aircraft_id", id),
    supabase.from("hours_reading").select("hobbs, tach, reading_date").eq("aircraft_id", id),
    supabase.from("maintenance_item").select("*").eq("aircraft_id", id),
    supabase
      .from("ad_compliance")
      .select(
        "id, reference, kind, next_due_date, next_due_hours, status, verified_report_page_id, verified_at",
      )
      .eq("aircraft_id", id)
      .eq("recurring", true)
      .not("status", "in", "(not_applicable,superseded)"),
    supabase
      .from("equipment_proposal")
      .select("id", { count: "exact", head: true })
      .eq("aircraft_id", id),
    // Pages that need review = pages with at least one unconfirmed entry. Keyed
    // off entries (not page.review_status) so entry-less pages (covers, classified
    // docs) and fully-confirmed pages don't nag the badge with nothing to review.
    supabase
      .from("log_entry")
      .select("page_id")
      .eq("aircraft_id", id)
      .eq("owner_confirmed", false),
  ]);
  const review = new Set(
    (unconfirmed ?? []).map((e) => e.page_id).filter(Boolean),
  ).size;

  // The top bar shows each instrument's LATEST recorded reading — from the newest
  // logbook entry or synced MyFlightBook reading (by date), falling back to the
  // enrollment value. Not the max: a single mis-read high value shouldn't inflate
  // the displayed hours forever. Each meter is resolved independently, since an
  // entry may record tach but not hobbs (or vice versa).
  type Reading = { date: string | null; hobbs: number | null; tach: number | null };
  const all: Reading[] = [
    ...(entryHours ?? []).map((r) => ({ date: r.entry_date, hobbs: r.hobbs, tach: r.tach })),
    ...(readings ?? []).map((r) => ({ date: r.reading_date, hobbs: r.hobbs, tach: r.tach })),
  ];
  const latest = (key: "hobbs" | "tach"): number | null => {
    const withVal = all.filter((r) => r[key] != null && Number.isFinite(r[key] as number));
    if (!withVal.length) return null;
    withVal.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    return withVal[0][key] as number;
  };
  const tach = latest("tach") ?? aircraft.enrollment_tach;
  const hobbs = latest("hobbs") ?? aircraft.enrollment_hobbs;

  // currentHours stays the best estimate of TOTAL time (highest known across all
  // readings + enrollment) — that drives airworthiness urgency below and must not
  // regress when the latest logged reading happens to be a lower meter.
  const bump = (cur: number | null, v: number | null | undefined) =>
    v != null && Number.isFinite(v) && (cur == null || v > cur) ? v : cur;
  let currentHours: number | null = null;
  for (const r of all) currentHours = bump(bump(currentHours, r.hobbs), r.tach);
  currentHours = bump(bump(currentHours, aircraft.enrollment_hobbs), aircraft.enrollment_tach);

  // Airworthiness urgency runs on the reconciled per-meter currents: regulatory
  // items on tach, usage items (oil) on hobbs. (currentHours above stays the
  // total-time figure the AI narration uses.)
  const htReadings: HTReading[] = [
    ...all.map((r, i) => ({ id: `r${i}`, source: "entry" as const, date: r.date, hobbs: r.hobbs, tach: r.tach, reviewedAt: null })),
    ...(aircraft.enrollment_hobbs != null || aircraft.enrollment_tach != null
      ? [{ id: "enroll", source: "enrollment" as const, date: null, hobbs: aircraft.enrollment_hobbs, tach: aircraft.enrollment_tach, reviewedAt: null }]
      : []),
  ];
  const ctTach = currentTach(htReadings);
  const chHobbs = currentHobbs(htReadings);
  const status = buildStatusItems(items ?? [], ads ?? [], {
    tach: ctTach.tach,
    hobbs: chHobbs.hobbs,
    tachEstimated: ctTach.estimated,
    hobbsEstimated: chHobbs.estimated,
    baselineFor: (date, meter) => meterValueAtDate(htReadings, date, meter),
  });
  const annun = {
    overdue: status.filter((s) => s.urgency === "overdue").length,
    due: status.filter((s) => s.urgency === "due_soon").length,
    current: status.filter((s) => s.urgency === "upcoming" || s.urgency === "none").length,
  };

  return {
    id,
    reg: aircraft.tail_number,
    type: [aircraft.year, aircraft.make, aircraft.model].filter(Boolean).join(" ") || "Details not set",
    serial: aircraft.serial_number,
    demo: aircraft.is_demo ?? false,
    isOwner: role === "owner",
    canEdit: canEditRole(role),
    tach,
    hobbs,
    currentHours,
    annun,
    badges: {
      equipment: equipment ?? 0,
      status: annun.overdue + annun.due,
      review: review ?? 0,
    },
  };
}

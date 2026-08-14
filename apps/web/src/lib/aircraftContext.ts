import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getAircraftRole, canEditRole } from "@/lib/access";
import { buildStatusItems } from "@/lib/status";
import { toReadings, currentMetersFrom } from "@/lib/aircraftHours";
import { toFace, type Meter, type MeterReset } from "@/lib/hobbsTach";

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
  airframe: number | null;
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
      "id, tail_number, year, make, model, serial_number, is_demo, owner_id, enrollment_date, enrollment_hobbs, enrollment_tach, enrollment_airframe",
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
    { data: resetRows },
    { count: equipment },
    { data: unconfirmed },
  ] = await Promise.all([
    getAircraftRole(supabase, id, aircraft.owner_id),
    // `source` and `hours_reviewed_at` are NOT optional extras: toReadings() uses
    // source to mark ADS-B estimates, and without that flag an estimate competes
    // with a real reading as an equal.
    supabase.from("log_entry").select("id, hobbs, tach, airframe, entry_date, hours_reviewed_at").eq("aircraft_id", id),
    supabase
      .from("hours_reading")
      .select("id, hobbs, tach, airframe, reading_date, hours_reviewed_at, source")
      .eq("aircraft_id", id),
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
      .from("meter_reset")
      .select("meter, reset_date, prior_value, new_value")
      .eq("aircraft_id", id)
      .order("reset_date", { ascending: true }),
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

  // ONE definition of "current hours" for the whole app.
  //
  // This used to hand-roll its own "newest date wins" pick, which is how the top
  // bar came to disagree with the meters page: it never even SELECTED `source`,
  // so it couldn't tell an accepted ADS-B estimate from a MyFlightBook reading
  // and simply took whichever was dated latest. On N9363V that showed 964.4 (an
  // estimate) beside a provenance line reading "from MyFlightBook" — the number
  // and its explanation came from two different implementations.
  //
  // Now both go through toReadings() + currentMetersFrom(), the same pair the
  // meters/status/maintenance pages and the native app use.
  const enrollment = {
    hobbs: aircraft.enrollment_hobbs,
    tach: aircraft.enrollment_tach,
    airframe: aircraft.enrollment_airframe,
    date: aircraft.enrollment_date ?? null,
  };
  const resets: MeterReset[] = (resetRows ?? []).map((r) => ({
    meter: r.meter as Meter,
    date: r.reset_date,
    prior: r.prior_value,
    next: r.new_value,
  }));
  const raw = toReadings(entryHours ?? [], readings ?? [], enrollment);
  const meters = currentMetersFrom(raw, resets);

  // Face values — what the instruments in the panel actually READ today. The
  // maintenance math runs on the reset-stitched total scale, which is a
  // different (larger) number once a meter has been replaced, so the selected
  // reading is converted back down for display.
  const tach = toFace(meters.tach.tach, meters.tach.asOf, "tach", resets) ?? aircraft.enrollment_tach;
  const hobbs = toFace(meters.hobbs.hobbs, meters.hobbs.asOf, "hobbs", resets) ?? aircraft.enrollment_hobbs;
  const airframe =
    toFace(meters.airframe.airframe, meters.airframe.asOf, "airframe", resets) ?? aircraft.enrollment_airframe;

  // currentHours stays the best estimate of TOTAL time (highest known across all
  // readings + enrollment) — that drives the AI narration and must not regress
  // when the latest logged reading happens to be a lower meter.
  const bump = (cur: number | null, v: number | null | undefined) =>
    v != null && Number.isFinite(v) && (cur == null || v > cur) ? v : cur;
  let currentHours: number | null = null;
  for (const r of raw) currentHours = bump(bump(bump(currentHours, r.hobbs), r.tach), r.airframe);

  // Airworthiness urgency runs on the reconciled per-meter currents: regulatory
  // items on tach, usage items (oil) on hobbs — on the stitched TOTAL scale, so a
  // replaced meter that restarted near zero doesn't read as time going backwards.
  const status = buildStatusItems(items ?? [], ads ?? [], {
    tach: meters.tach.tach,
    hobbs: meters.hobbs.hobbs,
    airframe: meters.airframe.airframe,
    tachEstimated: meters.tach.estimated,
    hobbsEstimated: meters.hobbs.estimated,
    baselineFor: meters.baselineFor,
    toTotalHours: meters.toTotalHours,
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
    airframe,
    currentHours,
    annun,
    badges: {
      equipment: equipment ?? 0,
      status: annun.overdue + annun.due,
      review: review ?? 0,
    },
  };
}

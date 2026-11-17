import { CapacitorHttp } from "@capacitor/core";
import { getByAircraft, getRows, applyChanges } from "./db";
import { API_BASE, supabase } from "./supabase";
import type { AdCompliance, AdReference, Component, EquipmentProposal, MaintenanceItem } from "@/lib/database.types";
import {
  toReadings,
  currentMetersFrom,
  type CurrentMeters,
  type EntryRowLite,
  type HoursRowLite,
} from "@/lib/aircraftHours";
import { buildStatusItems, hoursRemaining, type StatusItem } from "@/lib/status";
import { dueText, type Urgency } from "@/lib/compliance";
import { projectDueDate, projectionLabel } from "@/lib/utilization";
import type { Meter, MeterReset } from "@/lib/hobbsTach";
import type { StatusLine } from "./status-logic";

export { shortDate, buildVerdict, type StatusLine, type Verdict } from "./status-logic";

// ===========================================================================
// "Am I legal right now?" — computed ON DEVICE, offline, from the synced mirror.
//
// Every number here comes from the SAME pure functions the web app uses
// (@/… resolves into apps/web/src — see vite.config.ts). Nothing about
// airworthiness is re-derived locally: this file only reads rows out of SQLite
// and hands them over. If a countdown is wrong, it is wrong in one place.
// ===========================================================================

type AircraftRow = {
  id: string;
  enrollment_hobbs: number | null;
  enrollment_tach: number | null;
  enrollment_airframe: number | null;
  enrollment_date: string | null;
};

type MeterResetRow = {
  meter: string;
  reset_date: string | null;
  prior_value: number | null;
  new_value: number | null;
};

export type Airworthiness = {
  meters: CurrentMeters;
  lines: StatusLine[];
  /** Worst urgency present, for the aircraft-list badge. */
  worst: Urgency | null;
};

export async function computeAirworthiness(aircraftId: string): Promise<Airworthiness> {
  const [aircraftRows, entries, readings, resetRows, items, ads] = await Promise.all([
    getRows<AircraftRow>("aircraft"),
    getByAircraft<EntryRowLite>("log_entry", aircraftId),
    getByAircraft<HoursRowLite>("hours_reading", aircraftId),
    getByAircraft<MeterResetRow>("meter_reset", aircraftId),
    getByAircraft<Parameters<typeof buildStatusItems>[0][number]>("maintenance_item", aircraftId),
    getByAircraft<Parameters<typeof buildStatusItems>[1][number]>("ad_compliance", aircraftId),
  ]);

  const ac = aircraftRows.find((a) => a.id === aircraftId);
  const raw = toReadings(entries, readings, {
    hobbs: ac?.enrollment_hobbs ?? null,
    tach: ac?.enrollment_tach ?? null,
    airframe: ac?.enrollment_airframe ?? null,
    date: ac?.enrollment_date ?? null,
  });

  // A reset with no date can't be placed on the timeline, so it can't be applied
  // — dropping it is the only safe reading (see MeterReset.date: string).
  const resets: MeterReset[] = resetRows
    .filter((r): r is MeterResetRow & { reset_date: string } => !!r.reset_date)
    .map((r) => ({
      meter: r.meter as Meter,
      date: r.reset_date,
      prior: r.prior_value,
      next: r.new_value ?? 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const meters = currentMetersFrom(raw, resets);

  // Recurring ADs only, and never the ones that don't apply — same filter the
  // server's reminder pass uses.
  const recurringAds = ads.filter(
    (a) => (a as { recurring?: boolean }).recurring && !["not_applicable", "superseded"].includes(String((a as { status?: string }).status)),
  );

  const lines: StatusLine[] = buildStatusItems(items, recurringAds, {
    tach: meters.tach.tach,
    hobbs: meters.hobbs.hobbs,
    airframe: meters.airframe.airframe,
    tachEstimated: meters.tach.estimated,
    hobbsEstimated: meters.hobbs.estimated,
    airframeEstimated: meters.airframe.estimated,
    baselineFor: meters.baselineFor,
    toTotalHours: meters.toTotalHours,
  }).map((item) => {
    // buildStatusItems already judged urgency — reuse it rather than re-deriving,
    // so the phone can never disagree with the web about what's overdue.
    const projection = item.urgency === "none" || item.hoursUnreliable ? null : projectDueDate(
      hoursRemaining(item.nextDueForItem, item.currentForItem),
      meters.utilization,
    );
    return {
      item,
      urgency: item.urgency,
      due: dueText(item.nextDueDate, item.nextDueForItem, item.currentForItem) ?? "—",
      projection: projection ? projectionLabel(projection) : null,
    };
  });

  // Worst first: an overdue annual must not sit below a fine oil change.
  const rank: Record<Urgency, number> = { overdue: 0, due_soon: 1, upcoming: 3, none: 2 };
  lines.sort((a, b) => rank[a.urgency] - rank[b.urgency]);

  return { meters, lines, worst: lines[0]?.urgency ?? null };
}

// --- Raw rows for the management screens -------------------------------------

export type AirworthinessRows = {
  items: MaintenanceItem[];
  ads: AdCompliance[];
  /** Official AD text/links. Empty until ad_reference syncs (migration 0058). */
  refs: AdReference[];
  components: Component[];
  /** Empty until equipment_proposal syncs (migration 0058). */
  proposals: EquipmentProposal[];
};

export async function loadAirworthinessRows(aircraftId: string): Promise<AirworthinessRows> {
  const [items, ads, refs, components, proposals] = await Promise.all([
    getByAircraft<MaintenanceItem>("maintenance_item", aircraftId),
    getByAircraft<AdCompliance>("ad_compliance", aircraftId),
    getRows<AdReference>("ad_reference"),
    getByAircraft<Component>("component", aircraftId),
    getByAircraft<EquipmentProposal>("equipment_proposal", aircraftId),
  ]);
  return { items, ads, refs, components, proposals };
}

/**
 * Optimistic local WHOLE-row write after enqueue(): the mirror shows the change
 * now, and the next pull replaces the row with the server's version (same
 * primary key). `row: null` removes it. seq 0 only affects getRows() ordering.
 *
 * Not `patchLocal` — review-local.ts owns that name for the merge-a-patch form,
 * and two same-named helpers with different signatures is one import away from
 * writing a partial row over a whole one.
 */
export async function replaceLocal(table: string, id: string, row: Record<string, unknown> | null): Promise<void> {
  await applyChanges([row ? { table, op: "upsert", id, seq: 0, row } : { table, op: "delete", id, seq: 0 }]);
}

// --- AI scans (online only) ----------------------------------------------------

export type ScanKind = "maintenance" | "equipment";

/** POST one of the two scan routes with the session's Bearer token. */
export async function runScan(aircraftId: string, kind: ScanKind): Promise<{ ok: true; summary: string } | { error: string }> {
  if (!navigator.onLine) return { error: "Scanning the logs needs a connection." };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { error: "Sign in again to scan." };
  try {
    const res = await CapacitorHttp.post({
      url: `${API_BASE}/api/aircraft/${aircraftId}/${kind}/scan`,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: {},
    });
    if (res.status < 200 || res.status >= 300) {
      return { error: typeof res.data?.error === "string" ? res.data.error : `The server answered ${res.status}.` };
    }
    const d = (res.data ?? {}) as { updated?: number; proposed?: number; entryCount?: number };
    const n = (kind === "maintenance" ? d.updated : d.proposed) ?? 0;
    return {
      ok: true,
      summary: kind === "maintenance"
        ? `Read ${d.entryCount ?? 0} confirmed entries · ${n} item${n === 1 ? "" : "s"} brought up to date`
        : `${n} piece${n === 1 ? "" : "s"} of equipment proposed`,
    };
  } catch {
    return { error: "Scanning the logs needs a connection." };
  }
}

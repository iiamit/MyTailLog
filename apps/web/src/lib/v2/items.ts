import { CALENDAR_MONTH_KINDS } from "@/lib/maintenance";
import type { MaintenanceItem } from "@/lib/database.types";
import { fmtDate } from "@/lib/due/engine";

// W-MAINT-06 Tracked items: the rule book's words and its form's trust boundary (pure; tested in
// test/items-v2.test.ts). The base fields go through lib/writes/maintenance; the Direction D columns
// (0071) are validated here because that write doesn't carry them yet.

/** Type select (W-MAINT-06 Item form), in the spec's order. "other" is "Custom". */
export const ITEM_TYPES: { kind: string; label: string; months: number | null; hours: number | null; regulatory: boolean; line: string }[] = [
  { kind: "annual", label: "Annual inspection (91.409)", months: 12, hours: null, regulatory: true, line: "airframe" },
  { kind: "hundred_hour", label: "100-hour inspection (91.409)", months: null, hours: 100, regulatory: true, line: "airframe" },
  { kind: "transponder", label: "Transponder (91.413)", months: 24, hours: null, regulatory: true, line: "avionics" },
  { kind: "pitot_static", label: "Pitot-static and altimeter (91.411)", months: 24, hours: null, regulatory: true, line: "avionics" },
  { kind: "elt", label: "ELT inspection (91.207)", months: 12, hours: null, regulatory: true, line: "avionics" },
  { kind: "vor", label: "VOR check (91.171)", months: 1, hours: null, regulatory: true, line: "avionics" },
  { kind: "oil_change", label: "Oil and filter change", months: 4, hours: 50, regulatory: false, line: "engine" },
  { kind: "engine_tbo", label: "Engine TBO", months: null, hours: 2000, regulatory: false, line: "engine" },
  { kind: "prop_overhaul", label: "Propeller overhaul", months: 72, hours: null, regulatory: false, line: "prop" },
  { kind: "other", label: "Custom", months: null, hours: null, regulatory: false, line: "airframe" },
];

export const LINES: [string, string][] = [["airframe", "Airframe"], ["engine", "Engine"], ["prop", "Propeller"], ["avionics", "Avionics"]];
export const SHOP_KINDS: [string, string][] = [
  ["mechanic", "Mechanic"], ["avionics_shop", "Avionics shop"], ["prop_shop", "Prop shop"], ["engine_shop", "Engine shop"], ["self", "I do it myself"],
];
export const shopKindWord = (k: string | null) => SHOP_KINDS.find(([v]) => v === k)?.[1] ?? null;

type RuleSource = Pick<MaintenanceItem, "kind" | "interval_months" | "interval_hours" | "expires_on">;

/** "Every" column: "12 calendar months", "50 hours or 4 months", "30 days", "expires Mar 3, 2027". */
export function everyText(i: RuleSource): string {
  const m = i.interval_months, h = i.interval_hours;
  const months = m == null ? null
    : i.kind === "vor" && m === 1 ? "30 days"
    : `${m} ${CALENDAR_MONTH_KINDS.has(i.kind) ? "calendar " : ""}${m === 1 ? "month" : "months"}`;
  const hours = h == null ? null : `${h} ${h === 1 ? "hour" : "hours"}`;
  if (hours && months) return `${hours} or ${months}`;
  if (hours || months) return (hours ?? months)!;
  return i.expires_on ? `expires ${fmtDate(i.expires_on)}` : "not set";
}

/** "Counted on": the meter for hours items (oil changes default to hobbs), else Calendar. */
export function countedOn(i: Pick<MaintenanceItem, "kind" | "interval_hours" | "meter">): string {
  if (i.interval_hours == null) return "Calendar";
  const m = i.meter ?? (i.kind === "oil_change" ? "hobbs" : "tach");
  return m[0].toUpperCase() + m.slice(1);
}

/** "Remind" column; null leads fall back to the account's lead for the category. */
export function remindText(days: number | null, hours: number | null): string {
  const parts = [days != null ? `${days} days` : null, hours != null ? `${hours} hours` : null].filter(Boolean);
  return parts.length ? parts.join(" or ") : "your default";
}

export type ItemExtras = Pick<
  MaintenanceItem,
  "line" | "shop_kind" | "provider_id" | "ifr_only" | "expires_on" | "visit_window_days" | "visit_window_hours" | "remind_lead_days" | "remind_lead_hours"
>;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "" → null; a non-negative finite number → itself; anything else → NaN (rejected by the caller). */
function num(v: string | undefined): number | null {
  const s = (v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

/**
 * The item form, untrusted, into the base fields for `maintenance.upsert` (which validates them again) and the
 * Direction D extras, which only this boundary checks.
 */
export function pickItemForm(get: (k: string) => string | undefined):
  | { item: Record<string, unknown>; extras: ItemExtras }
  | { error: string } {
  const label = (get("label") ?? "").trim();
  if (!label) return { error: "Give the item a name." };
  const nums = {
    interval_months: num(get("interval_months")), interval_hours: num(get("interval_hours")), last_done_hours: num(get("last_done_hours")),
    visit_window_days: num(get("visit_window_days")), visit_window_hours: num(get("visit_window_hours")),
    remind_lead_days: num(get("remind_lead_days")), remind_lead_hours: num(get("remind_lead_hours")),
  };
  if (Object.values(nums).some((n) => Number.isNaN(n))) return { error: "Intervals and hours are zero or more." };
  const date = (k: string) => (get(k) ?? "").trim() || null;
  const lastDone = date("last_done_date"), expires = date("expires_on");
  if ((lastDone && !ISO.test(lastDone)) || (expires && !ISO.test(expires))) return { error: "Pick a date." };
  const line = get("line") || null;
  if (line && !LINES.some(([v]) => v === line)) return { error: "Pick a logbook." };
  const shop = get("shop_kind") || null;
  if (shop && !SHOP_KINDS.some(([v]) => v === shop)) return { error: "Pick who does it." };
  const provider = get("provider_id") || null;
  if (provider && !UUID.test(provider)) return { error: "Pick a shop or mechanic." };
  const meter = get("meter") || null;
  const kind = get("kind") || "other";
  return {
    item: {
      kind, label, regulatory: get("regulatory") === "on",
      interval_months: nums.interval_months, interval_hours: nums.interval_hours,
      last_done_date: lastDone, last_done_hours: nums.last_done_hours,
      notes: (get("notes") ?? "").trim() || null, meter,
    },
    extras: {
      line: line as ItemExtras["line"], shop_kind: shop as ItemExtras["shop_kind"], provider_id: provider,
      ifr_only: get("ifr_only") === "on", expires_on: expires,
      visit_window_days: nums.visit_window_days, visit_window_hours: nums.visit_window_hours,
      remind_lead_days: nums.remind_lead_days, remind_lead_hours: nums.remind_lead_hours,
    },
  };
}

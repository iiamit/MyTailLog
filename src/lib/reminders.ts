// ===========================================================================
// Reminder decision logic — pure functions over StatusItem, shared by the
// daily cron and the profile settings UI. No I/O, no `@/` VALUE imports (only a
// type import, erased at build) so it can be exercised by a standalone node/bun
// check without module-alias resolution.
//
// Per-category alert settings live in profile.preferences.alerts. Each category
// answers ONE question: "how far in advance (and/or how many hours out) should
// we email about this item?" — the oil-change *interval* itself is set on the
// maintenance item, not here.
// ===========================================================================

import type { StatusItem } from "@/lib/status";

export type ReminderCategory = "annual" | "oil" | "ad" | "default";

export type AlertSettings = {
  annual: { enabled: boolean; lead_days: number };
  oil: { enabled: boolean; lead_hours: number };
  ad: { enabled: boolean; lead_days: number; lead_hours: number };
  default: { enabled: boolean; lead_days: number; lead_hours: number };
};

// Sensible defaults when a field is absent (see Phase 2 requirements).
export const ALERT_DEFAULTS: AlertSettings = {
  annual: { enabled: true, lead_days: 90 },
  oil: { enabled: true, lead_hours: 10 },
  ad: { enabled: true, lead_days: 30, lead_hours: 25 },
  default: { enabled: true, lead_days: 30, lead_hours: 25 },
};

/** Shape stored under profile.preferences.alerts (all fields optional). */
export type StoredAlerts = {
  annual?: Partial<AlertSettings["annual"]>;
  oil?: Partial<AlertSettings["oil"]>;
  ad?: Partial<AlertSettings["ad"]>;
  default?: Partial<AlertSettings["default"]>;
};

const numOr = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;

const boolOr = (v: unknown, fallback: boolean): boolean =>
  typeof v === "boolean" ? v : fallback;

/** Merge a user's stored (partial) alert settings over the defaults. */
export function resolveAlerts(prefs: { alerts?: StoredAlerts } | null | undefined): AlertSettings {
  const a = prefs?.alerts ?? {};
  return {
    annual: {
      enabled: boolOr(a.annual?.enabled, ALERT_DEFAULTS.annual.enabled),
      lead_days: numOr(a.annual?.lead_days, ALERT_DEFAULTS.annual.lead_days),
    },
    oil: {
      enabled: boolOr(a.oil?.enabled, ALERT_DEFAULTS.oil.enabled),
      lead_hours: numOr(a.oil?.lead_hours, ALERT_DEFAULTS.oil.lead_hours),
    },
    ad: {
      enabled: boolOr(a.ad?.enabled, ALERT_DEFAULTS.ad.enabled),
      lead_days: numOr(a.ad?.lead_days, ALERT_DEFAULTS.ad.lead_days),
      lead_hours: numOr(a.ad?.lead_hours, ALERT_DEFAULTS.ad.lead_hours),
    },
    default: {
      enabled: boolOr(a.default?.enabled, ALERT_DEFAULTS.default.enabled),
      lead_days: numOr(a.default?.lead_days, ALERT_DEFAULTS.default.lead_days),
      lead_hours: numOr(a.default?.lead_hours, ALERT_DEFAULTS.default.lead_hours),
    },
  };
}

/** Which alert category a status item belongs to. */
export function reminderCategory(item: Pick<StatusItem, "source" | "kind">): ReminderCategory {
  if (item.source === "ad") return "ad";
  if (item.kind === "annual") return "annual";
  if (item.kind === "oil_change") return "oil";
  return "default";
}

/**
 * Stable string of the item's current next-due. A NEW due cycle (item marked
 * done → later next-due date/hours) yields a different signature, so it re-alerts
 * instead of being suppressed by an old reminder_log row.
 */
export function dueSignature(item: Pick<StatusItem, "nextDueDate" | "nextDueHours">): string {
  return `${item.nextDueDate ?? ""}|${item.nextDueHours ?? ""}`;
}

/** reminder_log dedup key for the item: `maint:<id>` or `ad:<id>`. */
export function itemKey(item: Pick<StatusItem, "source" | "id">): string {
  return `${item.source === "ad" ? "ad" : "maint"}:${item.id}`;
}

/** The date/hours lead windows this category uses (null = not applicable). */
function windowFor(
  cat: ReminderCategory,
  alerts: AlertSettings,
): { enabled: boolean; leadDays: number | null; leadHours: number | null } {
  switch (cat) {
    case "annual":
      return { enabled: alerts.annual.enabled, leadDays: alerts.annual.lead_days, leadHours: null };
    case "oil":
      return { enabled: alerts.oil.enabled, leadDays: null, leadHours: alerts.oil.lead_hours };
    case "ad":
      return { enabled: alerts.ad.enabled, leadDays: alerts.ad.lead_days, leadHours: alerts.ad.lead_hours };
    default:
      return {
        enabled: alerts.default.enabled,
        leadDays: alerts.default.lead_days,
        leadHours: alerts.default.lead_hours,
      };
  }
}

const DAY_MS = 86_400_000;

/**
 * Whether this item is within the user's lead window (or already overdue) for
 * its category, per the enabled flag. Date and hours are evaluated
 * independently — an item due on either axis qualifies.
 */
export function isDueForReminder(
  item: Pick<StatusItem, "source" | "kind" | "nextDueDate" | "nextDueHours">,
  currentHours: number | null,
  alerts: AlertSettings,
  today: Date = new Date(),
): boolean {
  const cat = reminderCategory(item);
  const w = windowFor(cat, alerts);
  if (!w.enabled) return false;

  // Date axis: overdue (negative) or within leadDays.
  if (w.leadDays != null && item.nextDueDate) {
    const todayStr = today.toISOString().slice(0, 10);
    const daysUntil =
      (Date.parse(item.nextDueDate + "T00:00:00Z") - Date.parse(todayStr + "T00:00:00Z")) / DAY_MS;
    if (daysUntil <= w.leadDays) return true;
  }

  // Hours axis: overdue or within leadHours (needs a known current-hours value).
  if (w.leadHours != null && item.nextDueHours != null && currentHours != null) {
    if (item.nextDueHours - currentHours <= w.leadHours) return true;
  }

  return false;
}

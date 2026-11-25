import type { SubTab } from "@/ui/Board";

export type MaintTab = "items" | "ads" | "squawks" | "annual" | "records-check";
export type AircraftTab = "hours" | "oil" | "equipment" | "weight-balance" | "details" | "engine-history" | "costs";

/** Maintenance sub-tabs (03 §4): Squawks and Records check carry their open counts when known. */
export function maintTabs(aircraftId: string, current: MaintTab, counts: { squawks?: number | null; findings?: number | null } = {}): SubTab[] {
  const a = `/aircraft/${aircraftId}/maintenance`;
  const tab = (key: MaintTab, label: string, count?: number | null, noun?: string): SubTab => ({
    label,
    href: `${a}/${key}`,
    current: key === current,
    ...(count ? { count, countLabel: `${count} ${noun}` } : {}),
  });
  return [
    tab("items", "Tracked items"),
    tab("ads", "ADs and SBs"),
    tab("squawks", "Squawks", counts.squawks, "open"),
    tab("annual", "Annual prep"),
    tab("records-check", "Records check", counts.findings, "to look at"),
  ];
}

/** Aircraft sub-tabs (03 §4). */
export function aircraftTabs(aircraftId: string, current: AircraftTab): SubTab[] {
  const a = `/aircraft/${aircraftId}`;
  const labels: [AircraftTab, string][] = [
    ["hours", "Hours and engine"],
    ["oil", "Oil analysis"],
    ["engine-history", "Engine history"],
    ["costs", "Costs"],
    ["equipment", "Equipment"],
    ["weight-balance", "W&B"],
    ["details", "Details"],
  ];
  return labels.map(([key, label]) => ({ label, href: `${a}/${key}`, current: key === current }));
}

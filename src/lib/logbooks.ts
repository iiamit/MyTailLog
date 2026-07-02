import type { LogbookType } from "@/lib/database.types";

// The standard logbooks seeded for every aircraft, in display order. A single
// annual often touches all of them, so they're captured/searched together.
export const LOGBOOK_TYPES: LogbookType[] = [
  "airframe",
  "engine",
  "prop",
  "avionics",
];

export const LOGBOOK_LABEL: Record<LogbookType, string> = {
  airframe: "Airframe",
  engine: "Engine",
  prop: "Propeller",
  avionics: "Avionics",
};

export function logbookLabel(type: string, title?: string | null): string {
  return title ?? LOGBOOK_LABEL[type as LogbookType] ?? type;
}

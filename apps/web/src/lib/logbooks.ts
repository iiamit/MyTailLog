import type { LogbookType } from "@/lib/database.types";

// The standard logbooks seeded for every aircraft, in display order. A single
// annual often touches all of them, so they're captured/searched together.
// "Other" is the capture target for non-log documents (A&P Weight & Balance
// sheets and AD compliance reports) — those pages are classified and applied
// rather than extracted as log entries. See src/lib/extraction/otherDocument.ts.
export const LOGBOOK_TYPES: LogbookType[] = [
  "airframe",
  "engine",
  "prop",
  "avionics",
  "other",
];

export const LOGBOOK_LABEL: Record<LogbookType, string> = {
  airframe: "Airframe",
  engine: "Engine",
  prop: "Propeller",
  avionics: "Avionics",
  other: "Other",
};

export function logbookLabel(type: string, title?: string | null): string {
  return title ?? LOGBOOK_LABEL[type as LogbookType] ?? type;
}

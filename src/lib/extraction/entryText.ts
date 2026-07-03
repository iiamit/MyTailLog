/** Join a log entry's narrative fields into one text blob for the text-only
 *  extraction passes (equipment, maintenance). */
export function entryText(e: {
  description: string | null;
  work_performed: string | null;
  parts: string | null;
}): string {
  return [e.description, e.work_performed, e.parts]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(" — ");
}

/**
 * Coerce an LLM-extracted date string into a Postgres-safe ISO date, or null.
 *
 * The model can emit calendar-INVALID dates that still look well-formed — e.g.
 * "1987-11-31" (November has 30 days), "2021-02-30". Inserting one into a `date`
 * column throws "date/time field value out of range" and fails the WHOLE page's
 * entry save. So: clamp a day past the month's end to the last valid day (keeps
 * the month/year for ordering + the maintenance forecast; the review screen shows
 * the source image to verify/correct), and null anything not shaped YYYY-MM-DD.
 *
 * ponytail: clamp day-overflow rather than null it — an impossible day is almost
 * always a near-month-end value; nulling would drop usable month/year info.
 */
export function safeIsoDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const month = Number(mo);
  if (month < 1 || month > 12 || Number(d) < 1) return null;
  // days in `month` (1-indexed): day 0 of the next month, via 0-indexed Date.UTC.
  const lastDay = new Date(Date.UTC(Number(y), month, 0)).getUTCDate();
  const day = Math.min(Number(d), lastDay);
  return `${y}-${mo}-${String(day).padStart(2, "0")}`;
}

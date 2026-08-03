// ===========================================================================
// Date-format detection and parsing for CSV import.
//
// `03/04/2026` is 3 April or 4 March depending on who exported it, and guessing
// wrong silently shifts a maintenance date by up to eleven months — which then
// drives annual-due, 100-hour and AD compliance. So we never guess.
//
// A CSV is not a scan: the cell values are EXACT, so this is pure deterministic
// parsing with no model involved. The whole date column is scanned (a linear
// pass, already bounded by the 5,000-row cap) rather than a sample: the FIRST
// value anywhere in the file with a day-part > 12 settles the reading for the
// entire file. Only when EVERY row is ambiguous (both parts ≤ 12 everywhere) do
// we ask the user. A column that is internally inconsistent — some rows readable
// only as D/M, others only as M/D — is a broken file, not an ambiguous one, and
// is reported as an error naming the offending rows.
// ===========================================================================

export type DateFormat = "iso" | "mdy" | "dmy";

export type DateDetection =
  /** Settled by the data (ISO, a textual month, or a day-part > 12 somewhere). */
  | { kind: "resolved"; format: DateFormat }
  /** Every value reads both ways — the user must choose. */
  | { kind: "ambiguous"; samples: { raw: string; mdy: string; dmy: string }[] }
  /** Some rows are only D/M and others only M/D. Not a choice — a broken file. */
  | { kind: "conflict"; mdyRows: number[]; dmyRows: number[] }
  /** Nothing in the column looks like a date at all. */
  | { kind: "unrecognized"; samples: string[] };

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const iso = (y: number, m: number, d: number): string | null => {
  if (m < 1 || m > 12 || d < 1) return null;
  // Day 0 of the next month = the last day of this one.
  if (d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null;
  if (y < 1900 || y > 2200) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

// Two-digit years: an aircraft logbook spans decades, so 70..99 → 19xx and
// 00..69 → 20xx. A 1972 airframe entry is real; a 2072 one is not.
const fullYear = (y: number): number => (y >= 100 ? y : y >= 70 ? 1900 + y : 2000 + y);

const NUMERIC = /^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{2,4})$/;
// "3 Apr 2026", "Apr 3, 2026", "April 3rd 2026", "3-Apr-26"
const TEXT_DMY = /^(\d{1,2})(?:st|nd|rd|th)?[\s\-/]+([A-Za-z]{3,})[\s\-/,]+(\d{2,4})$/i;
const TEXT_MDY = /^([A-Za-z]{3,})[\s\-/]+(\d{1,2})(?:st|nd|rd|th)?[,\s]+(\d{2,4})$/i;

/** Trim a cell down to its date part — exports often append a time of day. */
function clean(raw: string): string {
  return raw.trim().replace(/[T\s]+\d{1,2}:\d{2}(:\d{2})?(\.\d+)?\s*(AM|PM|Z|[+-]\d{2}:?\d{2})?$/i, "").trim();
}

/**
 * Every ISO date a single cell could mean, as `{ mdy, dmy }`. Formats that
 * carry their own order (ISO, textual months) return the SAME value for both,
 * which is what makes them self-resolving.
 */
export function readings(raw: string): { mdy: string | null; dmy: string | null } {
  const s = clean(raw);
  if (!s) return { mdy: null, dmy: null };

  const t1 = TEXT_DMY.exec(s);
  if (t1) {
    const m = MONTHS[t1[2].slice(0, 3).toLowerCase()];
    const v = m ? iso(fullYear(Number(t1[3])), m, Number(t1[1])) : null;
    return { mdy: v, dmy: v };
  }
  const t2 = TEXT_MDY.exec(s);
  if (t2) {
    const m = MONTHS[t2[1].slice(0, 3).toLowerCase()];
    const v = m ? iso(fullYear(Number(t2[3])), m, Number(t2[2])) : null;
    return { mdy: v, dmy: v };
  }

  const n = NUMERIC.exec(s);
  if (!n) return { mdy: null, dmy: null };
  const [, a, b, c] = n;
  // A 4-digit leading group is a year: YYYY-MM-DD, unambiguous either way.
  if (a.length === 4) {
    const v = iso(Number(a), Number(b), Number(c));
    return { mdy: v, dmy: v };
  }
  const year = fullYear(Number(c));
  return {
    mdy: iso(year, Number(a), Number(b)),
    dmy: iso(year, Number(b), Number(a)),
  };
}

/** Parse one cell under a settled format. Null = not a date we can place. */
export function parseDate(raw: string, format: DateFormat): string | null {
  const r = readings(raw);
  // "iso" covers ISO and textual months, where both readings agree anyway.
  return format === "dmy" ? r.dmy : r.mdy;
}

/**
 * Scan the WHOLE date column and decide which reading applies. `values` is every
 * non-empty cell in the mapped date column, in row order; `rowNumbers` are the
 * matching 1-based data-row numbers, used only to name rows in a conflict.
 */
export function detectDateFormat(values: string[], rowNumbers: number[]): DateDetection {
  const mdyOnly: number[] = [];
  const dmyOnly: number[] = [];
  const ambiguous: { raw: string; mdy: string; dmy: string }[] = [];
  let anyParsed = false;
  const unparsed: string[] = [];

  for (let i = 0; i < values.length; i++) {
    const raw = values[i];
    const { mdy, dmy } = readings(raw);
    const row = rowNumbers[i] ?? i + 1;
    if (!mdy && !dmy) {
      if (unparsed.length < 5) unparsed.push(raw);
      continue;
    }
    anyParsed = true;
    if (mdy && dmy && mdy !== dmy) {
      if (ambiguous.length < 5) ambiguous.push({ raw, mdy, dmy });
    } else if (mdy && !dmy) {
      mdyOnly.push(row);
    } else if (dmy && !mdy) {
      dmyOnly.push(row);
    }
    // mdy === dmy → self-describing (ISO / textual month); tells us nothing and
    // needs nothing.
  }

  if (!anyParsed) return { kind: "unrecognized", samples: unparsed };
  // Some rows read only one way, others only the other. Coercing either way
  // would scatter dates across the calendar — name the rows instead.
  if (mdyOnly.length && dmyOnly.length) {
    return { kind: "conflict", mdyRows: mdyOnly.slice(0, 5), dmyRows: dmyOnly.slice(0, 5) };
  }
  if (mdyOnly.length) return { kind: "resolved", format: "mdy" };
  if (dmyOnly.length) return { kind: "resolved", format: "dmy" };
  // Nothing disambiguated. If no cell was ever two-ways-readable the column is
  // all ISO / textual months and any format parses it identically.
  if (!ambiguous.length) return { kind: "resolved", format: "iso" };
  return { kind: "ambiguous", samples: ambiguous };
}

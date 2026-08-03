// ===========================================================================
// A small RFC-4180-ish CSV parser. No dependency: the format is well-trodden
// and the whole thing is ~60 lines, which is less than the supply-chain cost of
// a parser package for one import screen.
//
// Handles what real spreadsheet exports actually produce: a UTF-8 BOM, CRLF or
// LF line endings, quoted fields containing the delimiter, embedded newlines,
// doubled "" escapes, and comma / semicolon / tab delimiters (European locales
// export semicolons; "export to TSV" is a menu item everywhere).
//
// It never evaluates anything. A cell is text — see stripFormulaGuard for the
// one narrow exception, which only UNDOES an escape we ourselves wrote.
// ===========================================================================

export type ParsedCsv = {
  delimiter: string;
  header: string[];
  rows: string[][];
};

const DELIMITERS = [",", ";", "\t", "|"];

/**
 * Guess the delimiter from the first line, counting only occurrences OUTSIDE
 * quotes (a description field full of commas must not out-vote a semicolon
 * delimiter). Ties go to the earlier entry in DELIMITERS, so a single-column
 * file lands on comma — which parses identically either way.
 */
export function sniffDelimiter(text: string): string {
  let best = ",";
  let bestCount = 0;
  for (const d of DELIMITERS) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (!inQuotes && (c === "\n" || c === "\r")) {
        break; // first line only
      } else if (!inQuotes && c === d) {
        count++;
      }
    }
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Parse CSV text into a header row + data rows. Empty trailing lines are
 * dropped; rows shorter than the header are padded, longer ones kept intact
 * (the mapper only reads mapped indexes, and truncating would silently lose a
 * value the user might be mapping).
 */
export function parseCsv(input: string, delimiter?: string): ParsedCsv {
  // Strip a UTF-8 BOM. Excel writes one; left in place it becomes part of the
  // first header name and every column mapping for that column silently misses.
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const d = delimiter ?? sniffDelimiter(text);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"' && field === "") {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === d) {
      endField();
      i++;
      continue;
    }
    if (c === "\r") {
      // CRLF or a bare CR line ending.
      endRow();
      i += text[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    if (c === "\n") {
      endRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // Trailing field/row, unless the file simply ended with a newline.
  if (field !== "" || row.length > 0) endRow();

  // Drop blank lines anywhere (a single empty cell and nothing else).
  const clean = rows.filter((r) => r.some((c) => c.trim() !== ""));
  const header = (clean.shift() ?? []).map((h) => h.trim());
  const data = clean.map((r) =>
    r.length < header.length ? [...r, ...Array(header.length - r.length).fill("")] : r,
  );
  return { delimiter: d, header, rows: data };
}

/**
 * Undo the leading-apostrophe guard the CSV *export* route writes in front of
 * cells starting with = + - @ (spreadsheet formula injection). Without this,
 * exporting and re-importing our own file grows an apostrophe every round trip.
 * Only the guard character is removed — the cell is still stored as plain text
 * and re-escaped on the way back out. Nothing here ever evaluates a formula.
 *
 * ponytail: single leading quote only; anything else is the user's own text.
 */
export function stripFormulaGuard(s: string): string {
  return /^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s;
}

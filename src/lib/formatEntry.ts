// ===========================================================================
// Logbook entry text formatter.
//
// Extracted entry text is stored as-is; rendered naively it collapses into a
// wall of text (HTML eats newlines, and inline enumerations like "1) … 2) …"
// run together). This turns a raw entry field into display blocks: paragraphs,
// ordered lists, and bullet lists — so a multi-item entry reads like the page.
//
// Deliberately conservative: it only splits on real newlines and clear list
// markers (digits/letters + . or ), or -/•/*). It does NOT sentence-split, to
// avoid mangling things like "IAW 43.13" or tach "1234.5".
// ===========================================================================

export type EntryBlock =
  | { type: "p"; text: string }
  | { type: "list"; ordered: boolean; items: string[] };

// Line starts with a list marker: "1." "1)" "(1)" "a." "a)" or a bullet.
const ORDERED = /^\(?([0-9]{1,2}|[a-z])[.)]\s+/i;
const BULLET = /^[-–—•*]\s+/;
// A point mid-line where an inline enumeration begins: whitespace before a
// digit-marker or bullet (letters are excluded here — too many false matches).
const INLINE_SPLIT = /\s+(?=(?:\(?\d{1,2}[.)]|[–—•*-])\s)/;

function stripMarker(line: string): string {
  return line.replace(ORDERED, "").replace(BULLET, "").trim();
}

function toLines(text: string): string[] {
  const byNewline = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (byNewline.length > 1) return byNewline;

  // Single line — try to break an inline enumeration into its items.
  const parts = text.split(INLINE_SPLIT).map((p) => p.trim()).filter(Boolean);
  const markerLed = parts.filter((p) => ORDERED.test(p) || BULLET.test(p)).length;
  return markerLed >= 2 ? parts : byNewline;
}

export function formatEntryText(input: string | null | undefined): EntryBlock[] {
  const text = (input ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const blocks: EntryBlock[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flushList = () => {
    if (list) {
      blocks.push({ type: "list", ordered: list.ordered, items: list.items });
      list = null;
    }
  };

  for (const line of toLines(text)) {
    const ordered = ORDERED.test(line);
    const bullet = !ordered && BULLET.test(line);
    if (ordered || bullet) {
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(stripMarker(line));
    } else {
      flushList();
      blocks.push({ type: "p", text: line });
    }
  }
  flushList();
  return blocks;
}

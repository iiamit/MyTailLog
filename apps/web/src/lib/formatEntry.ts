// ===========================================================================
// Logbook entry text formatter.
//
// Extracted entry text is one field; a real annual-inspection entry is a single
// long line combining a header block, numbered AD/inspection items (1. 2. 3.…),
// a prose tail of squawk repairs, and a summary. Rendered naively it's a wall of
// text. This produces readable display blocks: paragraphs and ordered/bulleted
// lists whose items keep their own multi-sentence bodies.
//
// Two-phase, so numbered markers aren't mistaken for sentence ends:
//   1. Segment on inline numbered markers ("… text 1. …" -> [text, "1. …"]).
//   2. Sentence-segment within each segment (guarded against decimals like
//      "4110.4", part/serial numbers, and aviation abbreviations like "T.T.").
// A numbered item keeps its first sentence as the item and the next few as body
// lines; a final item is capped so it can't absorb an unrelated prose tail.
// ===========================================================================

export type EntryBlock =
  | { type: "p"; text: string }
  // Each list item is one or more lines: the first is the item, the rest body.
  | { type: "list"; ordered: boolean; items: string[][] };

const ORDERED_MARKER = /^\(?\d{1,2}[.)]\s+/; // "1. " "1) " "(1) "
const BULLET_MARKER = /^[-–—•*]\s+/; // bullet at the start of a line
// Split before an inline numbered marker preceded by whitespace. Digits only
// (letters/hyphens produce too many false positives — "Part A", "leaking - …").
const SEGMENT_SPLIT = /\s+(?=\(?\d{1,2}[.)]\s)/;
// Sentence boundary: .!? then whitespace then an uppercase letter, digit, or "(".
const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Z0-9(])/;
// Max body sentences kept on one list item; only the final (largest) item is
// expected to hit this, and its overflow renders as paragraphs after the list.
const ITEM_BODY_CAP = 6;

// Abbreviations whose trailing "." must not end a sentence (compared lowercased
// with dots removed).
const ABBREVIATIONS = new Set([
  "no", "nos", "ref", "app", "appx", "inc", "co", "ltd", "corp", "mfg", "mfr",
  "assy", "inst", "insp", "rev", "ser", "mod", "approx", "qty", "ea", "hr",
  "hrs", "min", "sec", "fig", "sect", "para", "vol", "pt", "cyl", "lb", "lbs",
  "oz", "in", "ft", "std", "max", "temp", "eng", "acft", "st", "ave", "rd",
  "dr", "mr", "mrs", "ms", "jr", "sr", "vs", "etc", "cont", "prev", "req",
  "sig", "cert", "compl", "tt", "cht", "egt", "iaw", "far", "ad", "sb", "stc",
  "ie", "eg", "us", "sw", "afms", "ica", "crs", "wo",
]);

function stripMarker(line: string): string {
  return line.replace(ORDERED_MARKER, "").replace(BULLET_MARKER, "").trim();
}

/** Split prose into sentences, re-joining false boundaries (decimals never
 *  split — no space after the dot; single-letter initials and known
 *  abbreviations are merged back). */
function toSentences(text: string): string[] {
  const raw = text.split(SENTENCE_SPLIT);
  const out: string[] = [];
  for (const piece of raw) {
    const prev = out[out.length - 1];
    if (prev !== undefined) {
      const lastWord = (prev.match(/([A-Za-z.]+)\.$/)?.[1] ?? "")
        .toLowerCase()
        .replace(/\./g, "");
      if (lastWord.length === 1 || ABBREVIATIONS.has(lastWord)) {
        out[out.length - 1] = `${prev} ${piece}`;
        continue;
      }
    }
    out.push(piece);
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

/** Turn segment content into an item: [lead sentence, ...capped body]. Overflow
 *  body sentences are returned separately to render after the list. */
function toItem(content: string): { item: string[]; overflow: string[] } {
  const sents = toSentences(content);
  const lead = sents[0] ?? content.trim();
  const body = sents.slice(1);
  return {
    item: [lead, ...body.slice(0, ITEM_BODY_CAP)],
    overflow: body.slice(ITEM_BODY_CAP),
  };
}

export function formatEntryText(input: string | null | undefined): EntryBlock[] {
  const text = (input ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const blocks: EntryBlock[] = [];
  let list: { ordered: boolean; items: string[][] } | null = null;
  const flushList = () => {
    if (list) {
      blocks.push({ type: "list", ordered: list.ordered, items: list.items });
      list = null;
    }
  };

  for (const para of text.split("\n").map((p) => p.trim()).filter(Boolean)) {
    // A line that starts with a bullet is a bullet-list item.
    if (BULLET_MARKER.test(para)) {
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      const { item } = toItem(stripMarker(para));
      list.items.push(item);
      continue;
    }

    // Inline numbered list? Requires at least two "N." segments so we don't
    // mistake a lone reference for a list.
    const segments = para.split(SEGMENT_SPLIT);
    if (segments.filter((s) => ORDERED_MARKER.test(s)).length >= 2) {
      const overflow: string[] = [];
      for (const seg of segments) {
        if (ORDERED_MARKER.test(seg)) {
          if (!list || !list.ordered) {
            flushList();
            list = { ordered: true, items: [] };
          }
          const { item, overflow: extra } = toItem(stripMarker(seg));
          list.items.push(item);
          overflow.push(...extra);
        } else {
          // Prose before the first marker (the header) → paragraphs.
          for (const s of toSentences(seg)) blocks.push({ type: "p", text: s });
        }
      }
      flushList();
      for (const o of overflow) blocks.push({ type: "p", text: o });
      continue;
    }

    // Plain prose paragraph → one block per sentence.
    flushList();
    for (const s of toSentences(para)) blocks.push({ type: "p", text: s });
  }

  flushList();
  return blocks;
}

/**
 * Normalize an AD reference (as typed by an owner or extracted from a logbook)
 * to the bare AD number the FAA sources expect: strip a leading "AD" / "A.D."
 * prefix and surrounding punctuation/whitespace. AD numbers never start with
 * "AD", so this is safe. E.g. "AD 2015-19-07" / "A.D.-79-10-14" -> "2015-19-07"
 * / "79-10-14".
 */
export function cleanAdNumber(reference: string): string {
  return reference
    .trim()
    .replace(/^a\.?\s*d\.?[-\s]*/i, "")
    .trim();
}

/** Compare two AD numbers ignoring case, whitespace, and a trailing revision. */
export function adNumbersMatch(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  const stripRev = (s: string) => norm(s).replace(/r\d+$/, "");
  return norm(a) === norm(b) || stripRev(a) === stripRev(b);
}

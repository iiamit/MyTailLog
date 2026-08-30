// How a page row in the pages list reports itself, and how that row changes
// when an extraction finishes.
//
// Both live here rather than inline in PagesPanel so the transition is testable:
// the badge once claimed a page was reviewed the moment it was extracted, and
// the cause was the client patch forgetting a field, not the rule below.

export type PageStatusRow = {
  extractionStatus: string;
  entryCount: number;
  unconfirmedCount: number;
};

/**
 * A page needs review when it still holds an entry nobody has confirmed.
 *
 * Deliberately NOT `review_status === 'unreviewed'`: a page that extracts to no
 * entries at all (a cover, a certificate, a blank) has nothing to review, and
 * counting those nagged forever with no way to clear them.
 */
export function pageNeedsReview(row: PageStatusRow): boolean {
  return row.extractionStatus === "extracted" && row.unconfirmedCount > 0;
}

/** What the extract endpoint tells us about the page afterwards. */
export type ExtractionResult = {
  entryCount?: number | null;
  unconfirmedCount?: number | null;
  detectedPageCount?: number | null;
};

/**
 * The row state after a successful extraction.
 *
 * `unconfirmedCount` is the field that matters and the one that used to be
 * missed: it is 0 before extraction because the page had no entries, so leaving
 * it alone while flipping extractionStatus to "extracted" made pageNeedsReview
 * false and rendered "✓ reviewed" on a page nobody had looked at.
 */
export function applyExtraction<T extends PageStatusRow>(row: T, result: ExtractionResult): T {
  return {
    ...row,
    extractionStatus: "extracted",
    extractionError: null,
    entryCount: result.entryCount ?? 0,
    unconfirmedCount: result.unconfirmedCount ?? 0,
    detectedPageCount: result.detectedPageCount ?? null,
  };
}

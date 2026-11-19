// W-MAINT-05 Records check: the words for each finding and how gaps split into open and settled
// (pure; tested in test/records-v2.test.ts).

export type GapStatusWord = "open" | "no_pages_exist" | "asked_previous_owner" | "dismissed" | "filled";
export const EXPLAIN_STATUSES = ["no_pages_exist", "asked_previous_owner", "dismissed"] as const;
export type ExplainStatus = (typeof EXPLAIN_STATUSES)[number];

export const EXPLAIN_LABEL: Record<ExplainStatus, string> = {
  no_pages_exist: "No pages exist for these years",
  asked_previous_owner: "I've asked the previous owner",
  dismissed: "It isn't a real gap",
};
const SETTLED_WORD: Record<ExplainStatus, string> = {
  no_pages_exist: "You marked: no pages exist.",
  asked_previous_owner: "You noted: asked the previous owner.",
  dismissed: "You marked: not a real gap.",
};
export const settledWord = (status: string) => SETTLED_WORD[status as ExplainStatus] ?? "";

/** Open gaps are findings; explained or dismissed ones go under "Settled"; filled ones are gone. */
export function splitGaps<G extends { status: string }>(gaps: G[]): { open: G[]; settled: G[] } {
  return {
    open: gaps.filter((g) => g.status === "open"),
    settled: gaps.filter((g) => (EXPLAIN_STATUSES as readonly string[]).includes(g.status)),
  };
}

/** "No airframe pages for 1983 to 1991" (one year: "for 1987"). */
export function gapTitle(bookName: string, from: string, to: string): string {
  const a = from.slice(0, 4), b = to.slice(0, 4);
  return `No ${bookName.toLowerCase()} pages for ${a === b ? a : `${a} to ${b}`}`;
}

/** The mis-keyed readings table's reason column. */
export function readingReason(reason: "non_monotonic" | "magnitude" | "duplicate", field: string, source: "entry" | "mfb"): string {
  const from = source === "mfb" ? "MyFlightBook · " : "";
  if (reason === "duplicate") return `${from}${field} is the same value as tach`;
  if (reason === "non_monotonic") return `${from}lower than an earlier reading`;
  return `${from}unusually large jump`;
}

/** What deleting a duplicate page loses, said before it happens (W-MAINT-05 acceptance). */
export function deletePageQuestion(label: string, entries: number, confirmed: number): string {
  const what = entries === 0 ? "It has no entries." : `Its ${entries} ${entries === 1 ? "entry goes" : "entries go"} with it${confirmed ? `, ${confirmed} of them confirmed by you` : ", none confirmed"}.`;
  return `Delete ${label}? ${what} This can't be undone.`;
}

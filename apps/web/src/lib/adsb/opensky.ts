// ===========================================================================
// OpenSky Network — the window arithmetic for /flights/aircraft.
//
// There is no HTTP client here any more. OpenSky's host blackholes Google Cloud
// egress (SYNs dropped from us-east4 and us-central1 alike), so the actual
// fetching runs on a GitHub-hosted runner — see .github/workflows/adsb-sweep.yml
// and the header of app/api/cron/adsb/route.ts.
//
// What stays server-side is the part that is easy to get wrong, and it is
// deliberately pure so it can be unit-tested without a network: the API's
// partition limit. GET /api/cron/adsb hands the runner windows that are already
// legal, so the runner never does this arithmetic itself.
// ===========================================================================

const DAY_S = 86_400;

/** Midnight UTC of the day containing `t` (unix seconds). */
export function startOfUtcDay(t: number): number {
  return Math.floor(t / DAY_S) * DAY_S;
}

/** How many UTC calendar days a [begin, end] window touches, endpoints included. */
export function utcDaySpan(begin: number, end: number): number {
  return Math.floor(end / DAY_S) - Math.floor(begin / DAY_S) + 1;
}

/**
 * Split [begin, end] into segments the API will actually accept.
 *
 * The real constraint is NOT "no more than 2 days of elapsed time" — that's what
 * the docs say, and reasoning in hours is how a 47h window shipped that the API
 * rejects with:
 *
 *   400 "You can only query across 2 partitions (days). Your query will
 *        naturally spill into the 3rd day."
 *
 * OpenSky partitions by UTC CALENDAR DAY and allows at most 2 partitions. A 47h
 * window ending before 23:00 UTC touches three of them, so it 400s on nearly
 * every run. So: reason in UTC dates, never in hours. Each segment is capped at
 * the last second before its begin-day + 2 days, which is exactly 2 partitions.
 */
export function windowChunks(begin: number, end: number): [number, number][] {
  const out: [number, number][] = [];
  for (let s = begin; s <= end; ) {
    const limit = startOfUtcDay(s) + 2 * DAY_S - 1; // inclusive last second of the 2nd day
    const e = Math.min(end, limit);
    out.push([s, e]);
    s = e + 1;
  }
  return out;
}

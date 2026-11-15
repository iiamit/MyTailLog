/**
 * First-touch sign-up attribution, first-party only.
 *
 * The proxy sets `mtl_src` for an anonymous visitor who arrives with `?ref=` /
 * `utm_*` or from another site, and only if the cookie isn't already set (first
 * touch wins). When a signed-in user still carries it, the proxy copies it onto
 * profile.signup_source if the account is under an hour old, then clears it, so
 * an existing user clicking a tagged link is never attributed.
 */

export const SOURCE_COOKIE = "mtl_src";
export const SOURCE_MAX_AGE_S = 90 * 86_400;
const CLAIM_WINDOW_MS = 60 * 60 * 1000;
const MAX_LEN = 64;

export type SignupSource = {
  ref?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  referrer_host?: string;
  landing: string;
  at: string;
};

const PARAMS = ["ref", "utm_source", "utm_medium", "utm_campaign"] as const;

/** Trim to a short, printable token. Anything else is dropped. */
function clean(v: string | null | undefined): string | undefined {
  if (!v) return undefined;
  const t = v.trim().slice(0, MAX_LEN);
  return /^[\w.\-:+ ]+$/.test(t) ? t : undefined;
}

/**
 * The source for this landing, or null when there is nothing to record (no tag
 * and no external referrer).
 */
export function sourceFromLanding(url: URL, referer: string | null, ownHost: string, now = new Date()): SignupSource | null {
  const out: SignupSource = { landing: url.pathname.slice(0, MAX_LEN), at: now.toISOString() };
  for (const k of PARAMS) {
    const v = clean(url.searchParams.get(k));
    if (v) out[k] = v;
  }
  if (referer) {
    try {
      const host = new URL(referer).hostname.replace(/^www\./, "");
      if (host && host !== ownHost.replace(/^www\./, "")) out.referrer_host = clean(host);
    } catch {
      // malformed Referer: ignore
    }
  }
  return PARAMS.some((k) => out[k]) || out.referrer_host ? out : null;
}

export function encodeSource(s: SignupSource): string {
  return Buffer.from(JSON.stringify(s)).toString("base64url");
}

/** Parses and re-validates a cookie value; returns null for anything malformed. */
export function decodeSource(value: string | undefined): SignupSource | null {
  if (!value || value.length > 1024) return null;
  try {
    const raw = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
    const out: SignupSource = {
      landing: typeof raw.landing === "string" ? raw.landing.slice(0, MAX_LEN) : "/",
      at: typeof raw.at === "string" && !Number.isNaN(Date.parse(raw.at)) ? raw.at : new Date(0).toISOString(),
    };
    for (const k of [...PARAMS, "referrer_host"] as const) {
      const v = clean(typeof raw[k] === "string" ? (raw[k] as string) : undefined);
      if (v) out[k] = v;
    }
    return out;
  } catch {
    return null;
  }
}

/** Only brand-new accounts are attributed. */
export function isFreshAccount(createdAt: string | undefined, now = Date.now()): boolean {
  const t = createdAt ? Date.parse(createdAt) : NaN;
  return Number.isFinite(t) && now - t >= 0 && now - t < CLAIM_WINDOW_MS;
}

/** Answers for "How did you hear about MyTailLog?" (mirrors the 0066 check). */
export const HEARD_ABOUT = [
  ["reddit", "Reddit"],
  ["facebook_group", "Facebook group"],
  ["forum", "Pilots of America / forum"],
  ["type_club", "Type club"],
  ["search", "Search"],
  ["app_store", "App Store / Play"],
  ["friend_or_mechanic", "Friend or mechanic"],
  ["myflightbook", "MyFlightBook"],
  ["other", "Other"],
] as const;

export type HeardAbout = (typeof HEARD_ABOUT)[number][0] | "dismissed";

export function isHeardAbout(v: unknown): v is HeardAbout {
  return v === "dismissed" || HEARD_ABOUT.some(([k]) => k === v);
}

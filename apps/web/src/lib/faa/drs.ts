// ===========================================================================
// FAA Dynamic Regulatory System (DRS) client — the fallback for legacy ADs the
// Federal Register API doesn't carry (pre-1994). DRS has no official public
// API, so this replicates the same anonymous "guest" search the DRS website
// performs, server-side:
//
//   1. GET /                                  -> session + Akamai cookies
//   2. GET /guest/login?targetUrl=/search     -> 302, mints a guest JWT cookie
//   3. POST /api/drs/search/simpleSearch       -> results (JSON)
//
// This is an UNOFFICIAL internal endpoint, so it's best-effort: any failure
// returns null and the caller degrades to manual entry — it must never throw
// into the app. The guest session is cached until its JWT nears expiry to keep
// request volume low (be a good citizen). Results are cached in ad_reference.
// ===========================================================================

import { cleanAdNumber, adNumbersMatch } from "./adNumber";

const ORIGIN = "https://drs.faa.gov";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";

type Session = { cookie: string; jwt: string; expMs: number };
let cachedSession: Session | null = null;

function cookiesFrom(headers: Headers, jar: Map<string, string>): void {
  // Node/undici exposes multiple Set-Cookie via getSetCookie().
  const list =
    (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  for (const c of list) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}

function jwtExpiryMs(jwt: string): number {
  try {
    const payload = JSON.parse(
      Buffer.from(jwt.split(".")[1], "base64").toString("utf8"),
    );
    return typeof payload.exp === "number" ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

async function mintSession(): Promise<Session> {
  const jar = new Map<string, string>();
  const home = await fetch(ORIGIN + "/", {
    headers: { "user-agent": UA },
    signal: AbortSignal.timeout(8000),
  });
  cookiesFrom(home.headers, jar);
  const login = await fetch(ORIGIN + "/guest/login?targetUrl=/search", {
    headers: { "user-agent": UA, cookie: cookieStr(jar), referer: ORIGIN + "/search" },
    redirect: "manual",
    signal: AbortSignal.timeout(8000),
  });
  cookiesFrom(login.headers, jar);
  const jwt = jar.get("jwt");
  if (!jwt) throw new Error("DRS guest login returned no token.");
  return { cookie: cookieStr(jar), jwt, expMs: jwtExpiryMs(jwt) };
}

function cookieStr(jar: Map<string, string>): string {
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function getSession(force = false): Promise<Session> {
  if (!force && cachedSession && cachedSession.expMs - Date.now() > 60_000) {
    return cachedSession;
  }
  cachedSession = await mintSession();
  return cachedSession;
}

type DrsDoc = {
  headerLink?: { metadataValue?: string };
  description?: { attivioField?: string; metadataValue?: string }[];
  subText?: { attivioField?: string; metadataValue?: string }[];
  status?: string;
  docUniqueId?: string;
};

async function simpleSearch(text: string, rowCount = 25): Promise<DrsDoc[]> {
  const body = JSON.stringify({
    searchText: [`"${text}"`],
    sort: ["Relevance"],
    fuzzy: false,
    offSet: 0,
    rowCount: String(rowCount),
    filtersAfterSearchApplied: false,
    filtersAfterSearch: {
      documentType: [],
      status: [],
      searchOptions: [],
      publishedDate: { start: "", end: "" },
      effectiveDate: { start: "", end: "" },
    },
  });

  async function post(session: Session): Promise<Response> {
    return fetch(ORIGIN + "/api/drs/search/simpleSearch", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/plain, */*",
        origin: ORIGIN,
        referer: ORIGIN + "/search",
        "user-agent": UA,
        cookie: session.cookie,
        jwt: session.jwt,
        user: "G",
      },
      body,
      signal: AbortSignal.timeout(10000),
    });
  }

  let res = await post(await getSession());
  if (res.status === 401 || res.status === 403) {
    res = await post(await getSession(true)); // token expired/rejected — re-mint once
  }
  if (!res.ok) throw new Error(`DRS search returned ${res.status}.`);
  const json = (await res.json()) as { documents?: DrsDoc[] };
  return json.documents ?? [];
}

export type DrsAd = {
  adNumber: string;
  title: string | null;
  status: string | null;
  docUniqueId: string;
  viewUrl: string;
};

// DRS wraps the matched term in <span class='highlight'>…</span> — strip any
// markup before matching or storing.
//
// Applied to a fixed point rather than once: a single pass over `<sc<b>ript>`
// removes the inner tag and LEAVES `<script>` behind, so one pass can construct
// the very markup it was meant to remove (CodeQL
// js/incomplete-multi-character-sanitization). Nothing here reaches innerHTML —
// React escapes it — but a sanitizer that can be walked past is not one worth
// keeping.
const stripTags = (s: string | undefined | null) => {
  let out = s ?? "";
  for (let prev = ""; out !== prev; ) {
    prev = out;
    out = out.replace(/<[^>]*>/g, "");
  }
  return out.trim();
};
const attivio = (
  arr: { attivioField?: string; metadataValue?: string }[] | undefined,
  field: string,
) => {
  const v = arr?.find((x) => x.attivioField === field)?.metadataValue;
  return v ? stripTags(v) : null;
};

// --- Search by term (make/model/keyword) -----------------------------------
// DRS earns its keep here for one reason: the Federal Register archive starts in
// 1994, so a model search there structurally cannot return the legacy ADs a
// 1978 airframe most cares about. A DRS term search does — 64-24-04, 77-16-01,
// 92-12-05 all come back for "Cessna 172" — and it carries a document status
// (Current / superseded) the FR API doesn't expose.
//
// The documentType filter in the search payload silently returns zero results
// for every value we tried (label AND code), so we filter by the sourceText
// field on the way out instead.

/** DRS document types that are Airworthiness Directives. */
const AD_SOURCE_TYPE = /^(?:AD Final Rules|Emergency ADs)/i;

/** AD numbers look like 'YY-MM-NN' or 'YYYY-MM-NN'; DRS mixes in STC/PMA ids. */
const AD_NUMBER_SHAPE = /^(?:\d{2}|\d{4})-\d{2}-\d{2}/;

export type DrsSearchAd = DrsAd & {
  publishedOn: string | null; // YYYY-MM-DD
  effectiveOn: string | null;
};

const isoDate = (v: string | null) => (v && v.length >= 10 ? v.slice(0, 10) : null);

/**
 * Search DRS for ADs matching a make/model/keyword term. Best-effort like the
 * rest of this client: returns [] on ANY failure so the Federal Register path
 * (which runs in the browser, separately) still carries the search.
 */
export async function searchADsInDRS(
  term: string,
  rowCount = 40,
): Promise<DrsSearchAd[]> {
  try {
    if (!term.trim()) return [];
    const docs = await simpleSearch(term.trim(), rowCount);
    const out: DrsSearchAd[] = [];
    const seen = new Set<string>();
    for (const d of docs) {
      const sourceType = attivio(d.subText, "sourceType") ?? "";
      if (!AD_SOURCE_TYPE.test(sourceType)) continue;
      const adNumber = stripTags(d.headerLink?.metadataValue);
      if (!adNumber || !AD_NUMBER_SHAPE.test(adNumber) || !d.docUniqueId) continue;
      const key = adNumber.replace(/\s+/g, "").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        adNumber,
        title: attivio(d.description, "title"),
        status: d.status ?? null,
        docUniqueId: d.docUniqueId,
        viewUrl: `${ORIGIN}/browse/excelExternalWindow/${d.docUniqueId}`,
        publishedOn: isoDate(attivio(d.subText, "docPublishedDate")),
        effectiveOn: isoDate(attivio(d.subText, "docEffectivedate")),
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Find an AD in DRS by number. Matches the result whose document number equals
 * the AD number (case/whitespace/revision-insensitive, after stripping DRS's
 * highlight markup). Returns null on no match or ANY error — the caller treats
 * DRS as best-effort.
 */
export async function getADFromDRS(adNumber: string): Promise<DrsAd | null> {
  try {
    const clean = cleanAdNumber(adNumber);
    if (!clean) return null;
    const docs = await simpleSearch(clean);
    const pick = docs.find((d) => {
      const n = stripTags(d.headerLink?.metadataValue);
      return n && adNumbersMatch(n, clean);
    });
    if (!pick || !pick.docUniqueId) return null;
    return {
      adNumber: stripTags(pick.headerLink?.metadataValue) || clean,
      title: attivio(pick.description, "title"),
      status: pick.status ?? null,
      docUniqueId: pick.docUniqueId,
      viewUrl: `${ORIGIN}/browse/excelExternalWindow/${pick.docUniqueId}`,
    };
  } catch {
    return null;
  }
}

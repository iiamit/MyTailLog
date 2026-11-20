/**
 * Direction D ("ui_v2") routing. From phase 6 the new design is the default (13-build-plan §6); an owner who chose
 * "Switch back" carries UI_COOKIE=v1 and keeps the current design. The proxy rewrites the URLs the new design covers
 * to the internal /v2 tree, so v1 and v2 share every public URL (03 §9). Everything not covered keeps rendering v1.
 */
export const UI_COOKIE = "mtl_ui";
export const THEME_COOKIE = "mtl_theme";
export const UI_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365;

/**
 * The cut-over switch. On: everyone without a choice sees the new design. Set UI_V2_DEFAULT=off in the server
 * environment (or change this line) to make the current design the default again; a browser's own choice still wins.
 */
export const UI_V2_DEFAULT = process.env.UI_V2_DEFAULT !== "off";

/** Whether this browser gets the new design: its own choice first ("Try the new design" / "Switch back"), then the default. */
export function wantsV2(cookie: string | undefined, byDefault = UI_V2_DEFAULT): boolean {
  return cookie === "v2" || (cookie !== "v1" && byDefault);
}

export type Section = "status" | "books" | "maint" | "aircraft" | "docs" | "share" | "setup";
export type Theme = "system" | "light" | "dark";

/** First path segment under /aircraft/[id] → the binder section it belongs to (03 §4). */
const SEGMENT_SECTION: Record<string, Section> = {
  status: "status",
  setup: "status",
  logbooks: "books",
  ask: "books",
  maintenance: "maint",
  hours: "aircraft",
  oil: "aircraft",
  equipment: "aircraft",
  "weight-balance": "aircraft",
  details: "aircraft",
  documents: "docs",
  share: "share",
};

export function sectionFor(segment: string | null | undefined): Section | null {
  return (segment && SEGMENT_SECTION[segment]) || null;
}

// Per-aircraft paths the v2 tree serves. The section landings exist for every section from phase 0; deeper
// screens are added here as their phase lands, so an unbuilt screen keeps working in v1.
const V2_AIRCRAFT =
  /^\/aircraft\/([^/]+)(?:\/(?:status|setup|logbooks|ask|maintenance|hours|oil|equipment|weight-balance|details|documents|share)|\/status\/(?:plan|item\/[^/]+)|\/share\/(?:dossier|summary)|\/logbooks\/(?:map|list|pages|add|review(?:\/[^/]+)?|entries\/[^/]+)|\/maintenance\/(?:items|ads(?:\/find)?|squawks|annual|records-check))?\/?$/;

// Account-level screens (03 §9.2), new in the v2 tree.
const V2_ACCOUNT = /^\/(?:hangar|account(?:\/(?:settings|data))?|aircraft\/new)\/?$/;

/** The internal /v2 path for a request, or null when v1 should render it. */
export function v2Rewrite(pathname: string): string | null {
  if (V2_ACCOUNT.test(pathname)) return `/v2${pathname.replace(/\/$/, "")}`;
  const m = V2_AIRCRAFT.exec(pathname);
  if (!m || m[1] === "enroll" || m[1] === "new") return null;
  return `/v2${pathname.replace(/\/$/, "")}`;
}

// Today's routes the new design fully replaces (03 §10.1–10.2). Left out, so they keep rendering v1: /import (the
// CSV wizard is still v1).
const ACCOUNT_MOVES: Record<string, string> = {
  "/dashboard": "/hangar",
  "/aircraft/enroll": "/aircraft/new",
  "/profile": "/account/settings",
  "/profile/credentials": "/account/settings#signing",
};
// /start is not moved: v1 reads the last annual straight from a scanned page, which /setup does not do yet.
const AIRCRAFT_MOVES: Record<string, string> = {
  compliance: "maintenance/ads",
  "compliance/explore": "maintenance/ads/find",
  squawks: "maintenance/squawks",
  capture: "logbooks/add?capture=1",
  upload: "logbooks/add",
  pages: "logbooks/pages",
  review: "logbooks/review",
  meters: "hours",
  "oil-analysis": "oil",
  timeline: "logbooks/map",
  duplicates: "maintenance/records-check",
  audit: "maintenance/records-check",
  annual: "maintenance/annual",
  summary: "share/summary",
  prebuy: "share/dossier",
};

/** Where a v1 URL lives in the new design (308), or null when it is unchanged or not covered yet. */
export function v1ToV2(pathname: string, search: URLSearchParams): string | null {
  const path = pathname.replace(/\/$/, "") || "/";
  if (ACCOUNT_MOVES[path]) return ACCOUNT_MOVES[path];
  const m = /^\/aircraft\/([^/]+)\/(.+)$/.exec(path);
  if (!m || m[1] === "enroll" || m[1] === "new") return null;
  const a = `/aircraft/${m[1]}`;
  const rest = m[2];
  if (rest === "export") return `/account/data?aircraft=${encodeURIComponent(m[1])}#export`;
  if (rest === "entries/new") return `${a}/logbooks/entries/new${search.toString() ? `?${search}` : ""}`;
  const entry = search.get("entry");
  if (rest === "timeline" && entry) return `${a}/logbooks/map?stop=${encodeURIComponent(entry)}`;
  if (AIRCRAFT_MOVES[rest]) return `${a}/${AIRCRAFT_MOVES[rest]}`;
  const page = /^pages\/([^/]+)\/review$/.exec(rest);
  if (page) return `${a}/logbooks/review/${page[1]}`;
  const one = /^entries\/([^/]+)$/.exec(rest);
  if (one && one[1] !== "new") return `${a}/logbooks/entries/${one[1]}`;
  return null;
}

/** The current design's page for a URL that exists only in the new design, for owners who switched back. */
export function v2ToV1(pathname: string, search: URLSearchParams): string | null {
  const path = pathname.replace(/\/$/, "") || "/";
  if (path === "/hangar") return "/dashboard";
  if (path === "/aircraft/new") return "/aircraft/enroll";
  if (path === "/account" || path === "/account/settings") return "/profile";
  if (path === "/account/data") {
    const id = search.get("aircraft");
    return id ? `/aircraft/${encodeURIComponent(id)}/export` : "/profile";
  }
  const setup = /^\/aircraft\/([^/]+)\/setup$/.exec(path);
  return setup ? `/aircraft/${setup[1]}/start` : null;
}

export function parseTheme(value: string | undefined): Theme {
  return value === "light" || value === "dark" ? value : "system";
}

/** A same-origin relative path, or the fallback. Guards the opt-in redirect against open redirects. */
export function safeNext(next: string | null, fallback = "/dashboard"): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}

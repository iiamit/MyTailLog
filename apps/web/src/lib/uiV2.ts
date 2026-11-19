/**
 * Direction D ("ui_v2") opt-in routing. Owners who chose "Try the new design" carry UI_COOKIE=v2; the proxy
 * rewrites the URLs the new design covers to the internal /v2 tree, so v1 and v2 share every public URL
 * (13-build-plan §6, 03 §9). Everything not covered keeps rendering v1.
 */
export const UI_COOKIE = "mtl_ui";
export const THEME_COOKIE = "mtl_theme";
export const UI_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365;

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
  /^\/aircraft\/([^/]+)(?:\/(?:status|logbooks|maintenance|hours|documents|share)|\/status\/item\/[^/]+|\/logbooks\/(?:map|list|review(?:\/[^/]+)?|entries\/(?!new\/?$)[^/]+))?\/?$/;

/** The internal /v2 path for a request, or null when v1 should render it. */
export function v2Rewrite(pathname: string): string | null {
  const m = V2_AIRCRAFT.exec(pathname);
  if (!m || m[1] === "enroll") return null;
  return `/v2${pathname.replace(/\/$/, "")}`;
}

export function parseTheme(value: string | undefined): Theme {
  return value === "light" || value === "dark" ? value : "system";
}

/** A same-origin relative path, or the fallback. Guards the opt-in redirect against open redirects. */
export function safeNext(next: string | null, fallback = "/dashboard"): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}

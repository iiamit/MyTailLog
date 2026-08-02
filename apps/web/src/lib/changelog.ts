// ===========================================================================
// CHANGELOG.md → structured releases for the public /whats-new page.
//
// The changelog lives at the REPO ROOT, outside apps/web, so Next's file
// tracing never bundles it: an fs read here would work in dev and 500 on App
// Hosting. next.config.mjs instead reads it once and inlines it as
// process.env.CHANGELOG_MD (a build-time string substitution), which is why
// this module is a pure parser over a string rather than a file read.
//
// ponytail: hand-rolled over our own known format instead of adding a markdown
// dependency. Only what CHANGELOG.md actually uses is supported — `## version`,
// `### Verb — topic`, "- " bullets, **bold**, `code`, [text](url). Anything
// else falls through as plain text rather than breaking the page.
// ===========================================================================

export type ChangeTag = "New" | "Improved" | "Fixed" | "Security";

export type ChangeGroup = {
  /** The H3 topic, e.g. "Native iOS app (offline-first, beta)". */
  topic: string;
  tag: ChangeTag;
  /** One raw-markdown string per bullet (wrapped lines already rejoined). */
  items: string[];
};

export type Release = {
  /** The `##` heading verbatim, e.g. "2026.07" — matches APP_VERSION. */
  version: string;
  /** Calendar version rendered long-form ("July 2026"); null if not YYYY.MM. */
  dateLabel: string | null;
  groups: ChangeGroup[];
};

// Keep-a-Changelog verbs → the three tags the page shows (plus Security, which
// we call out rather than folding into "Fixed"). Unknown headings — e.g.
// "Earlier in 2026.07" — read as feature lists, so they default to New.
const TAG_BY_VERB: Record<string, ChangeTag> = {
  added: "New",
  changed: "Improved",
  removed: "Improved",
  deprecated: "Improved",
  fixed: "Fixed",
  security: "Security",
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function dateLabelOf(version: string): string | null {
  const m = /^(\d{4})\.(\d{1,2})/.exec(version);
  if (!m) return null;
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? `${MONTHS[month - 1]} ${m[1]}` : null;
}

/** Split "Added — Open API & integrations" into its tag and its topic. */
function headingParts(heading: string): { tag: ChangeTag; topic: string } {
  const dash = heading.indexOf("—");
  const verb = (dash === -1 ? heading : heading.slice(0, dash)).trim().toLowerCase();
  const topic = dash === -1 ? heading : heading.slice(dash + 1).trim();
  const tag = TAG_BY_VERB[verb];
  // No recognised verb → the whole heading is the topic (e.g. "Security",
  // "Earlier in 2026.07"), not a stray fragment before an em-dash.
  return tag ? { tag, topic: topic || heading } : { tag: "New", topic: heading };
}

export function parseChangelog(md: string): Release[] {
  const releases: Release[] = [];
  let release: Release | null = null;
  let group: ChangeGroup | null = null;
  // True while the previous line was a bullet, so an indented wrapped line
  // belongs to it. A blank line or any unindented prose closes it.
  let inBullet = false;

  for (const line of md.split("\n")) {
    if (line.startsWith("### ")) {
      const { tag, topic } = headingParts(line.slice(4).trim());
      group = { topic, tag, items: [] };
      release?.groups.push(group);
      inBullet = false;
      continue;
    }
    if (line.startsWith("## ")) {
      const version = line.slice(3).trim();
      release = { version, dateLabel: dateLabelOf(version), groups: [] };
      releases.push(release);
      group = null;
      inBullet = false;
      continue;
    }
    // Intro paragraph, the "# Changelog" title, and the trailing "see the git
    // log" note all land here — outside any group, so they're dropped.
    if (!group) continue;

    if (line.startsWith("- ")) {
      group.items.push(line.slice(2).trim());
      inBullet = true;
      continue;
    }
    if (inBullet && /^\s+\S/.test(line)) {
      group.items[group.items.length - 1] += " " + line.trim();
      continue;
    }
    inBullet = false;
  }

  return releases.filter((r) => r.groups.some((g) => g.items.length > 0));
}

// --- inline markdown -------------------------------------------------------

export type InlineToken =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string };

// A relative link in the changelog points at a file in the REPO (docs/*.md),
// not a route on the site — it would 404 on mytaillog.com. Rewrite those to
// GitHub so every link on /whats-new resolves.
const REPO_BLOB = "https://github.com/iiamit/MyTailLog/blob/main/";

function resolveHref(href: string): string {
  return /^(https?:|mailto:|#)/i.test(href)
    ? href
    : REPO_BLOB + href.replace(/^\.?\//, "");
}

const INLINE = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

/**
 * Tokenize one bullet's markdown. Returns data, not HTML — the page renders
 * these as React elements, so nothing is ever injected as raw markup.
 */
export function parseInline(s: string): InlineToken[] {
  const out: InlineToken[] = [];
  let last = 0;
  for (const m of s.matchAll(INLINE)) {
    if (m.index > last) out.push({ kind: "text", text: s.slice(last, m.index) });
    if (m[1] != null) out.push({ kind: "bold", text: m[1] });
    else if (m[2] != null) out.push({ kind: "code", text: m[2] });
    else out.push({ kind: "link", text: m[3], href: resolveHref(m[4]) });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ kind: "text", text: s.slice(last) });
  return out;
}

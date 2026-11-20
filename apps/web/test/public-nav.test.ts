import { test } from "node:test";
import assert from "node:assert/strict";
import { PUBLIC_GROUPS, isCurrentPage, visiblePages } from "../src/lib/publicNav";
import { parseChangelog } from "../src/lib/changelog";

test("public nav: five groups, one per section hue, each with a page a signed-out tab can open", () => {
  assert.equal(PUBLIC_GROUPS.length, 5);
  assert.equal(new Set(PUBLIC_GROUPS.map((g) => g.section)).size, 5);
  for (const g of PUBLIC_GROUPS) {
    assert.ok(g.pages.some((p) => !p.href.includes("#") && !p.signedIn), `${g.id} has a public non-anchor page`);
    assert.ok(!g.pages.find((p) => !p.href.includes("#"))!.signedIn, `${g.id} tab opens a public page`);
  }
});

test("public nav: API keys show only to signed-in readers", () => {
  const dev = PUBLIC_GROUPS.find((g) => g.pages.some((p) => p.href === "/developers"))!;
  assert.equal(visiblePages(dev, false).some((p) => p.href === "/developers"), false);
  assert.equal(visiblePages(dev, true).some((p) => p.href === "/developers"), true);
});

test("public nav: every public page is listed once", () => {
  const hrefs = PUBLIC_GROUPS.flatMap((g) => g.pages.map((p) => p.href));
  assert.equal(new Set(hrefs).size, hrefs.length);
  for (const p of ["/", "/demo", "/compare", "/switch/myfbo", "/guides/digitize-aircraft-logbooks", "/help", "/help#sharing", "/faq", "/ads", "/developers/docs", "/developers", "/whats-new", "/privacy", "/account-deletion"]) {
    assert.ok(hrefs.includes(p), `${p} is in the nav`);
  }
});

test("public nav: an anchor link is never the current page", () => {
  assert.equal(isCurrentPage("/help", "/help"), true);
  assert.equal(isCurrentPage("/help#sharing", "/help"), false);
  assert.equal(isCurrentPage("/faq", "/help"), false);
});

test("changelog: Improved and Released headings keep their tag and topic", () => {
  const [r] = parseChangelog("## 2026.11\n\n### Improved — status\n- a\n\n### Released — Android\n- b\n");
  assert.deepEqual(r.groups.map((g) => [g.tag, g.topic]), [["Improved", "status"], ["New", "Android"]]);
});

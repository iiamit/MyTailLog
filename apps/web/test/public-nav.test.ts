import { test } from "node:test";
import assert from "node:assert/strict";
import { PUBLIC_GROUPS, isCurrentPage } from "../src/lib/publicNav";
import { parseChangelog } from "../src/lib/changelog";

test("public nav: six groups, one per section hue, each with a page a tab can open", () => {
  assert.equal(PUBLIC_GROUPS.length, 6);
  assert.equal(new Set(PUBLIC_GROUPS.map((g) => g.section)).size, 6);
  for (const g of PUBLIC_GROUPS) assert.ok(g.pages.some((p) => !p.href.includes("#")), `${g.id} has a non-anchor page`);
});

test("public nav: every public page is listed once", () => {
  const hrefs = PUBLIC_GROUPS.flatMap((g) => g.pages.map((p) => p.href));
  assert.equal(new Set(hrefs).size, hrefs.length);
  for (const p of ["/", "/demo", "/compare", "/switch/myfbo", "/help", "/faq", "/ads", "/developers/docs", "/whats-new", "/privacy", "/account-deletion"]) {
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

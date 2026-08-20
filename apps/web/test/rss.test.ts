import { test } from "node:test";
import assert from "node:assert/strict";
import { GET } from "../src/app/whats-new/rss.xml/route";

test("RSS emits escaped, stable release links", async () => {
  const previous = process.env.CHANGELOG_MD;
  process.env.CHANGELOG_MD = "## 2026.08\n### Added — A & B\n- Safer <records>";
  try {
    const response = GET();
    const body = await response.text();
    assert.equal(response.headers.get("content-type"), "application/rss+xml; charset=utf-8");
    assert.match(body, /whats-new#2026.08/);
    assert.match(body, /A &amp; B: Safer &lt;records&gt;/);
  } finally {
    if (previous == null) delete process.env.CHANGELOG_MD;
    else process.env.CHANGELOG_MD = previous;
  }
});

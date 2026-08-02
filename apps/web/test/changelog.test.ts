import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseChangelog, parseInline } from "../src/lib/changelog";
import { APP_VERSION } from "../src/lib/version";

// The real file, so the parser is checked against the format we actually ship
// rather than a fixture that can drift away from it.
const REAL = readFileSync(new URL("../../../CHANGELOG.md", import.meta.url), "utf8");

test("parses the real CHANGELOG.md into releases with tagged groups", () => {
  const releases = parseChangelog(REAL);
  assert.ok(releases.length > 0, "expected at least one release");

  // The newest release must be the one APP_VERSION claims — the header chip
  // links here, so a mismatch would show users the wrong release.
  assert.equal(releases[0].version, APP_VERSION);
  assert.equal(releases[0].dateLabel, "July 2026");

  const groups = releases[0].groups;
  assert.ok(groups.length > 0);
  assert.ok(groups.every((g) => g.items.length > 0), "no group should be empty");

  // The format uses "Added —", "Changed —", "Fixed —" and a bare "Security".
  const tags = new Set(groups.map((g) => g.tag));
  assert.ok(tags.has("New") && tags.has("Improved") && tags.has("Fixed") && tags.has("Security"));

  // "### Added — Open API & integrations" → topic without the verb.
  const api = groups.find((g) => g.topic === "Open API & integrations");
  assert.ok(api, "expected the em-dash heading to split verb from topic");
  assert.equal(api.tag, "New");

  // A bare "### Security" heading keeps the whole heading as its topic.
  const sec = groups.find((g) => g.tag === "Security");
  assert.equal(sec?.topic, "Security");

  // Prose outside any group (intro, trailing "see the git log") is dropped.
  const all = groups.flatMap((g) => g.items).join("\n");
  assert.ok(!all.includes("Notable changes to MyTailLog"));
  assert.ok(!all.includes("For the full engineering history"));
});

test("rejoins wrapped bullet lines into one item", () => {
  const md = [
    "## 2026.07",
    "",
    "### Added — Stuff",
    "- **One.** first line",
    "  continued here",
    "- Two",
    "",
    "trailing prose",
  ].join("\n");
  const [rel] = parseChangelog(md);
  assert.deepEqual(rel.groups[0].items, ["**One.** first line continued here", "Two"]);
});

test("parseInline tokenizes bold, code and links without emitting markup", () => {
  const tokens = parseInline("A **bold** bit, `code`, and [a doc](docs/x.md) plus [ext](https://e.com).");
  assert.deepEqual(
    tokens.filter((t) => t.kind !== "text"),
    [
      { kind: "bold", text: "bold" },
      { kind: "code", text: "code" },
      // Relative repo paths would 404 on the site — rewritten to GitHub.
      { kind: "link", text: "a doc", href: "https://github.com/iiamit/MyTailLog/blob/main/docs/x.md" },
      { kind: "link", text: "ext", href: "https://e.com" },
    ],
  );
  // Round-trips: no character is dropped or duplicated.
  assert.equal(
    tokens.map((t) => t.text).join(""),
    "A bold bit, code, and a doc plus ext.",
  );
});

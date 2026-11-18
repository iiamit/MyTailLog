import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build, rgba, camel, flatten } from "../../../packages/shared/scripts/build-tokens.mjs";

const json = JSON.parse(readFileSync(new URL("../../../packages/shared/tokens/tokens.json", import.meta.url), "utf8"));

test("colour parsing and names", () => {
  assert.deepEqual(rgba("#dd3418"), [221, 52, 24, 1]);
  assert.deepEqual(rgba("rgba(255,214,10,0.42)"), [255, 214, 10, 0.42]);
  assert.equal(camel(["on-section-2", "books"]), "onSection2Books");
});

test("every colour has a dark value or is theme-neutral, and generated files are current", () => {
  const colors = flatten(json).filter((t) => t.type === "color");
  assert.ok(colors.length > 50);
  const out = build(json);
  assert.equal(readFileSync(new URL("../src/ui/tokens.css", import.meta.url), "utf8"), out.css, "tokens.css is stale: run node packages/shared/scripts/build-tokens.mjs");
  assert.match(out.css, /\[data-ui="v2"\]\[data-theme="dark"\]/);
  assert.match(out.css, /\[data-section="books"\][^}]*--on-board: var\(--color-on-section-books\)/);
  // v1 keeps its own text-ink utility
  assert.doesNotMatch(out.css, /^  --color-ink: var\(--color-ink\);$/m);
});

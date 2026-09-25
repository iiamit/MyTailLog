import test from "node:test";
import assert from "node:assert/strict";
import { dismissTopSheet } from "../../mobile/src/android-back";

test("Android Back dismisses the uppermost sheet before navigating", () => {
  const clicked: string[] = [];
  const sheet = (name: string, zIndex: string) => ({ style: { zIndex }, click: () => clicked.push(name) });
  assert.equal(dismissTopSheet([]), false);
  assert.equal(dismissTopSheet([sheet("base", "60"), sheet("confirm", "70")]), true);
  assert.deepEqual(clicked, ["confirm"]);
  assert.equal(dismissTopSheet([sheet("first", "60"), sheet("last", "60")]), true);
  assert.deepEqual(clicked, ["confirm", "last"]);
});

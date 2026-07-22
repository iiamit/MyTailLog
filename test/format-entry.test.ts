import { test } from "node:test";
import assert from "node:assert/strict";
import { formatEntryText, type EntryBlock } from "../src/lib/formatEntry";

const ps = (blocks: EntryBlock[]) =>
  blocks.filter((b): b is Extract<EntryBlock, { type: "p" }> => b.type === "p").map((b) => b.text);
const lists = (blocks: EntryBlock[]) =>
  blocks.filter((b): b is Extract<EntryBlock, { type: "list" }> => b.type === "list");

test("formatEntryText: null/empty/whitespace → no blocks", () => {
  assert.deepEqual(formatEntryText(null), []);
  assert.deepEqual(formatEntryText(undefined), []);
  assert.deepEqual(formatEntryText(""), []);
  assert.deepEqual(formatEntryText("   \n  "), []);
});

test("formatEntryText: a single sentence → one paragraph", () => {
  assert.deepEqual(formatEntryText("Ground run good."), [{ type: "p", text: "Ground run good." }]);
});

test("formatEntryText: two sentences split into two paragraphs", () => {
  const b = formatEntryText("Replaced magneto. Ground run good.");
  assert.deepEqual(ps(b), ["Replaced magneto.", "Ground run good."]);
  assert.equal(lists(b).length, 0);
});

test("formatEntryText: a decimal is NOT a sentence boundary", () => {
  const b = formatEntryText("Tach reads 4110.4 at inspection.");
  assert.deepEqual(ps(b), ["Tach reads 4110.4 at inspection."]);
});

test("formatEntryText: a known abbreviation does not end a sentence", () => {
  // "no." is in the abbreviation set → the split after it is re-joined.
  const b = formatEntryText("Replaced no. 1 cylinder. Ground run good.");
  assert.deepEqual(ps(b), ["Replaced no. 1 cylinder.", "Ground run good."]);
});

test("formatEntryText: bullet lines become an unordered list", () => {
  const b = formatEntryText("- checked oil\n- checked tires");
  const l = lists(b);
  assert.equal(l.length, 1);
  assert.equal(l[0].ordered, false);
  assert.deepEqual(l[0].items, [["checked oil"], ["checked tires"]]);
});

test("formatEntryText: two+ inline numbered markers become an ordered list; leading prose stays a paragraph", () => {
  const b = formatEntryText("Annual inspection performed 1. Checked ADs. 2. Serviced battery.");
  assert.deepEqual(ps(b), ["Annual inspection performed"]);
  const l = lists(b);
  assert.equal(l.length, 1);
  assert.equal(l[0].ordered, true);
  assert.deepEqual(l[0].items, [["Checked ADs."], ["Serviced battery."]]);
});

test("formatEntryText: a lone numbered reference is NOT a list (needs >=2 markers)", () => {
  const b = formatEntryText("Complied with AD 2024-01 per 1. of the service bulletin.");
  assert.equal(lists(b).length, 0);
  assert.ok(ps(b).length >= 1);
});

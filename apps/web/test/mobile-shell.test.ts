import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chordOf,
  registerShortcuts,
  resolveShortcut,
  sizeClassFor,
  REGULAR_MIN_WIDTH,
  type ShortcutMap,
} from "../../mobile/src/shortcuts";

const key = (key: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

test("size class: iPad half-split (≈ 507pt) stays compact, full-screen is regular", () => {
  assert.equal(sizeClassFor(390), "compact"); // iPhone
  assert.equal(sizeClassFor(507), "compact"); // iPad 11\" half Split View
  assert.equal(sizeClassFor(REGULAR_MIN_WIDTH - 1), "compact");
  assert.equal(sizeClassFor(REGULAR_MIN_WIDTH), "regular");
  assert.equal(sizeClassFor(834), "regular"); // iPad 11\" portrait
  assert.equal(sizeClassFor(1194), "regular"); // landscape
});

test("chords: ⌘ (or Ctrl) plus the known keys, nothing else", () => {
  assert.equal(chordOf(key("Enter", { metaKey: true })), "cmd+enter");
  assert.equal(chordOf(key("ArrowRight", { metaKey: true })), "cmd+right");
  assert.equal(chordOf(key("ArrowLeft", { ctrlKey: true })), "cmd+left");
  assert.equal(chordOf(key("n", { metaKey: true })), "cmd+n");
  assert.equal(chordOf(key("N", { metaKey: true })), "cmd+n");
  assert.equal(chordOf(key("f", { metaKey: true })), "cmd+f");
  assert.equal(chordOf(key("1", { metaKey: true })), "cmd+1");
  assert.equal(chordOf(key("4", { metaKey: true })), "cmd+4");
  // Not ours.
  assert.equal(chordOf(key("5", { metaKey: true })), null);
  assert.equal(chordOf(key("n")), null);
  assert.equal(chordOf(key("n", { metaKey: true, shiftKey: true })), null);
  assert.equal(chordOf(key("n", { metaKey: true, altKey: true })), null);
  assert.equal(chordOf(key("Enter")), null);
});

test("chords: ⌘←/→ keep their caret meaning inside a text field", () => {
  assert.equal(chordOf(key("ArrowRight", { metaKey: true }), true), null);
  assert.equal(chordOf(key("ArrowLeft", { metaKey: true }), true), null);
  // The rest still fire from a field — ⌘↩ is how you confirm what you typed.
  assert.equal(chordOf(key("Enter", { metaKey: true }), true), "cmd+enter");
  assert.equal(chordOf(key("1", { metaKey: true }), true), "cmd+1");
});

test("registry: the most recently mounted screen wins a contested chord", () => {
  const hits: string[] = [];
  const shell: ShortcutMap = { "cmd+1": () => hits.push("shell"), "cmd+right": () => hits.push("shell→") };
  const viewer: ShortcutMap = { "cmd+right": () => hits.push("viewer→") };
  const stack = [() => shell, () => viewer];

  resolveShortcut("cmd+right", stack)?.();
  resolveShortcut("cmd+1", stack)?.();
  assert.equal(resolveShortcut("cmd+n", stack), null);
  assert.deepEqual(hits, ["viewer→", "shell"]);
});

test("registry: unregistering restores the previous owner", () => {
  const hits: string[] = [];
  const off1 = registerShortcuts(() => ({ "cmd+n": () => hits.push("a") }));
  const off2 = registerShortcuts(() => ({ "cmd+n": () => hits.push("b") }));
  resolveShortcut("cmd+n")?.();
  off2();
  resolveShortcut("cmd+n")?.();
  off1();
  assert.equal(resolveShortcut("cmd+n"), null);
  assert.deepEqual(hits, ["b", "a"]);
});

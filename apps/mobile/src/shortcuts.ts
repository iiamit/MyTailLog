// The dependency-free half of the iPad shell: keyboard chords and the
// size-class threshold. No React, no Capacitor, no DOM — tested from
// apps/web/test/mobile-shell.test.ts. The hooks that use this live in
// layout.tsx (useShortcuts, useSizeClass).

export type SizeClass = "compact" | "regular";

/**
 * iPadOS decides by WIDTH, not device: an 11" iPad is regular full-screen and
 * compact as the third of a Split View beside ForeFlight. 700pt keeps a
 * half-split iPad compact (decided), so the phone layout is the beside-
 * ForeFlight layout and nothing built for the phone is wasted.
 */
export const REGULAR_MIN_WIDTH = 700;

export function sizeClassFor(width: number): SizeClass {
  return width >= REGULAR_MIN_WIDTH ? "regular" : "compact";
}

/** The chords the app answers to. ⌘ on a Magic Keyboard; Ctrl is accepted too. */
export type Chord =
  | "cmd+enter"
  | "cmd+right"
  | "cmd+left"
  | "cmd+n"
  | "cmd+f"
  | "cmd+1"
  | "cmd+2"
  | "cmd+3"
  | "cmd+4";

export type ShortcutMap = Partial<Record<Chord, () => void>>;

const KEYS: Record<string, Chord> = {
  enter: "cmd+enter",
  arrowright: "cmd+right",
  arrowleft: "cmd+left",
  n: "cmd+n",
  f: "cmd+f",
  "1": "cmd+1",
  "2": "cmd+2",
  "3": "cmd+3",
  "4": "cmd+4",
};

/**
 * The chord a key event names, or null when it is not one of ours.
 * `inEditable`: the event target is an input/textarea — ⌘←/⌘→ then keep their
 * text meaning (caret to line start/end) rather than turning the page.
 */
export function chordOf(
  e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean },
  inEditable = false,
): Chord | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return null;
  const chord = KEYS[e.key.toLowerCase()] ?? null;
  if (inEditable && (chord === "cmd+left" || chord === "cmd+right")) return null;
  return chord;
}

// A stack of live maps. The most recently mounted screen wins a chord, so a
// page viewer's ⌘→ beats the shell's, and the shell's ⌘1 still works from
// anywhere no screen claims it.
type Getter = () => ShortcutMap;
const stack: Getter[] = [];

export function registerShortcuts(get: Getter): () => void {
  stack.push(get);
  return () => {
    const i = stack.lastIndexOf(get);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** The handler that owns `chord` right now, newest registration first. */
export function resolveShortcut(chord: Chord, maps: readonly Getter[] = stack): (() => void) | null {
  for (let i = maps.length - 1; i >= 0; i--) {
    const fn = maps[i]()[chord];
    if (fn) return fn;
  }
  return null;
}

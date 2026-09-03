// The dependency-free half of the iPad shell: keyboard chords and the
// size-class threshold. No React, no Capacitor, no DOM — tested from
// apps/web/test/mobile-shell.test.ts. The hooks that use this live in
// layout.tsx (useShortcuts, useSizeClass).

export type SizeClass = "compact" | "regular";

/**
 * iPadOS decides by WIDTH, not device: an 11" iPad is regular full-screen and
 * compact as the third of a Split View beside ForeFlight.
 *
 * TWO thresholds, because the sidebar and the second pane do not want the same
 * amount of room. The sidebar is a straight swap for the tab bar and pays for
 * itself the moment there is any width to spare. A second pane is not: it
 * halves what is left, and an 11" iPad in PORTRAIT (834pt) minus the sidebar
 * leaves two ~300pt columns — narrower than the phone the content was designed
 * for, which is how a scan ends up scrolling sideways in its own pane.
 *
 * So portrait gets the sidebar and ONE full-width pane that pushes, exactly
 * like the phone; landscape (1194pt) gets the split. Turning the iPad is the
 * gesture that asks for the second pane, which is also how ForeFlight behaves.
 */
export const SIDEBAR_MIN_WIDTH = 700;
export const REGULAR_MIN_WIDTH = 1000;

export function sizeClassFor(width: number): SizeClass {
  return width >= REGULAR_MIN_WIDTH ? "regular" : "compact";
}

/** Whether the sidebar replaces the tab bar — independent of the pane count. */
export function showsSidebar(width: number): boolean {
  return width >= SIDEBAR_MIN_WIDTH;
}

/** The chords the app answers to. ⌘ on a Magic Keyboard; Ctrl is accepted too. */
export type Chord =
  | "cmd+enter"
  | "cmd+right"
  | "cmd+left"
  | "cmd+n"
  | "cmd+f"
  | "cmd+k"
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
  k: "cmd+k",
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

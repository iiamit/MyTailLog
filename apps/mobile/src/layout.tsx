import { useEffect, useRef, useState, type DragEvent, type ReactElement, type ReactNode } from "react";
import type { Aircraft } from "./types";
import { TABS, type Tab } from "./tabbar";
import { AircraftSwitcher } from "./switcher";
import { color, text, radius, hit, SCREEN_X, body } from "./tokens";
import { chordOf, registerShortcuts, resolveShortcut, REGULAR_MIN_WIDTH, SIDEBAR_MIN_WIDTH, type ShortcutMap, type SizeClass } from "./shortcuts";
import type { Urgency } from "@/lib/compliance";

// Layout primitives. See docs/ios-parity/CONTRACT.md §5.
//
// Screens are NOT rewritten for the iPad: the shell composes the phone's
// screen components into a sidebar + two panes when the window is wide enough,
// and renders exactly the phone when it isn't (Split View 1/3, Slide Over).

export type { SizeClass } from "./shortcuts";

function useMinWidth(px: number): boolean {
  const query = `(min-width: ${px}px)`;
  const [matches, setMatches] = useState<boolean>(() =>
    typeof window !== "undefined" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

/** How much room the CONTENT has: "regular" is the only one that splits. */
export function useSizeClass(): SizeClass {
  return useMinWidth(REGULAR_MIN_WIDTH) ? "regular" : "compact";
}

/**
 * Whether the sidebar stands in for the tab bar. Deliberately a lower bar than
 * useSizeClass: a portrait iPad has room for the sidebar but not for a second
 * pane, so it gets the sidebar and one full-width pane that pushes.
 */
export function useSidebar(): boolean {
  return useMinWidth(SIDEBAR_MIN_WIDTH);
}

export const SIDEBAR_WIDTH = 200;

/**
 * Regular width only. The fleet switcher at the top (same pill idiom as the
 * phone header), the four tabs as rows, the account at the bottom.
 */
export function Sidebar({
  aircraft,
  fleet,
  worst,
  active,
  onTab,
  onSwitch,
  onSeeAll,
  onAccount,
  onAsk,
  askOn,
}: {
  aircraft: Aircraft;
  fleet: Aircraft[];
  worst: Record<string, Urgency>;
  active: Tab;
  onTab: (t: Tab) => void;
  onSwitch: (a: Aircraft) => void;
  onSeeAll: () => void;
  onAccount: () => void;
  /** Opens Ask beside the current tab. Absent = no Ask row. */
  onAsk?: () => void;
  askOn?: boolean;
}): ReactElement | null {
  const row = (id: string, on: boolean) => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    minHeight: hit.min,
    padding: "0 12px",
    background: on ? color.surfaceRaised : "transparent",
    border: `1px solid ${on ? color.hairline : "transparent"}`,
    borderRadius: radius.control,
    color: on ? color.ink : color.dim,
    fontFamily: text.rowTitle.fontFamily,
    fontSize: 14.5,
    fontWeight: on ? 600 : 500,
    cursor: "pointer",
    textAlign: "left" as const,
  });

  return (
    <nav
      aria-label="Sections"
      style={{
        flex: `0 0 ${SIDEBAR_WIDTH}px`,
        width: SIDEBAR_WIDTH,
        // Not sticky: the frame is a fixed-height viewport and this is a
        // full-height column inside it, so there is no page scroll to stick
        // against. Sticky held only while its own box was on screen, which is
        // why scrolling a long list used to carry the sidebar away with it.
        height: "100%",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: `max(16px, env(safe-area-inset-top)) 10px calc(12px + env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left))`,
        background: color.surface,
        borderRight: `1px solid ${color.hairline}`,
      }}
    >
      <div style={{ padding: "0 2px 10px" }}>
        <AircraftSwitcher
          variant="sidebar"
          aircraft={aircraft}
          fleet={fleet}
          worst={worst}
          onSwitch={onSwitch}
          onSeeAll={onSeeAll}
        />
      </div>

      {TABS.map(({ id, label, Icon }, i) => {
        const on = id === active;
        return (
          <button
            key={id}
            className="hoverable"
            onClick={() => onTab(id)}
            aria-current={on ? "page" : undefined}
            title={`⌘${i + 1}`}
            style={row(id, on)}
          >
            <Icon size={19} color={on ? color.accent : color.faint} />
            {label}
          </button>
        );
      })}

      {/* Ask is not a tab — it opens beside whatever tab is up — so it sits
          after an 8pt gap rather than in the run of four (design §12). */}
      {onAsk && (
        <button
          className="hoverable"
          onClick={onAsk}
          aria-current={askOn ? "page" : undefined}
          title="⌘K"
          style={{ ...row("ask", !!askOn), marginTop: 8 }}
        >
          <span
            aria-hidden
            style={{
              width: 19,
              height: 19,
              borderRadius: "50%",
              border: `1.5px solid ${askOn ? color.accent : color.faint}`,
              color: askOn ? color.accent : color.faint,
              fontSize: 12,
              lineHeight: "16px",
              textAlign: "center",
              display: "inline-block",
            }}
          >
            ?
          </span>
          Ask
        </button>
      )}

      <button
        className="hoverable"
        onClick={onAccount}
        aria-label="Account"
        style={{ ...row("account", false), marginTop: "auto" }}
      >
        <span
          aria-hidden
          style={{
            width: 19,
            height: 19,
            borderRadius: "50%",
            border: `1.5px solid ${color.faint}`,
            display: "inline-block",
          }}
        />
        Account
      </button>
    </nav>
  );
}

/** The regular-width root: sidebar on the left, content beside it. */
/**
 * The regular-width root: sidebar on the left, content beside it.
 *
 * The window itself does NOT scroll — this is a fixed-height viewport and each
 * region scrolls inside it. When the page scrolled instead, scrolling the
 * middle pane took the sidebar and the viewer with it: the list you were
 * reading stayed put while everything you were reading it against left the
 * screen, which is the opposite of what a split view is for.
 */
export function RegularFrame({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        // dvh, not vh: vh is the tallest the window ever gets, so on iPadOS it
        // hides the bottom of the frame behind the home indicator.
        height: "100dvh",
        overflow: "hidden",
        background: color.bg,
        color: color.ink,
        fontFamily: body,
      }}
    >
      {sidebar}
      <div
        className="noshrink"
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          // Screens that draw no split scroll here as one page. A TwoPane
          // claims the height instead (flex: 1) and scrolls per pane, so this
          // never scrolls under it.
          overflowY: "auto",
          padding: `max(20px, env(safe-area-inset-top)) max(${SCREEN_X}px, env(safe-area-inset-right)) calc(20px + env(safe-area-inset-bottom)) ${SCREEN_X}px`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

const RATIO: Record<NonNullable<Parameters<typeof TwoPane>[0]["ratio"]>, [number, number]> = {
  "50/50": [1, 1],
  "55/45": [55, 45],
  "40/60": [40, 60],
};

/**
 * Regular width: primary and secondary side by side. Compact: `primary` only —
 * the caller presents `secondary` as a sheet or push, which is what the phone
 * does today.
 *
 * Each pane carries the same 20pt gutter a phone screen has, so a screen that
 * bleeds to the edge with `margin: -20` (the page viewer) lands exactly on the
 * pane edge instead of over its neighbour.
 */
export function TwoPane({
  primary,
  secondary,
  ratio = "50/50",
}: {
  primary: ReactNode;
  secondary: ReactNode | null;
  ratio?: "50/50" | "55/45" | "40/60";
}): ReactElement {
  const size = useSizeClass();
  if (size === "compact") return <>{primary}</>;
  const [a, b] = RATIO[ratio];
  // Each pane is its own scroller and its own flex column: scrolling the list
  // leaves the viewer beside it exactly where it was, and a pane that itself
  // holds a TwoPane (the three-way scans layout) gets a definite height to
  // divide rather than growing the page.
  const pane = (grow: number): React.CSSProperties => ({
    flex: `${grow} 1 0`,
    minWidth: 0,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
    padding: `0 ${SCREEN_X}px`,
  });
  return (
    <div
      className="noshrink"
      style={{
        display: "flex",
        margin: `0 -${SCREEN_X}px`,
        alignItems: "stretch",
        // Claim the frame's remaining height instead of growing with the
        // content, so the panes have something definite to scroll within.
        flex: "1 1 auto",
        minHeight: 0,
      }}
    >
      <div className="noshrink" style={pane(a)}>{primary}</div>
      <div className="noshrink" style={{ ...pane(b), borderLeft: `1px solid ${color.hairline}` }}>{secondary}</div>
    </div>
  );
}

/**
 * Where a floating action button sits. On a phone it has to clear the tab bar;
 * at regular width there is no tab bar, so it sits on the safe area alone.
 */
export const fabBottom = (size: SizeClass): string =>
  size === "regular" ? "calc(20px + env(safe-area-inset-bottom))" : "calc(78px + env(safe-area-inset-bottom) + 20px)";

/** What a secondary pane shows before anything is picked in the primary. */
export function PanePlaceholder({ children }: { children: ReactNode }): ReactElement {
  return (
    <div style={{ minHeight: 240, display: "grid", placeItems: "center", textAlign: "center", padding: 20 }}>
      <p style={{ ...text.secondary, color: color.faint, margin: 0, maxWidth: 260, textWrap: "pretty" }}>{children}</p>
    </div>
  );
}

// --- Keyboard ---------------------------------------------------------------

function isEditable(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
}

let listening = false;
function ensureListener() {
  if (listening || typeof document === "undefined") return;
  listening = true;
  document.addEventListener("keydown", (e) => {
    const chord = chordOf(e, isEditable(e.target));
    if (!chord) return;
    const fn = resolveShortcut(chord);
    if (!fn) return;
    e.preventDefault();
    fn();
  });
}

/**
 * Register the chords this screen answers to while it is mounted. The map may
 * be a fresh object every render; the latest one is read at keypress time. The
 * most recently mounted screen wins a contested chord.
 */
export function useShortcuts(map: ShortcutMap): void {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    ensureListener();
    return registerShortcuts(() => ref.current);
  }, []);
}

// --- Drag and drop ----------------------------------------------------------

/**
 * HTML5 drop target: spread `props` on the element, style it with `dragging`.
 * Files only — a dragged URL or text calls nothing.
 */
export function useDropFiles<T extends HTMLElement = HTMLElement>(onFiles: (files: File[]) => void): {
  dragging: boolean;
  props: {
    onDragEnter: (e: DragEvent<T>) => void;
    onDragOver: (e: DragEvent<T>) => void;
    onDragLeave: (e: DragEvent<T>) => void;
    onDrop: (e: DragEvent<T>) => void;
  };
} {
  const [dragging, setDragging] = useState(false);
  // Enter/leave fire for every child crossed; count them so the highlight
  // doesn't flicker as the cursor passes over nested elements.
  const depth = useRef(0);
  const hasFiles = (e: DragEvent<T>) => Array.from(e.dataTransfer.types).includes("Files");
  return {
    dragging,
    props: {
      onDragEnter(e) {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current++;
        setDragging(true);
      },
      onDragOver(e) {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      },
      onDragLeave(e) {
        if (!hasFiles(e)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      },
      onDrop(e) {
        e.preventDefault();
        depth.current = 0;
        setDragging(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) onFiles(files);
      },
    },
  };
}

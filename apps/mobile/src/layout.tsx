import { useEffect, useRef, useState, type DragEvent, type ReactElement, type ReactNode } from "react";
import type { Aircraft } from "./types";
import { TABS, type Tab } from "./tabbar";
import { AircraftSwitcher } from "./switcher";
import { color, text, radius, hit, SCREEN_X, body } from "./tokens";
import { chordOf, registerShortcuts, resolveShortcut, REGULAR_MIN_WIDTH, type ShortcutMap, type SizeClass } from "./shortcuts";
import type { Urgency } from "@/lib/compliance";

// Layout primitives. See docs/ios-parity/CONTRACT.md §5.
//
// Screens are NOT rewritten for the iPad: the shell composes the phone's
// screen components into a sidebar + two panes when the window is wide enough,
// and renders exactly the phone when it isn't (Split View 1/3, Slide Over).

export type { SizeClass } from "./shortcuts";

export function useSizeClass(): SizeClass {
  const query = `(min-width: ${REGULAR_MIN_WIDTH}px)`;
  const [regular, setRegular] = useState<boolean>(() =>
    typeof window !== "undefined" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = (e: MediaQueryListEvent) => setRegular(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return regular ? "regular" : "compact";
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
  // ponytail: inline hover until platform ships `.hoverable` in index.css
  // (requested); the className is already on the rows so the class wins later.
  const [hover, setHover] = useState<string | null>(null);
  const row = (id: string, on: boolean) => ({
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    minHeight: hit.min,
    padding: "0 12px",
    background: on ? color.surfaceRaised : hover === id ? `${color.surfaceRaised}99` : "transparent",
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
        position: "sticky",
        top: 0,
        height: "100vh",
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
            onMouseEnter={() => setHover(id)}
            onMouseLeave={() => setHover(null)}
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
          onMouseEnter={() => setHover("ask")}
          onMouseLeave={() => setHover(null)}
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
        onMouseEnter={() => setHover("account")}
        onMouseLeave={() => setHover(null)}
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
export function RegularFrame({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }): ReactElement {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: color.bg, color: color.ink, fontFamily: body }}>
      {sidebar}
      <div
        style={{
          flex: 1,
          minWidth: 0,
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
  const pane = (grow: number): React.CSSProperties => ({
    flex: `${grow} 1 0`,
    minWidth: 0,
    padding: `0 ${SCREEN_X}px`,
  });
  return (
    <div style={{ display: "flex", margin: `0 -${SCREEN_X}px`, alignItems: "stretch" }}>
      <div style={pane(a)}>{primary}</div>
      <div style={{ ...pane(b), borderLeft: `1px solid ${color.hairline}` }}>
        {/* The viewer stays put while the list beside it scrolls: it sticks to
            the top and scrolls on its own once taller than the window. */}
        <div style={{ position: "sticky", top: 0, maxHeight: "100vh", overflowY: "auto" }}>{secondary}</div>
      </div>
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

// ===========================================================================
// Design tokens — MyTailLog iOS redesign, direction "Verdict first".
//
// Source of truth: the approved design in the Claude Design project
// ("MyTailLog iOS Redesign - Approved 1a.dc.html"). Values here are transcribed
// from its handoff README; change them there first, not here.
//
// The handoff was written for SwiftUI (it ships a DesignTokens.swift and maps
// icons to SF Symbols). This app is Capacitor + React, so the translation is:
//   SwiftUI Color            → these hex strings
//   .monospacedDigit()       → fontVariantNumeric: "tabular-nums"
//   SF Symbols               → inline SVG (src/icons.tsx)
//   Dynamic Type             → rem-relative sizes; the webview honours the
//                              OS text-size setting through the root font size
// The VISUAL result is what has to match, not the mechanism.
// ===========================================================================

export const color = {
  /** App background; the tab bar sits on this at 92% opacity. */
  bg: "#0F1216",
  /** Cards, panels, list rows, segmented-control track. */
  surface: "#191D24",
  /** Stepper buttons, chips, unselected segments, avatar. */
  surfaceRaised: "#212630",
  /** Every 1px border and divider. */
  hairline: "#2B313C",

  ink: "#ECEFF4",
  dim: "#9AA3B0",
  faint: "#6B7482",

  accent: "#5AA9FF",
  accentLight: "#8EC8FF",
  /** Text/icons on top of the accent gradient. */
  onAccent: "#0B1017",

  warning: "#F2B544",
  danger: "#FF7060",
  success: "#4ED69A",
} as const;

/**
 * Semantic tints — the semantic colour at low alpha over `surface`.
 *
 * Kept as 8-digit hex rather than rgba() so they compose in the same string
 * positions as the solid colours.
 */
export const tint = {
  warning: "#F2B5441F", // 12%
  warningBorder: "#F2B5444D", // 30%
  danger: "#FF70601F", // 12%
  dangerBorder: "#FF70604D",
  success: "#4ED69A1F", // 12%
  successBorder: "#4ED69A3D", // 24%
  accent: "#5AA9FF24", // 14%
  accentBorder: "#5AA9FF4D", // 30%
} as const;

/** The one primary fill in the system. Exactly one primary button per screen. */
export const accentGradient = `linear-gradient(135deg, ${color.accent}, ${color.accentLight})`;

// --- Semantic state ---------------------------------------------------------
// Colour is NEVER the only signal: every state carries a word too, for
// colour-blind users and for reading the screen in a bright hangar.

export type Semantic = "grounded" | "due" | "airworthy";

export const semantic: Record<Semantic, { color: string; tint: string; border: string; word: string }> = {
  grounded: { color: color.danger, tint: tint.danger, border: tint.dangerBorder, word: "GROUNDED" },
  due: { color: color.warning, tint: tint.warning, border: tint.warningBorder, word: "DUE SOON" },
  airworthy: { color: color.success, tint: tint.success, border: tint.successBorder, word: "AIRWORTHY" },
};

/** Map the shared compliance urgency onto the design's three states. */
export function semanticOf(urgency: string | null | undefined): Semantic {
  if (urgency === "overdue") return "grounded";
  if (urgency === "due_soon") return "due";
  return "airworthy";
}

// --- Type -------------------------------------------------------------------
// Two families, both already brand faces. Monospace is RETIRED: the current
// app's monospace metadata is what makes it read as console output. Where digits
// need to stop jittering, use tabular numerals instead of a monospace face.

export const display = "'Space Grotesk', system-ui, sans-serif"; // quantities + identifiers
export const body = "'Instrument Sans', system-ui, sans-serif"; // everything else

/** Tabular figures without a monospace face — the .monospacedDigit() analogue. */
export const tabular = { fontVariantNumeric: "tabular-nums" } as const;

type TextStyle = {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  letterSpacing?: string;
  lineHeight?: number | string;
  textTransform?: "uppercase";
};

/** The type scale, authored at iPhone logical-point scale (390pt wide). */
export const text = {
  screenTitle: { fontFamily: display, fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" },
  screenTitleCompact: { fontFamily: display, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" },
  hero: { fontFamily: display, fontSize: 28, fontWeight: 700, lineHeight: 1 },
  tailCard: { fontFamily: display, fontSize: 19, fontWeight: 700, letterSpacing: "0.01em" },
  tailSwitcher: { fontFamily: display, fontSize: 15, fontWeight: 700 },
  meterValue: { fontFamily: display, fontSize: 21, fontWeight: 700, letterSpacing: "-0.01em" },
  verdict: { fontFamily: display, fontSize: 19, fontWeight: 700 },
  countdown: { fontFamily: display, fontSize: 13, fontWeight: 700 },
  button: { fontFamily: body, fontSize: 16, fontWeight: 600 },
  cardTitle: { fontFamily: body, fontSize: 15, fontWeight: 600 },
  rowTitle: { fontFamily: body, fontSize: 14.5, fontWeight: 600 },
  bodyText: { fontFamily: body, fontSize: 13.5, fontWeight: 400, lineHeight: 1.5 },
  secondary: { fontFamily: body, fontSize: 13, fontWeight: 400 },
  meta: { fontFamily: body, fontSize: 11.5, fontWeight: 400 },
  sectionLabel: {
    fontFamily: body, fontSize: 12, fontWeight: 600,
    letterSpacing: "0.08em", textTransform: "uppercase",
  },
  chip: {
    fontFamily: body, fontSize: 11, fontWeight: 600,
    letterSpacing: "0.04em", textTransform: "uppercase",
  },
  tabLabel: { fontFamily: body, fontSize: 10.5, fontWeight: 500 },
} satisfies Record<string, TextStyle>;

// --- Space, radius, hit targets --------------------------------------------

/** Screen horizontal padding is 20 on every screen. */
export const SCREEN_X = 20;

export const radius = {
  chip: 9,
  control: 12, // buttons, inputs, compact rows
  row: 14, // list cards
  card: 16, // feature cards
  panel: 18, // grouped panels
  pill: 999,
} as const;

/** No interactive element below 44. Steppers 46, primary buttons 52, keys 56. */
export const hit = { min: 44, stepper: 46, primary: 52, key: 56 } as const;

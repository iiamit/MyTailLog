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

// --- Palettes ---------------------------------------------------------------
//
// The design is authored dark. The light set is the same ramp inverted — same
// hues, same roles — with the semantic colours darkened, because a #FF7060 or a
// #5AA9FF that reads perfectly on #0F1216 is unreadable on white. Contrast is
// checked in apps/web/test/mobile-theme.test.ts, not by eye.
//
// HOW A COLOUR REACHES THE SCREEN. EVERY token value is a CSS custom property
// (`var(--c-ink)`), written onto <html> by paint(). That is what makes a theme
// switch reach style objects built once at module load (ui.tsx's `input`,
// record-screen's `sheetInput`, …) — a plain hex string captured there would
// stay on the launch palette forever.
//
// Two places cannot take a var(), and both have a helper here instead of a raw
// token:
//   • string maths — `${color.danger}4D` becomes `var(--c-danger)4D`, which is
//     invalid at computed-value time and drops the whole declaration. Use
//     `alpha(color.danger, "4D")`, which resolves the var back to hex.
//   • SVG presentation attributes (`stroke="…"`) do not substitute var().
//     Set the CSS property instead (`style={{ stroke: … }}`), or paint the
//     `color` property and stroke/fill with `currentColor` — see icons.tsx.

export type ThemeName = "dark" | "light";

export type Palette = {
  /** App background; the tab bar sits on this at 92% opacity. */
  bg: string;
  /** Cards, panels, list rows, segmented-control track. */
  surface: string;
  /** Stepper buttons, chips, unselected segments, avatar. */
  surfaceRaised: string;
  /** Every 1px border and divider. */
  hairline: string;
  ink: string;
  dim: string;
  faint: string;
  accent: string;
  accentLight: string;
  /** Text/icons on top of the accent gradient. */
  onAccent: string;
  warning: string;
  danger: string;
  success: string;
};

export const palettes: Record<ThemeName, Palette> = {
  dark: {
    bg: "#0F1216",
    surface: "#191D24",
    surfaceRaised: "#212630",
    hairline: "#2B313C",
    ink: "#ECEFF4",
    dim: "#9AA3B0",
    faint: "#6B7482",
    accent: "#5AA9FF",
    accentLight: "#8EC8FF",
    onAccent: "#0B1017",
    warning: "#F2B544",
    danger: "#FF7060",
    success: "#4ED69A",
  },
  light: {
    bg: "#F2F5F9",
    surface: "#FFFFFF",
    surfaceRaised: "#E8ECF3",
    hairline: "#D3DAE4",
    ink: "#10151C",
    dim: "#4E5967",
    // 4.0:1 on the light bg at #6E7A89 — design measured it; #666F7C is 4.6:1.
    faint: "#666F7C",
    accent: "#1667CE",
    // The accent gradient does not change between themes: it is a light-blue
    // fill carrying dark text, and that reads on either ground.
    accentLight: "#8EC8FF",
    onAccent: "#0B1017",
    warning: "#8A5300",
    danger: "#C0271B",
    success: "#0B7A4B",
  },
};

/** Semantic tints — the semantic colour at low alpha over `surface`. */
export type Tints = {
  warning: string;
  warningBorder: string;
  danger: string;
  dangerBorder: string;
  success: string;
  successBorder: string;
  accent: string;
  accentBorder: string;
};

/**
 * The design's alphas (12% fill, 30% border; success 24%, accent 14%) applied to
 * whichever palette is active. Kept as 8-digit hex rather than rgba() so they
 * compose in the same string positions as the solid colours.
 */
export function tintsFor(p: Palette): Tints {
  return {
    warning: p.warning + "1F",
    warningBorder: p.warning + "4D",
    danger: p.danger + "1F",
    dangerBorder: p.danger + "4D",
    success: p.success + "1F",
    successBorder: p.success + "3D",
    accent: p.accent + "24",
    accentBorder: p.accent + "4D",
  };
}

let active: ThemeName = "dark";

/** The palette the app is currently painted in. Set by applyTheme(). */
export function activeTheme(): ThemeName {
  return active;
}

/** theme.ts only. UI code never calls this — it uses useTheme(). */
export function setActiveTheme(t: ThemeName): void {
  active = t;
}

export const color: Palette = new Proxy({} as Palette, {
  get: (_t, k: string) => `var(--c-${k})`,
  // Style objects get spread and inspected; make the proxy enumerate like one.
  ownKeys: () => Object.keys(palettes.dark),
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
});

/**
 * A token at an alpha, as 8-digit hex.
 *
 * `${color.danger}4D` produces `var(--c-danger)4D` — not a colour, so the
 * declaration is dropped and the element paints with no tint and no border.
 * This resolves the var() back to the active palette's hex first. Call it at
 * render time (it reads the live theme); a module-level const would snapshot
 * the launch palette, which is the bug the var()s exist to avoid.
 */
export function alpha(c: string, a: string): string {
  const m = /^var\(--c-([a-zA-Z]+)\)$/.exec(c);
  return (m ? palettes[active][m[1] as keyof Palette] : c) + a;
}

export const tint: Tints = new Proxy({} as Tints, {
  get: (_t, k: string) => `var(--t-${k})`,
  ownKeys: () => Object.keys(tintsFor(palettes.dark)),
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
});

/** The `--c-*` / `--t-*` values for a theme, written onto <html> by paint(). */
export function cssVars(t: ThemeName): Record<string, string> {
  const p = palettes[t];
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) out[`--c-${k}`] = v;
  for (const [k, v] of Object.entries(tintsFor(p))) out[`--t-${k}`] = v;
  return out;
}

// --- Appearance -------------------------------------------------------------
//
// The resolution rule and the first paint live HERE, not in theme.ts, for one
// blunt reason: every screen imports tokens.ts, so this module is guaranteed to
// load, and until the custom properties exist on <html> every `var(--c-…)` is
// unset and the app renders unpainted. theme.ts owns the React hook, the status
// bar and the owner-facing labels on top of this. Both are pure enough to test.

export type ThemeChoice = "system" | "light" | "dark";

const CHOICE_KEY = "mtl.appearance";

/** Only these three are honoured; anything else in storage counts as unset. */
export function parseChoice(stored: string | null | undefined): ThemeChoice {
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

/** The one decision: a pinned choice wins, otherwise the phone's own setting. */
export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): ThemeName {
  if (choice === "light" || choice === "dark") return choice;
  return prefersDark ? "dark" : "light";
}

export function storedChoice(): ThemeChoice {
  try {
    return parseChoice(globalThis.localStorage?.getItem(CHOICE_KEY));
  } catch {
    return "system"; // storage blocked — the phone's own setting still applies
  }
}

export function saveChoice(c: ThemeChoice): void {
  try {
    globalThis.localStorage?.setItem(CHOICE_KEY, c);
  } catch {
    /* the choice just won't survive a relaunch */
  }
}

export function systemPrefersDark(): boolean {
  return globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
}

/** Repaint the whole app in `theme`. Cheap: one write of custom properties. */
export function paint(theme: ThemeName): void {
  setActiveTheme(theme);
  const root = globalThis.document?.documentElement;
  if (!root) return;
  for (const [k, v] of Object.entries(cssVars(theme))) root.style.setProperty(k, v);
  root.dataset.theme = theme;
  // Lets the UA paint form controls, scrollbars and the overscroll ground right.
  root.style.colorScheme = theme;
}

paint(resolveTheme(storedChoice(), systemPrefersDark()));

/** The one primary fill in the system. Exactly one primary button per screen.
 *  Deliberately theme-independent (see `accentLight` above). */
export const accentGradient = `linear-gradient(135deg, ${palettes.dark.accent}, ${palettes.dark.accentLight})`;

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

// ---------------------------------------------------------------------------
// The owner-facing half of the appearance setting.
//
// These live here rather than in theme.ts because theme.ts imports React and
// (dynamically) Capacitor, and anything a web test imports is compiled by the
// web typecheck — where neither resolves, since Node resolves from the
// IMPORTING file and apps/web/node_modules is never on that path. tokens.ts is
// the module with no imports at all, so it is the safe home. theme.ts
// re-exports all three, so app code is unchanged.
// ---------------------------------------------------------------------------

export const THEME_CHOICES: ThemeChoice[] = ["system", "light", "dark"];

/** What the owner sees. Never "auto" — nobody calls it that. */
export const THEME_LABEL: Record<ThemeChoice, string> = {
  system: "Match my phone",
  light: "Light",
  dark: "Dark",
};

/** Cycle order for a tap-through control: system → light → dark → system. */
export function nextChoice(choice: ThemeChoice): ThemeChoice {
  const i = THEME_CHOICES.indexOf(choice);
  return THEME_CHOICES[(i + 1) % THEME_CHOICES.length];
}

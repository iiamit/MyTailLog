import { useCallback, useEffect, useState } from "react";
import {
  paint,
  resolveTheme,
  saveChoice,
  storedChoice,
  systemPrefersDark,
  type ThemeChoice,
  type ThemeName,
} from "./tokens";

// ===========================================================================
// Light appearance.
//
// A hangar in July is the brightest room this app is ever used in, and a dark
// screen in direct sun is the one place the design's contrast stops working.
// So: follow the phone's own appearance by default, and let the owner pin it —
// plenty of people keep iOS dark and still want the logbook readable outdoors.
//
// tokens.ts holds the palettes, the resolution rule and the first paint (it is
// the module every screen imports, so it is the only one guaranteed to run
// before anything renders). This file is the React and native half: the hook
// App.tsx mounts, the owner-facing wording, and the status-bar style.
//
// The pure half is tested in apps/web/test/mobile-theme.test.ts; the Capacitor
// imports are loaded on demand so that test can import this file.
// ===========================================================================

export type { ThemeChoice, ThemeName };
export { resolveTheme };

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

/** Status-bar glyphs are the inverse of the ground behind them. */
async function statusBarFor(theme: ThemeName): Promise<void> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: theme === "dark" ? Style.Dark : Style.Light });
  } catch {
    /* not native, or the plugin is absent — the web view still repaints */
  }
}

/**
 * The appearance the app is painted in, plus the owner's setting. Mount once
 * (App.tsx). `theme` also changes when the phone's own setting flips while the
 * app is open, which re-renders the tree so the raw tokens follow too.
 */
export function useTheme(): {
  theme: ThemeName;
  choice: ThemeChoice;
  setChoice: (c: ThemeChoice) => void;
} {
  const [choice, setChoiceState] = useState<ThemeChoice>(storedChoice);
  const [theme, setTheme] = useState<ThemeName>(() => resolveTheme(storedChoice(), systemPrefersDark()));

  useEffect(() => {
    const mq = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
    const repaint = () => {
      const next = resolveTheme(choice, mq?.matches ?? true);
      paint(next);
      setTheme(next);
      void statusBarFor(next);
    };
    repaint();
    if (!mq || choice !== "system") return;
    mq.addEventListener("change", repaint);
    return () => mq.removeEventListener("change", repaint);
  }, [choice]);

  const setChoice = useCallback((c: ThemeChoice) => {
    saveChoice(c);
    setChoiceState(c);
  }, []);

  return { theme, choice, setChoice };
}

// Shared chrome + style shorthands, built on the design tokens in tokens.ts.
//
// The names below are the ones the screens already import. They now resolve to
// the redesign's palette, so the whole app moves together rather than living in
// two colour systems while screens are migrated one at a time.

import { color, tint, text, display, body, tabular, radius, accentGradient } from "./tokens";

export { color, tint, text, display, body, tabular, radius, accentGradient };

// --- Palette (redesign values) ---------------------------------------------
// Every name here is a `var(--c-*)` string, so it follows the theme by itself.
// The three RAW keys (bg, accent, surfaceRaised — see tokens.ts) are NOT
// re-exported: a `const` would snapshot the launch palette and stay on it when
// the appearance flips mid-session. Read those as `color.bg` / `color.accent` /
// `color.surfaceRaised` at render time.
export const panel = color.surface;
export const line = color.hairline;
export const ink = color.ink;
export const dim = color.dim;
export const faint = color.faint;
export const amber = color.warning;
export const red = color.danger;
export const green = color.success;

/**
 * Retired as a FACE, kept as a style.
 *
 * The old monospace metadata is what made this app read as console output. What
 * it was actually buying was digits that don't jitter between renders, so this
 * is now the brand body face with tabular figures — same alignment, none of the
 * terminal look. (The design calls this "monospace is retired"; SwiftUI would
 * spell it .monospacedDigit().)
 */
export const mono: React.CSSProperties = { fontFamily: body, ...tabular };

// --- Urgency ----------------------------------------------------------------
// Colour is never the only signal — each entry carries its word too.
export const URGENCY_COLOR: Record<string, string> = {
  overdue: color.danger,
  due_soon: color.warning,
  upcoming: color.success,
  none: color.success,
};
export const URGENCY_LABEL: Record<string, string> = {
  overdue: "OVERDUE",
  due_soon: "DUE SOON",
  upcoming: "CURRENT",
  none: "OK",
};

export function Screen({ children, tabBar }: { children: React.ReactNode; tabBar?: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: color.bg,
        color: color.ink,
        fontFamily: body,
        // Leave room for the tab bar so content never hides behind it.
        padding: `max(20px, env(safe-area-inset-top)) 20px ${
          tabBar ? "calc(78px + env(safe-area-inset-bottom))" : "calc(20px + env(safe-area-inset-bottom))"
        }`,
        boxSizing: "border-box",
      }}
    >
      {children}
      {tabBar}
    </div>
  );
}

/** Upward triangle, 135° accent gradient. Proportions are fixed by the brand. */
export function Brand({ small }: { small?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <span
        style={{
          width: small ? 15 : 24,
          height: small ? 13 : 21,
          background: accentGradient,
          clipPath: "polygon(50% 0, 100% 86%, 0 86%)",
        }}
      />
      <span style={{ fontFamily: display, fontWeight: 700, fontSize: small ? 17 : 22, letterSpacing: "-0.01em" }}>
        MyTailLog
      </span>
    </div>
  );
}

export function TopBar({ title, onBack, right }: { title: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 30 }}>
      {onBack && (
        <button onClick={onBack} style={{ ...ghost, padding: "6px 10px" }} aria-label="Back">
          ‹ Back
        </button>
      )}
      <span style={{ fontFamily: display, fontSize: 19, fontWeight: 700 }}>{title}</span>
      {right && <span style={{ marginLeft: "auto" }}>{right}</span>}
    </div>
  );
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: `1px solid ${color.hairline}` }}>
      <span style={{ ...text.secondary, color: color.dim }}>{label}</span>
      <span style={{ ...text.rowTitle, textAlign: "right" }}>{value}</span>
    </div>
  );
}

export function Card({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: color.surface,
        border: `1px solid ${color.hairline}`,
        borderRadius: radius.card,
        padding: "12px 14px",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      {children}
    </div>
  );
}

/** Status chip: semantic colour on semantic tint, always carrying its word. */
export function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  const c = URGENCY_COLOR[tone] ?? color.faint;
  return (
    <span
      style={{
        ...text.chip,
        color: c,
        border: `1px solid ${c}4D`,
        background: `${c}1F`,
        borderRadius: 6,
        padding: "4px 8px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export const input: React.CSSProperties = {
  background: color.surface,
  border: `1px solid ${color.hairline}`,
  borderRadius: radius.control,
  padding: "12px 14px",
  color: color.ink,
  fontFamily: body,
  fontSize: 16,
};

/** The single primary action per screen. */
export const primary: React.CSSProperties = {
  background: accentGradient,
  color: color.onAccent,
  border: "none",
  borderRadius: 15,
  padding: "15px",
  fontFamily: body,
  fontSize: 16,
  fontWeight: 600,
};

export const ghost: React.CSSProperties = {
  background: "transparent",
  color: color.dim,
  border: `1px solid ${color.hairline}`,
  borderRadius: 8,
  padding: "7px 12px",
  fontFamily: body,
  fontSize: 13,
  cursor: "pointer",
};

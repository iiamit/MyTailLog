import { test } from "node:test";
import assert from "node:assert/strict";
// theme.ts is NOT imported here: it pulls React and Capacitor, which the web
// typecheck cannot resolve. The pure half lives in tokens.ts.
import { palettes, tintsFor, cssVars, parseChoice, resolveTheme, alpha, color, paint, nextChoice, THEME_CHOICES, THEME_LABEL, type Palette } from "../../mobile/src/tokens";

// The iOS app's light appearance, checked here because apps/mobile has no
// runner. Two things are worth covering and both are silent when wrong: which
// theme a given setting resolves to, and whether the light palette is actually
// legible — a colour picked to "look right" on white is exactly the kind of
// thing nobody notices until a hangar in July.

// --- Resolution -------------------------------------------------------------

test("a pinned choice beats the phone's setting, either way", () => {
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
});

test("'match my phone' follows prefers-color-scheme", () => {
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
});

test("anything unexpected in storage means 'match my phone', never a blank app", () => {
  assert.equal(parseChoice(null), "system");
  assert.equal(parseChoice(undefined), "system");
  assert.equal(parseChoice(""), "system");
  assert.equal(parseChoice("Dark"), "system");
  assert.equal(parseChoice("dark"), "dark");
});

test("the tap-through control cycles and comes home", () => {
  let c = THEME_CHOICES[0];
  const seen = [c];
  for (let i = 0; i < THEME_CHOICES.length; i++) {
    c = nextChoice(c);
    seen.push(c);
  }
  assert.deepEqual(seen.slice(0, 3), ["system", "light", "dark"]);
  assert.equal(seen.at(-1), "system");
});

test("every choice has owner-facing wording, and none of it says 'auto'", () => {
  for (const c of THEME_CHOICES) {
    const label = THEME_LABEL[c];
    assert.ok(label && label.length > 0, `${c} has no label`);
    assert.doesNotMatch(label.toLowerCase(), /auto|system|theme/);
  }
});

// --- Palettes ---------------------------------------------------------------

const luminance = (hex: string): number => {
  const ch = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};

const contrast = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** Rough perceptual distance, enough to catch two states that read the same. */
const distance = (a: string, b: string): number => {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [p, q] = [rgb(a), rgb(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

const THEMES: [string, Palette][] = [
  ["dark", palettes.dark],
  ["light", palettes.light],
];

test("both palettes define every role, as a 6-digit hex", () => {
  const keys = Object.keys(palettes.dark);
  assert.deepEqual(Object.keys(palettes.light), keys, "the two palettes drifted apart");
  for (const [name, p] of THEMES) {
    for (const k of keys) {
      assert.match(p[k as keyof Palette], /^#[0-9A-Fa-f]{6}$/, `${name}.${k} is not a plain hex colour`);
    }
  }
});

test("body text clears WCAG AA on both the ground and a card", () => {
  for (const [name, p] of THEMES) {
    for (const ground of [p.bg, p.surface]) {
      assert.ok(contrast(p.ink, ground) >= 7, `${name}: ink is only ${contrast(p.ink, ground).toFixed(2)}:1`);
      assert.ok(contrast(p.dim, ground) >= 4.5, `${name}: dim is only ${contrast(p.dim, ground).toFixed(2)}:1`);
      // faint is metadata at 11.5px — held to the large-text floor, not AA body.
      assert.ok(contrast(p.faint, ground) >= 3, `${name}: faint is only ${contrast(p.faint, ground).toFixed(2)}:1`);
    }
  }
});

test("a verdict colour is readable as text, in either appearance", () => {
  for (const [name, p] of THEMES) {
    for (const role of ["accent", "warning", "danger", "success"] as const) {
      for (const ground of [p.bg, p.surface]) {
        const c = contrast(p[role], ground);
        assert.ok(c >= 4.5, `${name}: ${role} on ${ground} is only ${c.toFixed(2)}:1`);
      }
    }
  }
});

test("grounded, due and airworthy never read as the same colour", () => {
  for (const [name, p] of THEMES) {
    assert.ok(distance(p.danger, p.warning) > 60, `${name}: danger and warning are too close`);
    assert.ok(distance(p.warning, p.success) > 60, `${name}: warning and success are too close`);
    assert.ok(distance(p.danger, p.success) > 60, `${name}: danger and success are too close`);
  }
});

test("the surfaces stack: ground, card, raised — each distinguishable", () => {
  for (const [name, p] of THEMES) {
    assert.ok(distance(p.bg, p.surface) > 8, `${name}: the card does not stand off the ground`);
    assert.ok(distance(p.surface, p.surfaceRaised) > 8, `${name}: raised does not stand off the card`);
    assert.ok(distance(p.surface, p.hairline) > 20, `${name}: the hairline is invisible on a card`);
  }
});

test("text on the accent gradient works in both appearances", () => {
  // The gradient itself is deliberately theme-independent, so its label has to
  // clear both palettes' onAccent value against the lighter gradient stop.
  for (const [name, p] of THEMES) {
    const c = contrast(p.onAccent, palettes.dark.accentLight);
    assert.ok(c >= 4.5, `${name}: onAccent on the gradient is only ${c.toFixed(2)}:1`);
  }
});

// --- Custom properties ------------------------------------------------------

test("tints are the semantic colour plus an alpha byte", () => {
  for (const [name, p] of THEMES) {
    const t = tintsFor(p);
    assert.ok(t.danger.startsWith(p.danger), `${name}: the danger tint is not built from danger`);
    for (const v of Object.values(t)) {
      assert.match(v, /^#[0-9A-Fa-f]{8}$/, `${name}: ${v} is not an 8-digit hex`);
    }
  }
});

test("cssVars covers every colour and every tint, and the two themes differ", () => {
  const dark = cssVars("dark");
  const light = cssVars("light");
  assert.deepEqual(Object.keys(dark), Object.keys(light));
  assert.equal(Object.keys(dark).length, Object.keys(palettes.dark).length + Object.keys(tintsFor(palettes.dark)).length);
  assert.equal(dark["--c-ink"], palettes.dark.ink);
  assert.notEqual(dark["--c-bg"], light["--c-bg"], "the two themes paint the same background");
  assert.match(Object.keys(dark).join(" "), /--c-surfaceRaised/);
});

// --- alpha() ----------------------------------------------------------------
// `${color.danger}4D` is `var(--c-danger)4D`, which is not a colour: the whole
// declaration drops and the chip paints with no tint and no border. alpha()
// resolves the var back to the active palette's hex first.

test("alpha() resolves a var() token to real hex, and follows the theme", () => {
  paint("dark");
  assert.equal(alpha(color.danger, "4D"), palettes.dark.danger + "4D");
  paint("light");
  assert.equal(alpha(color.danger, "4D"), palettes.light.danger + "4D");
  assert.match(alpha(color.danger, "4D"), /^#[0-9A-Fa-f]{6}[0-9A-Fa-f]{2}$/);
  paint("dark");
});

test("alpha() passes a literal colour straight through", () => {
  assert.equal(alpha("#FF7060", "1F"), "#FF70601F");
});

test("every token is a var() — nothing snapshots the launch palette", () => {
  for (const k of Object.keys(palettes.dark) as (keyof Palette)[]) {
    assert.equal(color[k], `var(--c-${k})`, `${k} must be a var(), or a module-level const freezes it`);
  }
});

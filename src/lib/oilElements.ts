// Client-safe constants for oil analysis (no server/SDK deps — safe to import
// into client components AND the server-side extraction module).

// Standard spectrometric element panel (Blackstone + AVLab), in report order.
export const OIL_ELEMENTS = [
  "aluminum", "chromium", "iron", "copper", "lead", "tin", "molybdenum",
  "nickel", "manganese", "silver", "titanium", "potassium", "boron", "silicon",
  "sodium", "calcium", "magnesium", "phosphorus", "zinc", "barium",
] as const;

// Oil physical property keys (values stored best-effort numeric).
export const OIL_PROPERTIES = [
  "viscosity_cst_100c", "viscosity_sus_210f", "flashpoint_f", "fuel_pct",
  "antifreeze_pct", "water_pct", "insolubles_pct", "tbn", "tan",
] as const;

// The wear metals most worth trending (charted); the rest are additive/coolant
// markers shown in the table but not charted by default.
export const KEY_METALS = ["iron", "chromium", "aluminum", "copper", "nickel", "silicon", "lead"] as const;

export const PROPERTY_LABEL: Record<string, string> = {
  viscosity_cst_100c: "Viscosity (cSt @ 100°C)",
  viscosity_sus_210f: "Viscosity (SUS @ 210°F)",
  flashpoint_f: "Flashpoint (°F)",
  fuel_pct: "Fuel %",
  antifreeze_pct: "Antifreeze %",
  water_pct: "Water %",
  insolubles_pct: "Insolubles %",
  tbn: "TBN",
  tan: "TAN",
};

/** "iron" → "Iron". */
export const elementLabel = (e: string) => e.charAt(0).toUpperCase() + e.slice(1);

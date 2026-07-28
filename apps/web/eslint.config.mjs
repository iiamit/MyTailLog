import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Flat config (ESLint 10 / Next 16 — `next lint` was removed). Replaces the old
// .eslintrc.json (`extends: next/core-web-vitals` + the no-empty rule).
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // Ported from .eslintrc.json: ban silent `catch {}` (the CSP-regression lesson —
  // a swallowed error hid the pdf-worker break; see secure-by-default).
  { rules: { "no-empty": ["error", { allowEmptyCatch: false }] } },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

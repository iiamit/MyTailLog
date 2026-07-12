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
  // New React-Compiler rules in eslint-config-next 16 (the old config never enforced
  // them). Our flagged cases are intentional: SSR-hydration-safe reads of
  // localStorage/matchMedia in a mount effect, and a display-only Date.now() in the
  // admin page. Downgrade to warn so the Next 16 migration lands; adopting them
  // properly (useSyncExternalStore, etc.) is a deliberate follow-up, not this PR.
  { rules: { "react-hooks/set-state-in-effect": "warn", "react-hooks/purity": "warn" } },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

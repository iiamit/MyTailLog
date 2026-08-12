import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// `@/…` resolves into apps/web/src, so the native app imports the SAME pure
// compliance/hours math the web app runs instead of reimplementing it. A second
// copy of airworthiness arithmetic is how the phone and the web start disagreeing
// about whether an annual is due — on numbers people fly against.
//
// This only works one way. Vite happily resolves outside its root; Next/Turbopack
// will not (see packages/shared/README.md), so nothing in apps/web may ever
// import from apps/mobile. Only PURE modules are safe to pull in — anything
// touching next/server or the cookie-based Supabase client will not build here.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  resolve: {
    alias: { "@": fileURLToPath(new URL("../web/src", import.meta.url)) },
  },
});

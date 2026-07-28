// Guards the self-hosted pdf.js worker: it must stay same-origin (a CDN URL is
// CSP-blocked → PDF upload breaks) and stay in sync with the installed version.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const root = new URL("../", import.meta.url);
const require = createRequire(import.meta.url);

test("pdf.js workerSrc is same-origin, not a CDN URL", () => {
  const src = readFileSync(new URL("src/lib/capture/importFiles.ts", root), "utf8");
  const m = src.match(/workerSrc\s*=\s*["'`]([^"'`]+)["'`]/);
  assert.ok(m, "couldn't find a GlobalWorkerOptions.workerSrc assignment in importFiles.ts");
  assert.ok(
    !/^https?:\/\//.test(m[1]),
    `workerSrc must be same-origin (self-hosted), got "${m[1]}" — a CDN URL is blocked by the CSP`,
  );
});

test("public/pdf.worker.min.mjs matches the installed pdfjs-dist build", () => {
  // Resolve via Node so it works whether pdfjs-dist is local or hoisted to the
  // workspace-root node_modules.
  const installed = readFileSync(require.resolve("pdfjs-dist/build/pdf.worker.min.mjs"));
  const vendored = readFileSync(new URL("public/pdf.worker.min.mjs", root));
  assert.ok(
    vendored.equals(installed),
    "public/pdf.worker.min.mjs is stale — re-copy from node_modules/pdfjs-dist/build/ after upgrading pdfjs-dist",
  );
});

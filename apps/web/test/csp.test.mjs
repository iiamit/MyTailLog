// Guards the class of regression that broke PDF upload (PR #5): the CSP drifting
// out of sync with the external resources the client actually loads.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCsp, SCRIPT_CDN_ORIGINS } from "../csp.config.mjs";

const root = new URL("../", import.meta.url);

function directivesOf(csp) {
  return Object.fromEntries(
    csp
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [name, ...vals] = d.split(/\s+/);
        return [name, vals];
      }),
  );
}

const d = directivesOf(buildCsp("db.example.supabase.co"));

test("CSP declares worker-src including 'self' (pdf.js worker is self-hosted)", () => {
  // worker-src does NOT inherit from script-src — if it's missing, a Worker
  // falls back to script-src and a same-origin worker can be blocked.
  assert.ok(d["worker-src"], "worker-src directive is missing");
  assert.ok(d["worker-src"].includes("'self'"), "worker-src must allow 'self'");
});

test("CSP script-src allows every declared external script origin", () => {
  for (const origin of SCRIPT_CDN_ORIGINS) {
    assert.ok(
      d["script-src"].includes(origin),
      `script-src is missing ${origin} — the scanner script will be CSP-blocked`,
    );
  }
});

test("CSP connect-src allows the Supabase host", () => {
  assert.ok(
    (d["connect-src"] ?? []).some((v) => v.includes("supabase")),
    "connect-src must allow the Supabase host",
  );
});

test("CSP locks down the dangerous defaults", () => {
  assert.deepEqual(d["object-src"], ["'none'"]);
  assert.deepEqual(d["frame-ancestors"], ["'none'"]);
  assert.deepEqual(d["base-uri"], ["'self'"]);
});

test("form-action is 'self' by default, broadened only for the consent flow", () => {
  // Default (every page but /oauth/consent): no external form target, so an
  // injected <form action="https://evil"> can't exfiltrate autofilled fields.
  assert.deepEqual(d["form-action"], ["'self'"]);
  // Consent flow must POST out to a client's registered redirect URI.
  const broad = directivesOf(buildCsp("db.example.supabase.co", { broadFormAction: true }));
  assert.ok(broad["form-action"].includes("https:"), "consent CSP must allow https form targets");
});

// The core guard: every external script/worker URL the client loaders reference
// must be permitted by the CSP. Add a new CDN dependency without allowlisting it
// and this fails — which is exactly what shipped broken before.
test("every external URL in the client script loaders is allowed by the CSP", () => {
  const loaders = ["src/lib/capture/importFiles.ts"];
  const allowed = new Set(SCRIPT_CDN_ORIGINS);
  for (const file of loaders) {
    const src = readFileSync(new URL(file, root), "utf8");
    // Only URLs used as string values (script/worker sources), not comment links.
    for (const m of src.matchAll(/["'`](https:\/\/[^"'`\s]+)["'`]/g)) {
      const origin = new URL(m[1]).origin;
      assert.ok(
        allowed.has(origin),
        `${file} loads ${origin} but the CSP doesn't allow it — add it to SCRIPT_CDN_ORIGINS or self-host it`,
      );
    }
  }
});

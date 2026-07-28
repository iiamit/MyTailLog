import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAuthorizeUrl,
  normalizeTail,
  expiresAtFrom,
  MFB_AUTHORIZE_URL,
  MFB_SCOPES,
} from "../src/lib/myflightbook";

// --- buildAuthorizeUrl ------------------------------------------------------
test("buildAuthorizeUrl: origin/path match MFB_AUTHORIZE_URL and params match inputs", () => {
  const url = new URL(
    buildAuthorizeUrl({
      clientId: "my-client",
      redirectUri: "https://mytaillog.com/api/mfb/callback",
      state: "abc123",
    }),
  );
  const base = new URL(MFB_AUTHORIZE_URL);
  assert.equal(url.origin, base.origin); // https://myflightbook.com
  assert.equal(url.pathname, base.pathname); // /logbook/mvc/oAuth/Authorize
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), "my-client");
  assert.equal(url.searchParams.get("redirect_uri"), "https://mytaillog.com/api/mfb/callback");
  assert.equal(url.searchParams.get("scope"), MFB_SCOPES); // "readaircraft readflight"
  assert.equal(url.searchParams.get("state"), "abc123");
  // No PKCE in this implementation.
  assert.equal(url.searchParams.get("code_challenge"), null);
  assert.equal(url.searchParams.get("code_challenge_method"), null);
});

// --- normalizeTail ----------------------------------------------------------
test("normalizeTail: uppercases and strips all non-alphanumerics (leading N kept)", () => {
  assert.equal(normalizeTail("n123ab"), "N123AB");
  assert.equal(normalizeTail("N-123-AB"), "N123AB");
  assert.equal(normalizeTail("  n123 ab  "), "N123AB"); // whitespace stripped
  assert.equal(normalizeTail("g-abcd"), "GABCD"); // no leading-N assumption
});

// --- expiresAtFrom ----------------------------------------------------------
test("expiresAtFrom: null in → null out", () => {
  assert.equal(expiresAtFrom(null), null);
});

test("expiresAtFrom: a number → an ISO timestamp ~that many seconds ahead", () => {
  const before = Date.now();
  const iso = expiresAtFrom(3600);
  const after = Date.now();
  assert.ok(iso != null);
  const t = Date.parse(iso!);
  assert.ok(!Number.isNaN(t), "parses as a date");
  // Should sit ~3600s ahead of now; bracket by the real-clock window + slack.
  assert.ok(t >= before + 3600_000 - 2000, `too early: ${iso}`);
  assert.ok(t <= after + 3600_000 + 2000, `too late: ${iso}`);
});

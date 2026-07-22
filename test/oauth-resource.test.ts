import { test, before } from "node:test";
import assert from "node:assert/strict";

// RATE_PER_MIN is read from env at module load, so set it (sync, top-level)
// BEFORE the module is imported — the dynamic import happens in the before hook.
process.env.API_V1_RATE_PER_MIN = "3";
let ApiError: typeof import("../src/lib/oauth/resource").ApiError;
let requireScope: typeof import("../src/lib/oauth/resource").requireScope;
let rateLimit: typeof import("../src/lib/oauth/resource").rateLimit;
let apiError: typeof import("../src/lib/oauth/resource").apiError;
before(async () => {
  ({ ApiError, requireScope, rateLimit, apiError } = await import("../src/lib/oauth/resource"));
});

const caller = (scopes: string[]) => ({
  accountId: "acct-1",
  clientId: "client-1",
  scopes: new Set(scopes),
});

// --- requireScope ----------------------------------------------------------
test("requireScope: returns void when the scope is present", () => {
  assert.equal(requireScope(caller(["readaircraft"]), "readaircraft"), undefined);
});

test("requireScope: throws ApiError(403, insufficient_scope) when absent", () => {
  assert.throws(
    () => requireScope(caller(["readflight"]), "readaircraft"),
    (e: unknown) => {
      assert.ok(e instanceof ApiError);
      assert.equal(e.status, 403);
      assert.equal(e.code, "insufficient_scope");
      return true;
    },
  );
});

// --- rateLimit (token bucket, RATE_PER_MIN=3, distinct clientIds per test) --
test("rateLimit: first call is ok", () => {
  assert.equal(rateLimit("rl-first", 1_000), undefined);
});

test("rateLimit: calls under the limit are ok", () => {
  const now = 1_000;
  rateLimit("rl-under", now); // count 1
  rateLimit("rl-under", now); // count 2
  assert.equal(rateLimit("rl-under", now), undefined); // count 3, still allowed
});

test("rateLimit: at the limit it throws ApiError(429, rate_limited)", () => {
  const now = 1_000;
  rateLimit("rl-limit", now); // 1
  rateLimit("rl-limit", now); // 2
  rateLimit("rl-limit", now); // 3
  assert.throws(
    () => rateLimit("rl-limit", now), // 4th → over the cap of 3
    (e: unknown) => {
      assert.ok(e instanceof ApiError);
      assert.equal(e.status, 429);
      assert.equal(e.code, "rate_limited");
      return true;
    },
  );
});

test("rateLimit: the window resets once now passes resetAt", () => {
  const now = 1_000;
  rateLimit("rl-reset", now);
  rateLimit("rl-reset", now);
  rateLimit("rl-reset", now);
  assert.throws(() => rateLimit("rl-reset", now)); // capped in the first window
  // 61s later the window (resetAt = now + 60_000) has passed → fresh bucket.
  assert.equal(rateLimit("rl-reset", now + 61_000), undefined);
});

// --- apiError --------------------------------------------------------------
test("apiError: ApiError uses its status and JSON body { error, error_description }", async () => {
  const res = apiError(new ApiError(404, "not_found", "No such aircraft."));
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "not_found", error_description: "No such aircraft." });
});

test("apiError: a 401 sets a WWW-Authenticate header", async () => {
  const res = apiError(new ApiError(401, "invalid_token", "Token is invalid or expired."));
  assert.equal(res.status, 401);
  assert.ok(res.headers.get("WWW-Authenticate"));
  assert.match(res.headers.get("WWW-Authenticate")!, /invalid_token/);
});

test("apiError: insufficient_scope sets a WWW-Authenticate header", async () => {
  const res = apiError(new ApiError(403, "insufficient_scope", "needs the readaircraft scope"));
  assert.equal(res.status, 403);
  assert.match(res.headers.get("WWW-Authenticate")!, /insufficient_scope/);
  assert.deepEqual(await res.json(), {
    error: "insufficient_scope",
    error_description: "needs the readaircraft scope",
  });
});

test("apiError: a non-ApiError returns 500 { error: 'server_error' }", async () => {
  const res = apiError(new Error("boom"));
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "server_error" });
});

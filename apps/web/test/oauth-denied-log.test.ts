import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, deniedLogRow, requestPath, type ApiCaller } from "../src/lib/oauth/resource";

const caller: ApiCaller = {
  accountId: "acct-1",
  clientId: "client-1",
  scopes: new Set(["hours:write"]),
};

// The rule this whole change exists for: oauth_access_log only ever held
// successes, so a partner pushing nightly into a rejection looked exactly like a
// partner that had stopped sending. Denials are now recorded — but only when
// they belong to someone.
test("an identified denial is recorded with its status and error CODE", () => {
  const row = deniedLogRow(
    caller,
    "ac-1",
    "hours:write",
    "POST /api/v1/aircraft/ac-1/hours",
    new ApiError(403, "insufficient_scope", "This endpoint requires the hours:write scope."),
  );
  assert.ok(row);
  assert.equal(row.status, 403);
  assert.equal(row.error, "insufficient_scope");
  assert.equal(row.client_id, "client-1");
  assert.equal(row.account_id, "acct-1");
  assert.equal(row.aircraft_id, "ac-1");
});

test("the human-readable message is NOT stored — only the code", () => {
  // ApiError messages can carry caller-supplied text, and this table is
  // owner-readable, so the message must not ride along.
  const err = new ApiError(404, "not_found", "No such aircraft: <script>alert(1)</script>");
  const row = deniedLogRow(caller, "ac-1", "airworthiness:read", "GET /x", err);
  assert.equal(row?.error, "not_found");
  assert.ok(
    !JSON.stringify(row).includes("script"),
    "the error message must never reach the stored row",
  );
});

// The abuse guard. A 401 from a token we can't resolve has no client to attribute,
// so persisting a row per attempt would let anyone on the internet grow an
// owner-readable table without bound. Those go to the server log instead.
test("an UNIDENTIFIED caller produces no row at all", () => {
  for (const err of [
    new ApiError(401, "invalid_token", "Missing bearer token."),
    new ApiError(401, "invalid_token", "Token is invalid or expired."),
  ]) {
    assert.equal(
      deniedLogRow(null, "ac-1", "hours:write", "POST /x", err),
      null,
      "an unattributable 401 must not be written to the database",
    );
  }
});

test("a non-ApiError degrades to a 500/server_error rather than leaking the throw", () => {
  const row = deniedLogRow(caller, null, "hours:write", "POST /x", new Error("connect ECONNREFUSED 10.0.0.5:5432"));
  assert.equal(row?.status, 500);
  assert.equal(row?.error, "server_error");
  assert.ok(!JSON.stringify(row).includes("ECONNREFUSED"), "internal detail must not be stored");
});

test("requestPath records method + pathname and drops the query string", () => {
  const req = new Request("https://mytaillog.com/api/v1/aircraft/ac-1/hours?token=leaky&x=1", {
    method: "POST",
  });
  assert.equal(requestPath(req), "POST /api/v1/aircraft/ac-1/hours");
});

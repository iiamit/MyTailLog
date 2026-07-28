import { test } from "node:test";
import assert from "node:assert/strict";
import { OAUTH_SCOPES, DATA_SCOPES, SCOPE_LABELS } from "../src/lib/oauth/scopes";

test("OAUTH_SCOPES: includes the OIDC scopes and the per-aircraft data scopes", () => {
  assert.ok(OAUTH_SCOPES.includes("openid"));
  assert.ok(OAUTH_SCOPES.includes("offline_access"));
  assert.ok(OAUTH_SCOPES.includes("hours:read"));
  assert.ok(OAUTH_SCOPES.includes("hours:write"));
});

test("DATA_SCOPES: excludes openid and offline_access, and is a subset of OAUTH_SCOPES", () => {
  assert.ok(!DATA_SCOPES.includes("openid" as never));
  assert.ok(!DATA_SCOPES.includes("offline_access" as never));
  for (const s of DATA_SCOPES) assert.ok(OAUTH_SCOPES.includes(s), `${s} in OAUTH_SCOPES`);
  assert.equal(DATA_SCOPES.length, OAUTH_SCOPES.length - 2);
});

test("SCOPE_LABELS: every data scope has a human label", () => {
  for (const s of DATA_SCOPES) {
    assert.ok(SCOPE_LABELS[s] && SCOPE_LABELS[s].length > 0, `${s} has a label`);
  }
});

test("SCOPE_LABELS: has no label for the implicit OIDC scopes", () => {
  assert.equal(SCOPE_LABELS["openid"], undefined);
  assert.equal(SCOPE_LABELS["offline_access"], undefined);
});

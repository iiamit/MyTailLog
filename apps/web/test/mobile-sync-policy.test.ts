import { test } from "node:test";
import assert from "node:assert/strict";
import { deliveryDecision } from "../../mobile/src/sync-policy";

test("mobile writes sync online and stay pending offline", () => {
  assert.equal(deliveryDecision(true, 1), "sync");
  assert.equal(deliveryDecision(false, 1), "pending");
  assert.equal(deliveryDecision(false, 0), "synced");
});

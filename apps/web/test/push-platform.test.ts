import { test } from "node:test";
import assert from "node:assert/strict";
import { tokensByPlatform } from "../src/app/api/push/devices";
import { isUnregistered } from "../src/app/api/push/fcm";

test("mixed device tokens go only to their own push service", () => {
  assert.deepEqual(tokensByPlatform([
    { token: "apple-1", platform: "ios" },
    { token: "google-1", platform: "android" },
    { token: "apple-2", platform: "ios" },
  ]), { ios: ["apple-1", "apple-2"], android: ["google-1"] });
});

test("only a confirmed expired FCM registration is removed", () => {
  const gone = { error: { details: [{ errorCode: "UNREGISTERED" }] } };
  assert.equal(isUnregistered(404, gone), true);
  assert.equal(isUnregistered(404, { error: { status: "NOT_FOUND" } }), false);
  assert.equal(isUnregistered(400, { error: { details: [{ errorCode: "INVALID_ARGUMENT" }] } }), false);
});

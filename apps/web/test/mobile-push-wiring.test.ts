import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// push.ts is wired ONLY by a module-level side effect: an onAuthStateChange
// hook that is the sole caller of registerForPush(). Nothing imports that
// function, so if the hook is ever removed the whole registration path becomes
// unreferenced, Rollup drops it from the bundle, and the app silently never
// registers for notifications — no error, no token, no row on the server.
//
// That is not hypothetical: it happened while fixing the listener race, and the
// only reason it was caught before shipping was grepping the built bundle.
// These assertions are cheap and fail loudly.

const src = readFileSync(join(import.meta.dirname, "../../mobile/src/push.ts"), "utf8");

test("registerForPush has a caller — the auth-state hook", () => {
  assert.match(src, /supabase\.auth\.onAuthStateChange\(/, "the module-level hook is gone");
  assert.match(src, /registerForPush\(\)/, "nothing calls registerForPush");
});

test("the hook registers on a restored session, not just a fresh sign-in", () => {
  // INITIAL_SESSION is what fires when the app reopens with a stored session —
  // the common case. Without it, only a fresh sign-in would ever register.
  assert.match(src, /INITIAL_SESSION/);
  assert.match(src, /SIGNED_IN/);
});

test("listeners are attached before register() is called", () => {
  // The 1.4.1 bug: addListener returns a Promise, so register() must await it.
  const i = src.indexOf("Promise.all");
  const j = src.indexOf("PushNotifications.register()");
  assert.ok(i > 0, "the listeners are not awaited together");
  assert.ok(i < j, "register() must come after the listeners are attached");
});

test("a failure keeps its reason instead of discarding it", () => {
  assert.match(src, /lastError/, "the APNs error message is thrown away again");
});

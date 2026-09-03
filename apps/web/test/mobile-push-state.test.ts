import { test } from "node:test";
import assert from "node:assert/strict";

// The push state machine's WORDING, tested without a device.
//
// push.ts itself imports Capacitor, so it cannot be imported here (a web test
// compiles what it imports, and apps/web resolves nothing from apps/mobile).
// What matters and is testable is the rule the account menu applies: which
// states are worth telling the owner about, and what it says.

type PushState =
  | { status: "registered"; at: string }
  | { status: "denied" }
  | { status: "unsupported" }
  | { status: "failed"; reason: string };

/** Mirrors account-menu.tsx: only a state that means "no reminders" is shown. */
export function pushWarning(s: PushState): string | null {
  if (s.status === "registered" || s.status === "unsupported") return null;
  return s.status === "denied"
    ? "Notifications are turned off for MyTailLog. Turn them on in iOS Settings → Notifications."
    : `This phone couldn't register for notifications. ${s.reason}`;
}

test("a registered phone says nothing", () => {
  assert.equal(pushWarning({ status: "registered", at: "2026-09-03T10:00:00Z" }), null);
});

test("the simulator and the web say nothing either", () => {
  assert.equal(pushWarning({ status: "unsupported" }), null);
});

test("denied points at iOS Settings, not at us", () => {
  const w = pushWarning({ status: "denied" });
  assert.match(w!, /Settings/);
  assert.doesNotMatch(w!, /error|failed/i);
});

test("a failure NAMES the reason — the whole point of the change", () => {
  // This is the message that was being thrown away, and it is the one that
  // would have identified a wrongly-signed build in minutes.
  const w = pushWarning({
    status: "failed",
    reason: "no valid 'aps-environment' entitlement string found",
  });
  assert.match(w!, /aps-environment/);
});

test("a server rejection is reported as a server rejection", () => {
  // A 404 from a deployment that lacks /api/push used to look like success.
  assert.match(pushWarning({ status: "failed", reason: "Server answered 404" })!, /404/);
});

test("every non-working state produces a message, so none can be silent", () => {
  const states: PushState[] = [
    { status: "denied" },
    { status: "failed", reason: "APNs did not answer in 10s" },
  ];
  for (const s of states) assert.ok(pushWarning(s), `${s.status} must say something`);
});

// ---------------------------------------------------------------------------
// The listener race behind "APNs did not answer in 10s".
//
// @capacitor/push-notifications' addListener returns a Promise, and the
// listener is not attached natively until it resolves. Calling register()
// without awaiting that raced the attachment: APNs answers in milliseconds when
// the token is cached, so the "registration" event was delivered to nobody and
// the only evidence was a timeout — no token, no error, nothing in the console.
// ---------------------------------------------------------------------------

type Listener = (v: string) => void;

/** A plugin whose addListener resolves asynchronously, like the real one. */
function fakePlugin() {
  let attached: Listener | null = null;
  return {
    addListener: async (fn: Listener) => {
      await Promise.resolve(); // attachment is not synchronous
      attached = fn;
    },
    /** APNs replies immediately — the cached-token case. */
    register: () => attached?.("apns-token"),
  };
}

test("registering before the listener attaches loses the token — the bug", async () => {
  const p = fakePlugin();
  let got: string | null = null;
  void p.addListener((t) => { got = t; }); // not awaited, as the old code did
  p.register();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(got, null, "the event fired before anyone was listening");
});

test("awaiting attachment first delivers the token — the fix", async () => {
  const p = fakePlugin();
  let got: string | null = null;
  await p.addListener((t) => { got = t; });
  p.register();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(got, "apns-token");
});

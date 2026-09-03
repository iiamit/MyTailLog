import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { API_BASE, supabase } from "./supabase";

// ===========================================================================
// Push notifications — the device end.
//
// The server sends one thing today: the same "coming due" reminder the daily
// email carries (api/cron/daily → pushReminder). That is the whole point of the
// permission prompt, so it is only asked for once the owner is signed in and
// has an aircraft — asking on the splash screen is how an app gets denied
// permanently on first launch and never gets it back.
//
// The token is registered on every launch, not once: iOS reissues it after a
// restore, an OS upgrade or a long uninstall, and a stale token is a reminder
// that silently stops arriving.
// ===========================================================================

const PLATFORM = "ios";

// ---------------------------------------------------------------------------
// Why this file reports its state instead of failing quietly.
//
// Every failure path here used to end at `done(null)` or a bare `catch`, so a
// device that never registered looked exactly like one that did: no error, no
// row on the server, nothing on screen. That cost a release to diagnose — the
// answer (an archive signed `aps-environment: development`, which iOS refuses
// to register on a TestFlight build) was in a message this code was throwing
// away.
//
// A reminder that silently stops arriving is the worst failure this app has, so
// the state is now kept and shown. Still no alert: the account menu is where
// someone looks when they wonder why nothing arrived.
// ---------------------------------------------------------------------------

export type PushState =
  | { status: "registered"; at: string }
  | { status: "denied" }
  | { status: "unsupported" }
  | { status: "failed"; reason: string };

let state: PushState = { status: "unsupported" };
const watchers = new Set<(s: PushState) => void>();

function setState(next: PushState): void {
  state = next;
  for (const w of watchers) w(next);
}

/** The last known registration state, for the account menu. */
export function pushState(): PushState {
  return state;
}

/** Subscribe to registration state; returns an unsubscribe. */
export function onPushState(fn: (s: PushState) => void): () => void {
  watchers.add(fn);
  return () => watchers.delete(fn);
}

async function bearer(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * Ask (once) for permission and register this device with the server.
 *
 * Returns the granted state so the caller can word its own settings row. Silent
 * about failure otherwise: no reminder is a worse outcome than a wrong-looking
 * toggle, but neither is worth an alert in front of someone opening the app at
 * the aircraft. Safe to call on every launch and off the native platform.
 */
export async function registerForPush(): Promise<"granted" | "denied" | "unavailable"> {
  if (!Capacitor.isNativePlatform()) return "unavailable";
  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") {
      setState({ status: "denied" });
      return "denied";
    }

    const token = await tokenFromApns();
    if (!token) {
      // Permission is real, but APNs refused or never answered. THIS is the
      // case that used to look like success.
      setState({ status: "failed", reason: lastError ?? "APNs did not answer in 10s" });
      return "granted";
    }
    const sent = await postToken("POST", token);
    setState(sent.ok
      ? { status: "registered", at: new Date().toISOString() }
      : { status: "failed", reason: sent.reason });
    return "granted";
  } catch (e) {
    setState({ status: "failed", reason: e instanceof Error ? e.message : String(e) });
    return "unavailable";
  }
}

/**
 * Stop this device receiving reminders — called on sign-out, before the session
 * goes, so the token is removed with the owner's own credentials.
 */
export async function unregisterPush(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const token = lastToken;
    if (token) await postToken("DELETE", token);
    await PushNotifications.removeAllListeners();
    setState({ status: "unsupported" });
  } catch {
    /* signing out matters more than tidying up */
  }
}

// APNs answers `register()` asynchronously through a listener, so the token has
// to be awaited. It is kept so sign-out can unregister the same one.
let lastToken: string | null = null;
/** The reason APNs gave, kept so the failure can be named rather than guessed. */
let lastError: string | null = null;

function tokenFromApns(): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (t: string | null) => {
      if (settled) return;
      settled = true;
      if (t) lastToken = t;
      resolve(t);
    };

    // No answer at all is normal in the simulator and offline; don't hang the
    // caller's launch on it.
    const timer = setTimeout(() => {
      lastError = lastError ?? "APNs did not answer in 10s";
      done(null);
    }, 10_000);

    // addListener returns a PROMISE, and the listener is not attached natively
    // until it resolves. register() must therefore be awaited BEHIND both of
    // them: APNs answers in milliseconds when the token is already cached, so
    // firing register() on the next line raced the attachment and the
    // "registration" event was delivered to nobody. The symptom was silence —
    // no token, no error, no console line — and then this timeout.
    void (async () => {
      try {
        await Promise.all([
          PushNotifications.addListener("registration", (t) => {
            clearTimeout(timer);
            done(t.value);
          }),
          PushNotifications.addListener("registrationError", (e) => {
            clearTimeout(timer);
            // The message names the cause outright — most often "no valid
            // 'aps-environment' entitlement string found", which means the
            // build was signed for the wrong channel.
            lastError = (e as { error?: string } | undefined)?.error ?? "APNs refused the registration";
            done(null);
          }),
        ]);
        await PushNotifications.register();
      } catch (e) {
        clearTimeout(timer);
        lastError = e instanceof Error ? e.message : "register() threw";
        done(null);
      }
    })();

  });
}

async function postToken(
  method: "POST" | "DELETE",
  token: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const jwt = await bearer();
  if (!jwt) return { ok: false, reason: "Not signed in" };
  try {
    const res = await CapacitorHttp.request({
      method,
      url: `${API_BASE}/api/push`,
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      data: { token, platform: PLATFORM },
    });
    // The status was never checked here, so a 404 from a server that had not
    // deployed this route yet was indistinguishable from success.
    if (res.status >= 200 && res.status < 300) return { ok: true };
    const body = typeof res.data === "string" ? res.data : JSON.stringify(res.data ?? {});
    return { ok: false, reason: `Server answered ${res.status}${body ? ` — ${body.slice(0, 120)}` : ""}` };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Could not reach the server" };
  }
}

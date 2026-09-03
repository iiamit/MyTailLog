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
    if (perm.receive !== "granted") return "denied";

    const token = await tokenFromApns();
    if (!token) return "granted"; // permission is real; APNs just hasn't answered
    await postToken("POST", token);
    return "granted";
  } catch {
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
  } catch {
    /* signing out matters more than tidying up */
  }
}

// APNs answers `register()` asynchronously through a listener, so the token has
// to be awaited. It is kept so sign-out can unregister the same one.
let lastToken: string | null = null;

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
    const timer = setTimeout(() => done(null), 10_000);
    void PushNotifications.addListener("registration", (t) => {
      clearTimeout(timer);
      done(t.value);
    });
    void PushNotifications.addListener("registrationError", () => {
      clearTimeout(timer);
      done(null);
    });
    void PushNotifications.register();
  });
}

// Registering is an auth-state concern, not a screen's, so it hangs off the
// session rather than off some component's mount: sign in (or come back with a
// stored session) and the device is registered; that is the whole rule. Guarded
// so React's double-invoked effects and a token refresh don't re-prompt.
let registering = false;
if (Capacitor.isNativePlatform()) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (!session || registering) return;
    if (event !== "SIGNED_IN" && event !== "INITIAL_SESSION") return;
    registering = true;
    void registerForPush().finally(() => {
      registering = false;
    });
  });
}

async function postToken(method: "POST" | "DELETE", token: string): Promise<void> {
  const jwt = await bearer();
  if (!jwt) return;
  await CapacitorHttp.request({
    method,
    url: `${API_BASE}/api/push`,
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    data: { token, platform: PLATFORM },
  });
}

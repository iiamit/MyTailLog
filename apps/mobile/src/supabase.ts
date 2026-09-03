import { Capacitor } from "@capacitor/core";
import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anon) {
  throw new Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in apps/mobile/.env");
}

// The session — access token AND refresh token — is what stands between a lost
// phone and someone else's maintenance records, so on a device it lives in the
// iOS Keychain, not in WKWebView's local storage (which is readable from a file
// backup and is wiped by "Clear website data").
//
// `whenUnlocked` deliberately, not `afterFirstUnlock`: nothing here runs in the
// background, so there is no reason for the token to be reachable while the
// phone is locked. `setSynchronize(false)` keeps it off iCloud Keychain — a
// session belongs to one device.
//
// ponytail: no biometric gate. This plugin has no biometry option (that is a
// separate @aparajita plugin), and Face ID in front of an app whose whole point
// is being usable one-handed at the aircraft is a cost with no attacker it
// stops that the device passcode doesn't already.
const native = Capacitor.isNativePlatform();

if (native) {
  void SecureStorage.setSynchronize(false).catch(() => {});
}

const keychain = {
  async getItem(key: string): Promise<string | null> {
    const v = await SecureStorage.getItem(key).catch(() => null);
    if (v != null) return v;
    // One-time carry-over: builds before this one kept the session in local
    // storage. Without this every existing beta tester is signed out on update.
    const legacy = readLegacy(key);
    if (legacy != null) {
      await SecureStorage.setItem(key, legacy).catch(() => {});
      clearLegacy(key);
    }
    return legacy;
  },
  async setItem(key: string, value: string): Promise<void> {
    await SecureStorage.setItem(key, value);
  },
  async removeItem(key: string): Promise<void> {
    await SecureStorage.removeItem(key).catch(() => {});
    clearLegacy(key);
  },
};

function readLegacy(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function clearLegacy(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    /* nothing to clean up */
  }
}

// The anon key is public (same as the web bundle); RLS protects the data.
export const supabase = createClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // In a desktop browser (`npm run dev`) there is no Keychain; supabase-js
    // falls back to local storage on its own.
    ...(native ? { storage: keychain } : {}),
  },
});

// Where the self-hosted sync API lives. Defaults to prod.
export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || "https://mytaillog.com";

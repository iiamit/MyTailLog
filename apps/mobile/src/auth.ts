import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabase";
import { wipeForSignOut } from "./db";
import { clearCache } from "./blobs";
import { AUTH_RETURN, parseAuthReturn } from "./auth-url";

export type SocialProvider = "google" | "apple";
export { AUTH_RETURN } from "./auth-url";
const LINK_USER_KEY = "mytaillog:auth:link-user";
const handled = new Set<string>();

/** A browser OAuth flow returns a one-use code. The same Supabase client owns
 * the PKCE verifier (in secure storage) and exchanges it for the normal session. */
export async function finishAuthReturn(raw: string): Promise<string | null> {
  const result = parseAuthReturn(raw);
  if (!result || handled.has(raw)) return null;
  handled.add(raw);
  const expectedUser = localStorage.getItem(LINK_USER_KEY);
  localStorage.removeItem(LINK_USER_KEY);
  try {
    if (result.error) return result.error;
    const code = result.code;
    if (!code) return "The sign-in did not return a code. Please try again.";
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return error.message;
    if (expectedUser && data.user?.id !== expectedUser) {
      await wipeForSignOut();
      await clearCache();
      await supabase.auth.signOut();
      return "This sign-in belongs to another account. Sign in with your original email and connect it again.";
    }
    return null;
  } finally {
    await Browser.close().catch(() => {});
  }
}

export function listenForAuthReturns(report: (message: string) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};
  let active = true;
  void App.addListener("appUrlOpen", ({ url }) => {
    void finishAuthReturn(url).then((message) => {
      if (active && message) report(message);
    }).catch((error) => {
      if (active) report(error instanceof Error ? error.message : "Sign-in failed.");
    });
  }).then((handle) => {
    if (!active) void handle.remove();
    else remove = () => void handle.remove();
  });
  let remove = () => {};
  void App.getLaunchUrl().then((launch) => {
    const url = launch?.url;
    if (url) void finishAuthReturn(url).then((message) => {
      if (active && message) report(message);
    }).catch((error) => {
      if (active) report(error instanceof Error ? error.message : "Sign-in failed.");
    });
  }).catch(() => {});
  return () => { active = false; remove(); };
}

export async function startSocialAuth(provider: SocialProvider, linkUserId?: string): Promise<void> {
  if (linkUserId) localStorage.setItem(LINK_USER_KEY, linkUserId);
  else localStorage.removeItem(LINK_USER_KEY);
  try {
    const credentials = { provider, options: { redirectTo: AUTH_RETURN, skipBrowserRedirect: true } } as const;
    const { data, error } = linkUserId
      ? await supabase.auth.linkIdentity(credentials)
      : await supabase.auth.signInWithOAuth(credentials);
    if (error) throw error;
    if (!data.url) throw new Error("Sign-in could not be started.");
    await Browser.open({ url: data.url });
  } catch (error) {
    localStorage.removeItem(LINK_USER_KEY);
    throw error;
  }
}

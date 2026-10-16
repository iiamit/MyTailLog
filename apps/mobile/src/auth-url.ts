export const AUTH_RETURN = "com.mytaillog.app://auth/callback";

/** Accept only this app's registered return route; a pasted URL is never an
 * instruction to exchange a code or display an error. */
export function parseAuthReturn(raw: string): { code: string | null; error: string | null } | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "com.mytaillog.app:" || url.hostname !== "auth" || url.pathname !== "/callback") return null;
    return {
      code: url.searchParams.get("code"),
      error: url.searchParams.get("error_description") || url.searchParams.get("error"),
    };
  } catch {
    return null;
  }
}

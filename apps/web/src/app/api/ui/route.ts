import { NextResponse, type NextRequest } from "next/server";
import { THEME_COOKIE, UI_COOKIE, UI_COOKIE_MAX_AGE_S, parseTheme, safeNext } from "@/lib/uiV2";

/**
 * GET /api/ui?design=v2|v1&theme=system|light|dark&next=/path — "Try the new design" / "Switch back" and the
 * appearance setting. Only flips presentation cookies, then returns to a same-origin page.
 * shortcut: the choice lives in a cookie per browser, not in profile.preferences; move it there when v2 becomes
 * the default (13 §6, phase 6) so it follows the owner across devices.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const res = NextResponse.redirect(new URL(safeNext(params.get("next")), request.url));
  const opts = {
    maxAge: UI_COOKIE_MAX_AGE_S,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
  const design = params.get("design");
  if (design === "v2") res.cookies.set(UI_COOKIE, "v2", opts);
  if (design === "v1") res.cookies.delete(UI_COOKIE);
  if (params.has("theme")) res.cookies.set(THEME_COOKIE, parseTheme(params.get("theme") ?? undefined), opts);
  return res;
}

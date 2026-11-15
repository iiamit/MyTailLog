import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { createServiceClient } from "@/lib/supabase/service";
import {
  SOURCE_COOKIE,
  SOURCE_MAX_AGE_S,
  decodeSource,
  encodeSource,
  isFreshAccount,
  sourceFromLanding,
} from "@/lib/signupSource";

/**
 * Refreshes the Supabase auth session on every request and redirects
 * unauthenticated users away from protected routes. Called from middleware.ts.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() revalidates the token with Supabase — do not remove.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/aircraft") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/admin");

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return withSourceCookie(request, NextResponse.redirect(url));
  }

  if (user && request.cookies.has(SOURCE_COOKIE)) {
    await claimSource(user.id, user.created_at, request.cookies.get(SOURCE_COOKIE)?.value);
    response.cookies.delete(SOURCE_COOKIE);
    return response;
  }

  return user ? response : withSourceCookie(request, response);
}

/** First touch: set mtl_src for an anonymous visitor from a tagged link or another site. */
function withSourceCookie(request: NextRequest, response: NextResponse) {
  // A record room's visitor is attributed by its footer link (?ref=record-room), not the mail client that opened /r.
  if (request.cookies.has(SOURCE_COOKIE) || request.nextUrl.pathname.startsWith("/r/")) return response;
  const source = sourceFromLanding(request.nextUrl, request.headers.get("referer"), request.nextUrl.hostname);
  if (source) {
    response.cookies.set(SOURCE_COOKIE, encodeSource(source), {
      maxAge: SOURCE_MAX_AGE_S,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
  }
  return response;
}

/**
 * Copy the cookie onto a brand-new profile. Service role: signup_source is not
 * user-writable (0066). Never blocks the request on failure.
 */
async function claimSource(userId: string, createdAt: string | undefined, value: string | undefined) {
  const source = decodeSource(value);
  if (!source || !isFreshAccount(createdAt)) return;
  try {
    await createServiceClient()
      .from("profile")
      .update({ signup_source: source })
      .eq("id", userId)
      .is("signup_source", null);
  } catch (e) {
    console.error("signup source claim failed", e);
  }
}

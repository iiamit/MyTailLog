"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PlaneIcon, UserIcon, LogoutIcon, HelpIcon } from "./icons";
import { APP_VERSION } from "@/lib/version";

// Public routes render no app chrome.
const PUBLIC = (path: string) =>
  path === "/" || path.startsWith("/login") || path.startsWith("/auth");

/**
 * Persistent top bar for signed-in views: wordmark → dashboard, plus profile
 * and sign-out. Per-aircraft context stays in each page's own header.
 */
export function AppHeader({ email }: { email: string | null }) {
  const pathname = usePathname();
  const router = useRouter();

  if (!email || PUBLIC(pathname)) return null;

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  const onProfile = pathname.startsWith("/profile");

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 font-semibold tracking-tight hover:opacity-80"
        >
          <PlaneIcon className="text-base text-slate-900 dark:text-white" />
          MyTailLog
          <span className="ml-1 font-normal text-[11px] text-slate-400 dark:text-slate-500">
            v{APP_VERSION}
          </span>
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          <Link
            href="/help"
            aria-current={pathname.startsWith("/help") ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 ${
              pathname.startsWith("/help") ? "font-medium text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-300"
            }`}
          >
            <HelpIcon />
            <span className="hidden sm:inline">Help</span>
          </Link>
          <Link
            href="/profile"
            aria-current={onProfile ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 ${
              onProfile ? "font-medium text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-300"
            }`}
          >
            <UserIcon />
            <span className="hidden sm:inline">Profile</span>
          </Link>
          <button
            onClick={signOut}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <LogoutIcon />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </nav>
      </div>
    </header>
  );
}

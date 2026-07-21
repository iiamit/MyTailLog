"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { UserIcon, LogoutIcon, HelpIcon } from "./icons";
import { APP_VERSION } from "@/lib/version";

// Public routes render no app chrome.
const PUBLIC = (path: string) =>
  path === "/" || path.startsWith("/login") || path.startsWith("/auth");
// Inside a specific aircraft, the AircraftShell provides its own top bar + rail.
const IN_AIRCRAFT = (path: string) =>
  path.startsWith("/aircraft/") && !path.startsWith("/aircraft/enroll");

/**
 * Global top bar for signed-in views that aren't scoped to one aircraft
 * (hangar, profile, help, enroll). Per-aircraft chrome lives in AircraftShell.
 */
export function AppHeader({ email }: { email: string | null }) {
  const pathname = usePathname();
  const router = useRouter();

  if (!email || PUBLIC(pathname) || IN_AIRCRAFT(pathname)) return null;

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  const link = (href: string, active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[13px] ${
      active ? "font-medium text-ink" : "text-dim hover:bg-panel hover:text-ink"
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-[60px] max-w-6xl items-center justify-between px-5 sm:px-7">
        <Link href="/dashboard" className="flex items-center gap-2.5 hover:opacity-90">
          <span
            className="h-[22px] w-[22px]"
            style={{
              background: "conic-gradient(from 45deg,var(--accent),#8ec8ff)",
              clipPath: "polygon(50% 0,100% 86%,0 86%)",
            }}
          />
          <span className="font-display text-[17px] font-bold tracking-[0.2px]">MyTailLog</span>
          <span className="readout ml-1 rounded-sm border border-line px-1.5 py-0.5 text-[10px] text-faint">
            v{APP_VERSION}
          </span>
        </Link>

        <nav className="flex items-center gap-0.5">
          <Link href="/help" aria-current={pathname.startsWith("/help") ? "page" : undefined} className={link("/help", pathname.startsWith("/help"))}>
            <HelpIcon />
            <span className="hidden sm:inline">Help</span>
          </Link>
          <Link href="/profile" aria-current={pathname.startsWith("/profile") ? "page" : undefined} className={link("/profile", pathname.startsWith("/profile"))}>
            <UserIcon />
            <span className="hidden sm:inline">Profile</span>
          </Link>
          <button onClick={signOut} className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[13px] text-faint hover:bg-panel hover:text-dim">
            <LogoutIcon />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </nav>
      </div>
    </header>
  );
}

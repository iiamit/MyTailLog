"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavigationMenu } from "./NavigationMenu";

// Left nav rail for the account-level pages (profile, help, and anything else
// not scoped to one aircraft). Sits under the global AppHeader top bar and
// mirrors the aircraft shell's rail styling, so these pages live in the same
// pattern instead of floating with a "← back" link.
type Item = { ident: string; label: string; href: string };
type Group = { label: string; items: Item[] };

const NAV: Group[] = [
  {
    label: "Fleet",
    items: [
      { ident: "HGR", label: "Hangar", href: "/dashboard" },
      { ident: "NEW", label: "Enroll aircraft", href: "/aircraft/enroll" },
    ],
  },
  {
    label: "Account",
    items: [
      { ident: "PRO", label: "Profile", href: "/profile" },
      { ident: "API", label: "Developer API", href: "/developers" },
      { ident: "HLP", label: "Help & docs", href: "/help" },
      { ident: "CHG", label: "What's new", href: "/whats-new" },
    ],
  },
];

export function AccountShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);
  const allItems = NAV.flatMap((g) => g.items);

  return (
    <div className="mx-auto flex max-w-6xl">
      {/* Persistent rail (desktop) — sticky under the 60px top bar. */}
      <nav className="sticky top-[60px] hidden h-[calc(100vh-60px)] w-[236px] shrink-0 flex-col gap-0.5 overflow-auto border-r border-line bg-linear-to-b from-panel to-bg px-3.5 pb-6 pt-5 lg:flex">
        {NAV.map((grp) => (
          <div key={grp.label} className="mt-1.5 first:mt-0">
            <div className="px-2 pb-1.5 text-[9.5px] uppercase tracking-[0.16em] text-faint">{grp.label}</div>
            {grp.items.map((it) => {
              const active = isActive(it.href);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  className={`mb-px flex items-center gap-2.5 rounded-[9px] px-2 py-2 ${
                    active
                      ? "border border-line2 bg-panel2 text-ink"
                      : "border border-transparent text-dim hover:bg-panel/70 hover:text-ink"
                  }`}
                >
                  <span className={`ident ${active ? "text-accent!" : ""}`}>{it.ident}</span>
                  <span className="text-[13px]">{it.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Mobile nav strip + content. */}
      <div className="min-w-0 flex-1">
        <nav aria-label="Account navigation" className="flex items-center justify-between gap-3 border-b border-line bg-panel px-4 py-2 lg:hidden">
          <Link href="/dashboard" aria-current={pathname === "/dashboard" ? "page" : undefined} className="inline-flex min-h-11 items-center text-sm text-dim hover:text-ink">Hangar</Link>
          <span className="min-w-0 truncate text-sm font-medium text-ink">{allItems.find((it) => isActive(it.href))?.label}</span>
          <NavigationMenu label="More">
            {NAV.map((group) => (
              <div key={group.label} className="mb-2 last:mb-0">
                <h2 className="px-3 py-2 text-sm font-semibold text-dim">{group.label}</h2>
                {group.items.map((it) => (
                  <Link key={it.href} href={it.href} aria-current={isActive(it.href) ? "page" : undefined} className={`flex min-h-11 items-center rounded-md px-3 py-2 text-sm hover:bg-panel2 ${isActive(it.href) ? "bg-panel2 text-ink" : "text-dim"}`}>
                    {it.label}
                  </Link>
                ))}
              </div>
            ))}
          </NavigationMenu>
        </nav>
        <div className="animate-up">{children}</div>
      </div>
    </div>
  );
}

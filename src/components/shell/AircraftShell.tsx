"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { APP_VERSION } from "@/lib/version";
import type { AircraftShellContext } from "@/lib/aircraftContext";

type NavItem = { ident: string; label: string; href: string; badge?: number; tone?: "accent" | "amber" };
type NavGroup = { label: string; items: NavItem[] };

function buildNav(ctx: AircraftShellContext): NavGroup[] {
  const a = `/aircraft/${ctx.id}`;
  const groups: NavGroup[] = [
    {
      label: "Records",
      items: [
        { ident: "OVW", label: "Overview", href: a },
        { ident: "TML", label: "Timeline & search", href: `${a}/timeline` },
        { ident: "ASK", label: "Ask your logbook", href: `${a}/ask` },
        { ident: "EQP", label: "Equipment", href: `${a}/equipment`, badge: ctx.badges.equipment, tone: "accent" },
      ],
    },
    {
      label: "Airworthiness",
      items: [
        { ident: "STS", label: "Status", href: `${a}/status`, badge: ctx.badges.status, tone: "amber" },
        { ident: "FCT", label: "Maint. forecast", href: `${a}/maintenance` },
        { ident: "ADS", label: "AD / SB", href: `${a}/compliance` },
        { ident: "WBL", label: "Weight & balance", href: `${a}/weight-balance` },
        { ident: "GAP", label: "Records gaps", href: `${a}/audit` },
      ],
    },
  ];
  if (ctx.canEdit) {
    groups.push({
      label: "Capture",
      items: [
        { ident: "CAP", label: "Capture pages", href: `${a}/capture` },
        { ident: "PGS", label: "Logbook pages", href: `${a}/pages` },
        { ident: "RVW", label: "Review", href: `${a}/review`, badge: ctx.badges.review, tone: "amber" },
        { ident: "DUP", label: "Find duplicates", href: `${a}/duplicates` },
      ],
    });
  }
  groups.push({
    label: "Manage",
    items: [
      { ident: "EXP", label: "Export & backup", href: `${a}/export` },
      ...(ctx.isOwner ? [{ ident: "SHR", label: "Sharing & transfer", href: `${a}/share` }] : []),
    ],
  });
  return groups;
}

function Readout({ value, label, dim }: { value: string; label: string; dim?: boolean }) {
  return (
    <div className="flex flex-col leading-[1.15]">
      <span className={`readout text-[13px] ${dim ? "text-dim" : "text-ink"}`}>{value}</span>
      <span className="text-[9px] uppercase tracking-[0.14em] text-faint">{label}</span>
    </div>
  );
}

function Annunciator({ annun }: { annun: AircraftShellContext["annun"] }) {
  const dot = (color: string, glow: string, n: number) => (
    <div className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${glow}` }} />
      <span className="readout text-xs">{n}</span>
    </div>
  );
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-panel px-3 py-1.5">
      {dot("var(--red)", "var(--red)", annun.overdue)}
      {dot("var(--amb)", "var(--amb)", annun.due)}
      {dot("var(--grn)", "var(--grn)", annun.current)}
    </div>
  );
}

function Badge({ n, tone }: { n: number; tone: "accent" | "amber" }) {
  if (!n) return null;
  const cls =
    tone === "accent"
      ? "border-accent/40 bg-accent-soft text-accent"
      : "border-annun-amber/40 text-annun-amber";
  return (
    <span
      className={`readout ml-auto rounded-md border px-1.5 py-0.5 text-[10px] ${cls}`}
      style={tone === "amber" ? { background: "var(--amb-bg)" } : undefined}
    >
      {n}
    </span>
  );
}

export function AircraftShell({
  context,
  children,
}: {
  context: AircraftShellContext;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const nav = buildNav(context);

  const isActive = (href: string) =>
    href === `/aircraft/${context.id}` ? pathname === href : pathname.startsWith(href);

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  const allItems = nav.flatMap((g) => g.items);

  return (
    // h-screen (not min-h-screen) so the content pane below scrolls INTERNALLY —
    // that makes it the scroll container sticky children (e.g. the review scan)
    // stick within, and keeps the top bar + nav rail fixed like a real cockpit.
    <div className="flex h-screen flex-col">
      {/* Top bar — aircraft context always on. */}
      <header className="sticky top-0 z-40 flex h-[60px] shrink-0 items-center gap-4 border-b border-line bg-bg/85 px-4 backdrop-blur-md sm:gap-5">
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2.5 border-r border-line pr-4">
          <span
            className="h-[22px] w-[22px]"
            style={{
              background: "conic-gradient(from 45deg,var(--accent),#8ec8ff)",
              clipPath: "polygon(50% 0,100% 86%,0 86%)",
            }}
          />
          <span className="font-display text-[17px] font-bold tracking-[0.2px]">MyTailLog</span>
          <span className="readout hidden rounded border border-line px-1.5 py-0.5 text-[10px] text-faint sm:inline">
            v{APP_VERSION}
          </span>
        </Link>

        <div className="flex min-w-0 items-center gap-3">
          <span className="readout text-base font-semibold tracking-[0.5px]">{context.reg}</span>
          {context.demo && (
            <span className="rounded border border-accent-soft bg-accent-soft px-1.5 py-0.5 text-[9px] text-accent">
              DEMO
            </span>
          )}
          <span className="hidden truncate text-[12.5px] text-dim md:inline">{context.type}</span>
          <div className="hidden gap-3.5 border-l border-line pl-4 sm:flex">
            <Readout value={context.tach != null ? String(context.tach) : "—"} label="tach hrs" />
            <Readout value={context.hobbs != null ? String(context.hobbs) : "—"} label="hobbs" dim />
          </div>
        </div>

        <div className="hidden sm:block">
          <Annunciator annun={context.annun} />
        </div>

        <div className="flex-1" />

        <nav className="flex items-center gap-0.5 text-[13px]">
          <Link href="/help" className="rounded-md px-3 py-2 text-dim hover:bg-panel hover:text-ink">
            Help
          </Link>
          <Link href="/profile" className="rounded-md px-3 py-2 text-dim hover:bg-panel hover:text-ink">
            Profile
          </Link>
          <button onClick={signOut} className="rounded-md px-3 py-2 text-faint hover:bg-panel hover:text-dim">
            Sign out
          </button>
        </nav>
      </header>

      {/* Mobile nav strip — full width above the content row. */}
      <nav className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-line bg-panel px-3 py-2 md:hidden">
        {allItems.map((it) => {
          const active = isActive(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] ${
                active ? "border-line2 bg-panel2 text-ink" : "border-line text-dim"
              }`}
            >
              <span className="ident">{it.ident}</span>
              {it.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex min-h-0 flex-1">
        {/* Persistent nav rail (desktop). */}
        <nav className="hidden w-[236px] shrink-0 flex-col gap-0.5 overflow-auto border-r border-line bg-gradient-to-b from-panel to-bg px-3.5 pb-6 pt-4 md:flex">
          <Link
            href="/dashboard"
            className="mb-1 flex items-center gap-2 rounded-[10px] border border-line bg-panel2 p-2 text-left hover:border-line2"
          >
            <div className="flex min-w-0 flex-col">
              <span className="text-[9px] uppercase tracking-[0.16em] text-faint">Current aircraft</span>
              <span className="readout text-[15px] font-semibold tracking-[0.4px]">{context.reg}</span>
            </div>
            <span className="ml-auto whitespace-nowrap text-[10px] text-faint">Hangar →</span>
          </Link>

          {nav.map((grp) => (
            <div key={grp.label} className="mt-3.5">
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
                    <span className={`ident ${active ? "!text-accent" : ""}`}>{it.ident}</span>
                    <span className="text-[13px]">{it.label}</span>
                    {it.badge != null && it.tone && <Badge n={it.badge} tone={it.tone} />}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Content region. Pages control their own max-width (varies by screen);
            during the reskin, un-migrated pages keep their own <main>, so this is
            a <div> to avoid nesting landmarks. */}
        <div className="min-w-0 flex-1 overflow-auto">
          <div className="animate-up">{children}</div>
        </div>
      </div>
    </div>
  );
}

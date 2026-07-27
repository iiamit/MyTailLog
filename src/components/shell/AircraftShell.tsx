"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { APP_VERSION } from "@/lib/version";
import type { AircraftShellContext } from "@/lib/aircraftContext";

type NavTab = { label: string; href: string };
// `match` lists every route the item owns (a hub owns several); `tabs`, when
// present, makes this a hub — the shell renders them as a sub-tab strip.
type NavItem = {
  ident: string;
  label: string;
  href: string;
  badge?: number;
  tone?: "accent" | "amber";
  match?: string[];
  tabs?: NavTab[];
};
type NavGroup = { label?: string; items: NavItem[] };

function buildNav(ctx: AircraftShellContext): NavGroup[] {
  const a = `/aircraft/${ctx.id}`;
  const groups: NavGroup[] = [
    {
      // Top section (no header): the three surfaces you check most, with the two
      // overlap-heavy clusters collapsed into hubs.
      items: [
        { ident: "OVW", label: "Overview", href: a, match: [a] },
        {
          ident: "AWX",
          label: "Airworthiness",
          href: `${a}/status`,
          badge: ctx.badges.status,
          tone: "amber",
          match: [`${a}/status`, `${a}/maintenance`, `${a}/compliance`, `${a}/audit`],
          tabs: [
            { label: "Status", href: `${a}/status` },
            { label: "Forecast", href: `${a}/maintenance` },
            { label: "AD / SB", href: `${a}/compliance` },
            { label: "Records gaps", href: `${a}/audit` },
          ],
        },
        {
          ident: "LOG",
          label: "Logbook",
          href: `${a}/timeline`,
          match: [`${a}/timeline`, `${a}/ask`],
          tabs: [
            { label: "Timeline & search", href: `${a}/timeline` },
            { label: "Ask your logbook", href: `${a}/ask` },
          ],
        },
      ],
    },
    {
      label: "Aircraft",
      items: [
        { ident: "EQP", label: "Equipment", href: `${a}/equipment`, badge: ctx.badges.equipment, tone: "accent" },
        { ident: "OIL", label: "Oil analysis", href: `${a}/oil-analysis` },
        { ident: "WBL", label: "Weight & balance", href: `${a}/weight-balance` },
        { ident: "SQK", label: "Squawks", href: `${a}/squawks` },
        { ident: "DOC", label: "Records Vault", href: `${a}/documents` },
      ],
    },
  ];
  if (ctx.canEdit) {
    groups.push({
      label: "Add records",
      items: [
        { ident: "CAP", label: "Capture pages", href: `${a}/capture` },
        { ident: "PGS", label: "Logbook pages", href: `${a}/pages` },
        { ident: "RVW", label: "Review", href: `${a}/review`, badge: ctx.badges.review, tone: "amber" },
        { ident: "DUP", label: "Fix duplicates", href: `${a}/duplicates` },
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
  const home = `/aircraft/${context.id}`;

  // A route "owns" the current path if it matches exactly, or (for everything but
  // the Overview home) the path sits beneath it — so a hub stays lit across all
  // its sub-routes and /pages lights on /pages/[id]/review.
  const ownsPath = (href: string) =>
    href === home ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  const itemActive = (it: NavItem) => (it.match ?? [it.href]).some(ownsPath);

  // The hub (if any) the current path lives in — drives the sub-tab strip.
  const activeHub = nav.flatMap((g) => g.items).find((it) => it.tabs && itemActive(it));

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
          <span className="readout hidden rounded-sm border border-line px-1.5 py-0.5 text-[10px] text-faint sm:inline">
            v{APP_VERSION}
          </span>
        </Link>

        <div className="flex min-w-0 items-center gap-3">
          <span className="readout text-base font-semibold tracking-[0.5px]">{context.reg}</span>
          {context.demo && (
            <span className="rounded-sm border border-accent-soft bg-accent-soft px-1.5 py-0.5 text-[9px] text-accent">
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
          const active = itemActive(it);
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
        <nav className="hidden w-[236px] shrink-0 flex-col gap-0.5 overflow-auto border-r border-line bg-linear-to-b from-panel to-bg px-3.5 pb-6 pt-4 md:flex">
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

          {nav.map((grp, gi) => (
            <div key={grp.label ?? `top-${gi}`} className={grp.label ? "mt-3.5" : "mt-1"}>
              {grp.label && (
                <div className="px-2 pb-1.5 text-[9.5px] uppercase tracking-[0.16em] text-faint">{grp.label}</div>
              )}
              {grp.items.map((it) => {
                const active = itemActive(it);
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
          {/* Hub sub-tabs — the consolidated views of Airworthiness / Logbook.
              Rendered by the shell so the underlying pages need no changes, and
              works on every viewport (it's the mobile sub-nav too). */}
          {activeHub?.tabs && (
            <div className="sticky top-0 z-30 flex gap-1 overflow-x-auto border-b border-line bg-bg/85 px-4 py-2 backdrop-blur-md md:px-6">
              {activeHub.tabs.map((t) => {
                const active = ownsPath(t.href);
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    aria-current={active ? "page" : undefined}
                    className={`shrink-0 rounded-full border px-3 py-1 text-[12.5px] transition ${
                      active
                        ? "border-line2 bg-panel2 text-ink"
                        : "border-transparent text-dim hover:bg-panel/70 hover:text-ink"
                    }`}
                  >
                    {t.label}
                  </Link>
                );
              })}
            </div>
          )}
          <div className="animate-up">{children}</div>
        </div>
      </div>
    </div>
  );
}

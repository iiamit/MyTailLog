"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { APP_VERSION } from "@/lib/version";
import type { AircraftShellContext } from "@/lib/aircraftContext";
import { NavigationMenu } from "./NavigationMenu";

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
  const edit = ctx.canEdit;
  // Grouped by task, matching the phone's tabs (Status / Log / Records / Squawks),
  // plus the yearly workflows. Several pages share an item as hub tabs; every
  // route keeps its URL.
  return [
    { items: [{ ident: "OVW", label: "Overview", href: a, match: [a] }] },
    {
      label: "Status",
      items: [
        {
          ident: "STS",
          label: "Status & forecast",
          href: `${a}/status`,
          badge: ctx.badges.status,
          tone: "amber",
          match: [`${a}/status`, `${a}/maintenance`, `${a}/compliance`],
          tabs: [
            { label: "Status", href: `${a}/status` },
            { label: "Forecast", href: `${a}/maintenance` },
            { label: "AD / SB", href: `${a}/compliance` },
          ],
        },
        { ident: "SQK", label: "Squawks", href: `${a}/squawks` },
      ],
    },
    {
      label: "Log",
      items: [
        ...(edit
          ? [
              { ident: "CAP", label: "Capture pages", href: `${a}/capture` },
              { ident: "RVW", label: "Review", href: `${a}/review`, badge: ctx.badges.review, tone: "amber" as const },
              { ident: "ENT", label: "Add an entry", href: `${a}/entries/new` },
            ]
          : []),
        {
          ident: "MTR",
          label: "Hours & oil",
          href: `${a}/meters`,
          match: [`${a}/meters`, `${a}/oil-analysis`],
          tabs: [
            { label: "Meters & resets", href: `${a}/meters` },
            { label: "Oil & engine trends", href: `${a}/oil-analysis` },
          ],
        },
      ],
    },
    {
      label: "Records",
      items: [
        {
          ident: "TLN",
          label: "Timeline & Ask",
          href: `${a}/timeline`,
          match: [`${a}/timeline`, `${a}/ask`],
          tabs: [
            { label: "Timeline & search", href: `${a}/timeline` },
            { label: "Ask your logbook", href: `${a}/ask` },
          ],
        },
        ...(edit ? [{ ident: "PGS", label: "Logbook pages", href: `${a}/pages` }] : []),
        { ident: "DOC", label: "Records Vault", href: `${a}/documents` },
        {
          ident: "EQP",
          label: "Equipment & W&B",
          href: `${a}/equipment`,
          badge: ctx.badges.equipment,
          tone: "accent",
          match: [`${a}/equipment`, `${a}/weight-balance`],
          tabs: [
            { label: "Equipment", href: `${a}/equipment` },
            { label: "Weight & balance", href: `${a}/weight-balance` },
          ],
        },
      ],
    },
    {
      label: "Workflows",
      items: [
        {
          ident: "ANL",
          label: "Annual prep",
          href: `${a}/annual`,
          match: [`${a}/annual`, `${a}/audit`],
          tabs: [
            { label: "Annual prep", href: `${a}/annual` },
            { label: "Records gaps", href: `${a}/audit` },
          ],
        },
        { ident: "BUY", label: "Pre-buy dossier", href: `${a}/prebuy` },
      ],
    },
    {
      label: "Manage",
      items: [
        edit
          ? {
              ident: "DAT",
              label: "Import, export & duplicates",
              href: `${a}/export`,
              match: [`${a}/export`, `${a}/import`, `${a}/duplicates`],
              tabs: [
                { label: "Export & backup", href: `${a}/export` },
                { label: "Import a CSV", href: `${a}/import` },
                { label: "Fix duplicates", href: `${a}/duplicates` },
              ],
            }
          : { ident: "EXP", label: "Export & backup", href: `${a}/export` },
        ...(ctx.isOwner ? [{ ident: "SHR", label: "Sharing & transfer", href: `${a}/share` }] : []),
      ],
    },
  ];
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
  if (!annun) return <span role="status" className="text-xs text-dim">Status unavailable</span>;
  if (annun.overdue + annun.due + annun.current + annun.unknown === 0)
    return <span className="text-xs text-dim">Nothing tracked yet</span>;
  const dot = (color: string, n: number, label: string) => (
    <div className="flex items-center gap-1.5">
      <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: color }} />
      <span className="sr-only">{label}: </span><span className="readout text-xs">{n}</span>
    </div>
  );
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-panel px-3 py-1.5">
      {dot("var(--red)", annun.overdue, "overdue items")}
      {dot("var(--amb)", annun.due, "items due soon")}
      {dot("var(--grn)", annun.current, "items within recorded limits")}
      {annun.unknown > 0 && dot("var(--dim)", annun.unknown, "items needing information")}
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
  const shortcuts = allItems.filter((it) => ["OVW", "STS", "TLN", "CAP"].includes(it.ident));
  const moreGroups = nav.map((group) => ({ ...group, items: group.items.filter((it) => !shortcuts.includes(it)) }));
  const moreActive = moreGroups.flatMap((group) => group.items).some(itemActive);

  return (
    // h-dvh (not min-h-screen) so the content pane below scrolls INTERNALLY —
    // that makes it the scroll container sticky children (e.g. the review scan)
    // stick within, and keeps the top bar + nav rail fixed like a real cockpit.
    // print:* — on paper the chrome is noise and, worse, h-screen + the content
    // pane's overflow-auto would clip the report to one screenful. Unwind both
    // so a printed page (the summary, the records export) flows over all pages.
    <div className="flex h-dvh flex-col print:block print:h-auto">
      {/* Top bar — aircraft context always on. */}
      <header className="sticky top-0 z-40 flex h-[60px] shrink-0 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur-md lg:gap-5 print:hidden">
        {/* The version chip links to /whats-new — it's the changelog entry the
            reader is on, so it doubles as the way in. Separate <Link> (an <a>
            can't nest inside the dashboard <a>). */}
        <div className="flex shrink-0 items-center gap-2.5 border-r border-line pr-3 lg:pr-4">
          <Link href="/dashboard" aria-label="MyTailLog hangar" className="flex min-h-11 min-w-11 shrink-0 items-center gap-2.5">
            <span
              className="h-[22px] w-[22px]"
              style={{
                background: "conic-gradient(from 45deg,var(--accent),#8ec8ff)",
                clipPath: "polygon(50% 0,100% 86%,0 86%)",
              }}
            />
            <span className="hidden font-display text-[17px] font-bold tracking-[0.2px] sm:inline">MyTailLog</span>
          </Link>
          <Link
            href="/whats-new"
            title="What's new in this release"
            className="readout hidden rounded-sm border border-line px-1.5 py-0.5 text-[10px] text-faint hover:border-line2 hover:text-dim xl:inline"
          >
            v{APP_VERSION}
          </Link>
        </div>

        <div className="flex min-w-0 items-center gap-3">
          <span className="readout text-base font-semibold tracking-[0.5px]">{context.reg}</span>
          {context.demo && (
            <span className="rounded-sm border border-accent-soft bg-accent-soft px-1.5 py-0.5 text-[9px] text-accent">
              DEMO
            </span>
          )}
          <span className="hidden truncate text-[12.5px] text-dim xl:inline">{context.type}</span>
          <div className="hidden gap-3.5 border-l border-line pl-4 xl:flex">
            <Readout value={context.tach != null ? String(context.tach) : "—"} label="tach hrs" />
            <Readout value={context.hobbs != null ? String(context.hobbs) : "—"} label="hobbs" dim />
            {context.airframe != null && (
              <Readout value={String(context.airframe)} label="airframe" dim />
            )}
          </div>
        </div>

        <div className="hidden 2xl:block">
          <Annunciator annun={context.annun} />
        </div>

        <div className="flex-1" />

        <nav aria-label="Account" className="hidden items-center gap-0.5 text-[13px] lg:flex">
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
        <div className="lg:hidden">
          <NavigationMenu label={<><span className={moreActive ? "font-semibold text-accent" : ""}>More</span>{context.canEdit && context.badges.review > 0 && <><span className="sr-only">{context.badges.review} pages to review</span><span aria-hidden="true"><Badge n={context.badges.review} tone="amber" /></span></>}</>}>
            <nav aria-label="More aircraft navigation" className="space-y-3">
              <Link href="/dashboard" className="flex min-h-11 items-center rounded-md px-3 text-sm text-ink hover:bg-panel2">Your hangar</Link>
              {moreGroups.filter((group) => group.items.length > 0).map((group) => (
                <div key={group.label}>
                  <h2 className="px-3 py-2 text-sm font-semibold text-dim">{group.label}</h2>
                  {group.items.map((it) => (
                    <Link key={it.href} href={it.href} aria-current={itemActive(it) ? "page" : undefined} className={`flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-panel2 ${itemActive(it) ? "bg-panel2 text-ink" : "text-dim"}`}>
                      {it.label}{it.badge != null && it.tone && <Badge n={it.badge} tone={it.tone} />}
                    </Link>
                  ))}
                </div>
              ))}
              <div className="border-t border-line pt-2">
                <Link href="/help" className="flex min-h-11 items-center rounded-md px-3 text-sm text-dim hover:bg-panel2">Help &amp; docs</Link>
                <Link href="/profile" className="flex min-h-11 items-center rounded-md px-3 text-sm text-dim hover:bg-panel2">Profile</Link>
                <Link href="/whats-new" className="flex min-h-11 items-center rounded-md px-3 text-sm text-dim hover:bg-panel2">What&apos;s new</Link>
                <button onClick={signOut} className="min-h-11 w-full rounded-md px-3 text-left text-sm text-dim hover:bg-panel2">Sign out</button>
              </div>
            </nav>
          </NavigationMenu>
        </div>
      </header>

      <nav aria-label="Aircraft shortcuts" className={`grid shrink-0 gap-1 border-b border-line bg-panel px-2 py-2 lg:hidden print:hidden ${context.canEdit ? "grid-cols-4" : "grid-cols-3"}`}>
        {shortcuts.map((it) => {
          const active = itemActive(it);
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 flex-wrap items-center justify-center gap-1 rounded-md border px-1 py-2 text-xs ${
                active ? "border-line2 bg-panel2 text-ink" : "border-line text-dim"
              }`}
            >
              {it.ident === "STS" ? "Status" : it.ident === "TLN" ? "Logbook" : it.ident === "CAP" ? "Capture" : it.label}
              {it.badge != null && it.tone && <span><Badge n={it.badge} tone={it.tone} /></span>}
            </Link>
          );
        })}
      </nav>

      <div className="flex min-h-0 flex-1 print:block">
        {/* Persistent nav rail (desktop). */}
        <nav aria-label="Aircraft navigation" className="hidden w-[236px] shrink-0 flex-col gap-0.5 overflow-auto border-r border-line bg-linear-to-b from-panel to-bg px-3.5 pb-6 pt-4 lg:flex print:hidden">
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
        <div className="min-w-0 flex-1 overflow-auto print:overflow-visible">
          {/* Hub sub-tabs — the consolidated views of Airworthiness / Logbook.
              Rendered by the shell so the underlying pages need no changes, and
              works on every viewport (it's the mobile sub-nav too). */}
          {activeHub?.tabs && (
            <nav aria-label="Section navigation" className="sticky top-0 z-30 grid grid-cols-2 gap-1 border-b border-line bg-bg/85 px-4 py-2 backdrop-blur-md sm:flex lg:px-6 print:hidden">
              {activeHub.tabs.map((t) => {
                const active = ownsPath(t.href);
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    aria-current={active ? "page" : undefined}
                    className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border px-3 py-2 text-sm transition ${
                      active
                        ? "border-line2 bg-panel2 text-ink"
                        : "border-transparent text-dim hover:bg-panel/70 hover:text-ink"
                    }`}
                  >
                    {t.label}
                  </Link>
                );
              })}
            </nav>
          )}
          <div className="animate-up">{children}</div>
        </div>
      </div>
    </div>
  );
}

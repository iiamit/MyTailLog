import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PublicRoot } from "@/components/public/PublicRoot";
import { TabStrip } from "@/components/public/TabStrip";
import { PublicMenu } from "@/components/public/PublicMenu";
import { PUBLIC_GROUPS, groupOf, isCurrentPage, visiblePages, type PublicGroup } from "@/lib/publicNav";

export { PublicRoot };

const tabHref = (g: (typeof PUBLIC_GROUPS)[number]) => g.pages.find((p) => !p.href.includes("#"))!.href;
/** The open group's tab is the current page when it links to the page shown, otherwise the reader's location. */
const tabCurrent = (g: (typeof PUBLIC_GROUPS)[number], group: PublicGroup, path: string) =>
  g.id !== group ? undefined : isCurrentPage(tabHref(g), path) ? "page" : "location";

/**
 * On the cover ground. Signed in: Open MyTailLog. Signed out: Sign in plus Create free account in the rail; the phone
 * header has room for Create free account only, and Sign in moves into the Menu.
 */
function CoverActions({ signedIn, stacked }: { signedIn: boolean; stacked?: boolean }) {
  const quiet = "state-layer inline-flex min-h-11 items-center justify-center rounded-tab bg-cover-2 px-3 text-[15px] font-semibold text-on-cover";
  const filled = "state-layer inline-flex min-h-11 items-center justify-center rounded-tab bg-on-cover px-4 text-[15px] font-bold whitespace-nowrap text-cover max-sm:px-3";
  if (signedIn) return <Link href="/hangar" className={filled}>Open MyTailLog</Link>;
  if (!stacked) return <Link href="/login?mode=create" className={filled}>Create<span className="max-[359px]:hidden">&nbsp;free</span>&nbsp;account</Link>;
  return (
    <div className="grid gap-2">
      <Link href="/login" className={quiet}>Sign in</Link>
      <Link href="/login?mode=create" className={filled}>Create free account</Link>
    </div>
  );
}

/**
 * The public site as the closed binder (the "Binder Cover"): the cover rail holds five section tabs; the open tab runs
 * flush into a board of its hue carrying the page title. `ground="cover"` keeps the hue to the board head band and lays
 * the page's leaves on the cover (Persuade pages); otherwise the leaves sit on the board (Read pages).
 */
export async function PublicTheme({
  group,
  path,
  title,
  lede,
  ground = "board",
  children,
}: {
  group: PublicGroup;
  path: string;
  title: string;
  lede?: React.ReactNode;
  ground?: "board" | "cover";
  children: React.ReactNode;
}) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  const open = groupOf(group);
  const openPages = visiblePages(open, !!user);
  const subTabs = openPages.length > 1 ? openPages : [];

  return (
    <PublicRoot className="lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      {/* Desktop: the cover rail, as in the app. */}
      <aside className="rail sticky top-0 flex h-dvh flex-col gap-1 bg-cover pt-[18px] pb-4 pl-[14px] text-on-cover max-lg:hidden">
        <Link href="/" className="mr-[14px] mb-3 block rounded-tab px-1 py-0.5">
          <span className="block text-[24px] leading-[1.1] font-extrabold tracking-[.02em]">MyTailLog</span>
          <span className="block text-[13px] text-on-cover-2">Aircraft logbooks, indexed</span>
        </Link>
        <nav aria-label="Site sections" className="flex max-h-[600px] min-h-0 flex-1 flex-col gap-1">
          {PUBLIC_GROUPS.map((g) => {
            const isOpen = g.id === group;
            return (
              <Link
                key={g.id}
                href={tabHref(g)}
                data-section={g.section}
                aria-current={tabCurrent(g, group, path)}
                className={`state-layer flex min-h-[58px] flex-1 flex-col justify-start gap-px rounded-l-tab bg-board py-[11px] pl-3 text-on-board ${isOpen ? "mr-0 pr-6" : "mr-3 pr-3"}`}
              >
                <span className="text-tab">{g.label}</span>
                <span className="text-tab-sub">{g.sub}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto pt-3 pr-[14px]"><CoverActions signedIn={!!user} stacked /></div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Phone and tablet: a compact cover header, then the tabs as a strip that runs into the board. */}
        <header className="bg-cover text-on-cover lg:hidden">
          <div className="flex items-center gap-2 px-4 pt-2 max-sm:gap-1">
            <Link href="/" className="mr-auto inline-flex min-h-11 items-center text-[20px] font-extrabold tracking-[.02em] max-sm:text-[18px]">MyTailLog</Link>
            <CoverActions signedIn={!!user} />
            <PublicMenu>
              <nav aria-label="All pages">
                {!user && <Link href="/login" className="state-layer mb-2 flex min-h-11 items-center justify-center rounded-control border border-control-border px-4 font-bold text-ink">Sign in</Link>}
                {PUBLIC_GROUPS.map((g) => (
                  <div key={g.id} className="border-t border-rule py-1 first:border-t-0">
                    <p className="px-2 pt-2 text-label text-ink-3">{g.label}</p>
                    {visiblePages(g, !!user).map((p) => (
                      <Link key={p.href} href={p.href} aria-current={isCurrentPage(p.href, path) ? "page" : undefined} className="state-layer flex min-h-11 items-center rounded-control px-2 text-[15px] font-semibold aria-[current=page]:underline">
                        {p.label}
                      </Link>
                    ))}
                  </div>
                ))}
              </nav>
            </PublicMenu>
          </div>
          <TabStrip>
            {PUBLIC_GROUPS.map((g) => (
              <Link
                key={g.id}
                href={tabHref(g)}
                data-section={g.section}
                aria-current={tabCurrent(g, group, path)}
                className={`state-layer flex min-h-11 shrink-0 items-center rounded-t-tab bg-board px-3 text-[15px] font-bold whitespace-nowrap text-on-board ${g.id === group ? "pb-1" : "mb-1.5"}`}
              >
                {g.label}
              </Link>
            ))}
          </TabStrip>
        </header>

        <div data-section={open.section} className={`board flex-1 text-on-board ${ground === "board" ? "bg-board" : "bg-cover"}`}>
          <header className={`board-head bg-board px-[22px] pt-4 pb-1 max-lg:px-4 ${ground === "cover" ? "pb-5" : ""}`}>
            <div className="flex flex-wrap items-end gap-x-7 gap-y-2">
              <h1 id="board-title" tabIndex={-1} className="mb-2 text-board-title outline-none max-lg:text-[26px]">{title}</h1>
              {/* Phone and tablet leave the sub-tabs to the Menu, which lists every page. */}
              {subTabs.length > 0 && (
                <nav aria-label={`${open.label} pages`} className="-mx-1 flex max-w-full gap-0.5 self-end overflow-x-auto px-1 max-lg:hidden">
                  {subTabs.map((t) => {
                    const cur = isCurrentPage(t.href, path);
                    return (
                      <Link
                        key={t.href}
                        href={t.href}
                        aria-current={cur ? "page" : undefined}
                        className={`state-layer inline-flex min-h-11 shrink-0 items-center rounded-t-tab px-3.5 text-[15px] font-semibold whitespace-nowrap ${cur ? "bg-leaf text-ink" : "text-on-board-2 underline-offset-4 hover:text-on-board hover:underline"}`}
                      >
                        {t.label}
                      </Link>
                    );
                  })}
                </nav>
              )}
            </div>
            {lede && <div className="mb-3 max-w-[54ch] text-[17px] leading-[1.5] text-on-board">{lede}</div>}
          </header>
          <main id="main-content" className="px-[22px] pb-[22px] max-lg:px-2 max-lg:pb-2">
            {children}
          </main>
        </div>
        <PublicFooter signedIn={!!user} />
      </div>
    </PublicRoot>
  );
}

/** One footer for every public page, on the cover. */
export function PublicFooter({ signedIn }: { signedIn: boolean }) {
  return (
    <footer className="bg-cover px-[22px] py-8 text-[14px] text-on-cover-2 max-lg:px-4">
      <nav aria-label="More about MyTailLog" className="grid gap-6 sm:grid-cols-3 lg:grid-cols-6">
        {PUBLIC_GROUPS.map((g) => (
          <div key={g.id}>
            <p className="text-label text-on-cover">{g.label}</p>
            <ul className="mt-1">
              {visiblePages(g, signedIn).map((p) => (
                <li key={p.href}><Link href={p.href} className="inline-flex min-h-11 items-center underline-offset-4 hover:text-on-cover hover:underline">{p.label}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="mt-6 flex flex-wrap gap-x-5 gap-y-1 border-t border-cover-2 pt-5">
        <a href="https://github.com/iiamit/MyTailLog" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-on-cover hover:underline">Source on GitHub (MIT)</a>
        <a href="/whats-new/rss.xml" className="inline-flex min-h-11 items-center underline-offset-4 hover:text-on-cover hover:underline">Release notes feed (RSS)</a>
      </div>
      <p className="mt-3 max-w-[54ch]">
        The paper logbooks are the legal record (14 CFR 91.417). MyTailLog is an index of them. Check anything you rely on against the pages.
      </p>
    </footer>
  );
}

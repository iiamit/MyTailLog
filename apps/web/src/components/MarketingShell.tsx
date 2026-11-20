import Link from "next/link";
import { PublicTheme } from "@/components/PublicTheme";

// Shared frame for the public marketing pages (/faq, /compare, /switch/myfbo).
// Signed-out visitors get no app chrome (AppHeader renders nothing without a
// session), so this carries the page header and the cross-links itself.

const LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Home" },
  { href: "/demo", label: "Product tour" },
  { href: "/faq", label: "FAQ" },
  { href: "/compare", label: "How it compares" },
  { href: "/switch/myfbo", label: "Coming from MyFBO" },
  { href: "/help", label: "Help & docs" },
  { href: "/guides/digitize-aircraft-logbooks", label: "Owner guides" },
  { href: "/ads", label: "ADs by model" },
  { href: "/developers/docs", label: "API" },
  { href: "/whats-new", label: "What's new" },
  { href: "/privacy", label: "Privacy" },
  { href: "/account-deletion", label: "Delete account" },
];

export function MarketingShell({
  eyebrow,
  title,
  lede,
  current,
  children,
}: {
  eyebrow: string;
  title: string;
  lede: React.ReactNode;
  current: string;
  children: React.ReactNode;
}) {
  return (
    <PublicTheme><main id="main-content" className="mx-auto my-7 max-w-4xl rounded-leaf bg-leaf px-6 py-10 text-ink shadow-leaf sm:my-10 sm:px-10">
      <header className="mb-8">
        <div className="text-label text-section-ink-status">{eyebrow}</div>
        <h1 className="mt-2 text-board-title">{title}</h1>
        <p className="mt-3 max-w-2xl text-lede text-ink-2">{lede}</p>
      </header>

      {children}

      <footer className="mt-12 border-t border-line pt-5 text-sm text-faint">
        <nav className="flex flex-wrap gap-x-4 gap-y-1">
          {LINKS.filter((l) => l.href !== current).map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-ink">
              {l.label}
            </Link>
          ))}
          <a href="https://github.com/iiamit/MyTailLog" className="hover:text-ink">
            Source on GitHub (MIT)
          </a>
          <a href="/whats-new/rss.xml" className="hover:text-ink">RSS</a>
        </nav>
        <p className="mt-4">
          MyTailLog is an index and decision-support layer, not the legal maintenance record. The
          physical logbooks remain the system of record (14 CFR 91.417). Confirm anything you rely
          on against them.
        </p>
      </footer>
    </main></PublicTheme>
  );
}

/** Section heading + body, with an anchor target for the page's table of contents. */
export function MarketingSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="mb-2 border-t border-rule pt-4 text-heading">{title}</h2>
      <div className="space-y-2 text-ink-2">{children}</div>
    </section>
  );
}

import Link from "next/link";

// Shared frame for the public marketing pages (/faq, /compare, /switch/myfbo).
// Signed-out visitors get no app chrome (AppHeader renders nothing without a
// session), so this carries the page header and the cross-links itself.

const LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Home" },
  { href: "/faq", label: "FAQ" },
  { href: "/compare", label: "How it compares" },
  { href: "/switch/myfbo", label: "Coming from MyFBO" },
  { href: "/help", label: "Help & docs" },
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
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <div className="eyebrow mb-2">{eyebrow}</div>
        <h1 className="font-display text-[32px] font-semibold leading-tight">{title}</h1>
        <p className="mt-3 text-dim">{lede}</p>
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
        </nav>
        <p className="mt-4">
          MyTailLog is an index and decision-support layer, not the legal maintenance record. The
          physical logbooks remain the system of record (14 CFR 91.417). Confirm anything you rely
          on against them.
        </p>
      </footer>
    </main>
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
      <h2 className="mb-2 text-xl font-semibold">{title}</h2>
      <div className="space-y-2 text-dim">{children}</div>
    </section>
  );
}

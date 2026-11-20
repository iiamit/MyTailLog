import Link from "next/link";
import { StoreBadges } from "@/components/StoreBadges";

/** Public sibling of the binder: same type, colours and leaf surfaces, with normal page scrolling. */
export function PublicTheme({ children, header = true, className = "" }: { children: React.ReactNode; header?: boolean; className?: string }) {
  return <div data-ui="v2" data-theme="light" className={`public-v2 min-h-screen bg-cover text-ink ${className}`}>
    <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:bg-leaf focus:p-3">Skip to content</a>
    {header && <header className="border-b border-rule bg-cover text-on-cover">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-7">
        <Link href="/" className="flex items-center gap-2 text-heading text-on-cover"><span aria-hidden className="inline-block size-5 bg-section-status [clip-path:polygon(50%_0,100%_86%,0_86%)]" />MyTailLog</Link>
        <nav aria-label="Site" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-small">
          <Link href="/faq">FAQ</Link><Link href="/compare">Compare</Link><Link href="/switch/myfbo">From MyFBO</Link><Link href="/help">Help</Link><Link href="/developers/docs">API</Link><Link href="/whats-new">What&apos;s new</Link>
        </nav>
        <Link href="/hangar" className="rounded-control bg-leaf px-4 py-2 text-small font-bold text-ink">Open MyTailLog</Link>
      </div>
    </header>}
    {children}
    {header && <div className="mx-auto flex max-w-6xl justify-center px-5 py-5"><StoreBadges /></div>}
  </div>;
}

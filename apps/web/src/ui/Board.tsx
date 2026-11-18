import Link from "next/link";
import { Route } from "lucide-react";
import type { Section } from "@/lib/uiV2";

/** The open section's coloured field (02 §3.8). Sets the section for every child through data-section. */
export function Board({ section, children }: { section: Section; children: React.ReactNode }) {
  return (
    <main
      data-section={section}
      className="board flex h-dvh min-w-0 flex-col bg-board px-[22px] pb-[22px] text-on-board max-lg:px-3 max-lg:pb-3"
    >
      {children}
    </main>
  );
}

export type SubTab = { label: string; href: string; current?: boolean; count?: number; countLabel?: string };

/** Title, sub-tabs and board actions (02 §3.9–3.10). `spine` lowers the head to 70px when a Spine follows. */
export function BoardHead({
  title,
  subTabs,
  subTabsLabel,
  actions,
  spine = true,
}: {
  title: string;
  subTabs?: SubTab[];
  subTabsLabel?: string;
  actions?: React.ReactNode;
  spine?: boolean;
}) {
  return (
    <header className={`board-head flex flex-wrap items-end gap-x-7 px-1 pt-4 ${spine ? "min-h-[70px]" : "min-h-[78px]"}`}>
      <h1 id="board-title" tabIndex={-1} className="mb-3.5 text-board-title max-lg:text-[24px]">
        {title}
      </h1>
      {subTabs && subTabs.length > 0 && (
        <nav aria-label={subTabsLabel ?? `${title} pages`} className="flex gap-0.5 self-end">
          {subTabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              aria-current={t.current ? "page" : undefined}
              aria-label={t.count ? `${t.label}, ${t.countLabel ?? t.count}` : undefined}
              className={`state-layer rounded-t-tab px-3.5 pt-[9px] pb-[11px] text-[15px] font-semibold ${
                t.current ? "bg-leaf text-ink" : "text-on-board-2 hover:text-on-board"
              }`}
            >
              {t.label}
              {t.count ? ` ${t.count}` : ""}
            </Link>
          ))}
        </nav>
      )}
      {actions && <div className="mb-3 ml-auto flex items-center gap-2 text-[14px] text-on-board-2">{actions}</div>}
    </header>
  );
}

/**
 * The spine (02 §4.2) in its loading/empty form: the four logbook lines without marks. The drawn life,
 * marks and window arrive with the MapModel in phase 2 (10-line-map.md).
 */
export function Spine({ tail, context, href }: { tail: string; context: string; href: string }) {
  const lines = [8, 16, 24, 32];
  return (
    <div className="spine mb-2.5 grid grid-cols-[auto_1fr_auto] items-center gap-3.5 rounded-leaf bg-leaf px-3.5 pt-1.5 pb-1 text-ink shadow-leaf">
      <div className="text-[13px] leading-[1.2]">
        <div className="font-bold text-ink-2">{tail}</div>
        <div className="font-medium text-ink-3">{context}</div>
      </div>
      <svg aria-hidden viewBox="0 0 100 40" preserveAspectRatio="none" className="h-10 w-full">
        {lines.map((y) => (
          <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="var(--color-rule)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <Link href={href} className="flex items-center gap-1.5 text-[13px] leading-[1.2] font-semibold text-board-ink">
        <Route aria-hidden size={16} /> Open the map
      </Link>
    </div>
  );
}

/** The two-sheet spread (02 §3.11). Below 900px it collapses to one column; the source moves to a drawer. */
export function Leaves({ split = "1.62fr 1fr", children }: { split?: string; children: React.ReactNode }) {
  return (
    <div
      style={{ "--split": split } as React.CSSProperties}
      className="grid min-h-0 flex-1 gap-2.5 [grid-template-columns:var(--split)] max-[1179px]:[grid-template-columns:1fr_1fr] max-[899px]:[grid-template-columns:1fr]"
    >
      {children}
    </div>
  );
}

export function Leaf({
  label,
  flush,
  className = "",
  children,
}: {
  label?: string;
  flush?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className={`relative min-w-0 overflow-auto rounded-leaf bg-leaf text-ink shadow-leaf ${flush ? "" : "px-7 pt-[22px] pb-5"} ${className}`}
    >
      {children}
    </section>
  );
}

/** The dark mat that holds a scanned page (02 §3.13). */
export function SourceMat({ title, meta, children }: { title?: string; meta?: string; children?: React.ReactNode }) {
  return (
    <section
      aria-label="Source page"
      className="flex min-w-0 flex-col gap-3 overflow-auto rounded-leaf bg-mat p-[18px] text-on-cover shadow-leaf max-[899px]:hidden"
    >
      {title ? (
        <div className="text-[13px] leading-[1.45] text-on-cover-2">
          <h2 className="text-[15px] font-normal text-on-cover">{title}</h2>
          {meta}
        </div>
      ) : null}
      {children ?? <p className="m-auto text-[15px] text-on-cover-2">Select a row to see its page.</p>}
    </section>
  );
}

/** A heading hung in the leaf's margin column (02 §3.14). */
export function HungSection({
  title,
  count,
  first,
  children,
}: {
  title: string;
  count?: string;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`grid grid-cols-[var(--hung,118px)_1fr] gap-x-[22px] py-[18px] max-[560px]:block ${
        first ? "border-t-2 border-ink" : "border-t border-rule"
      }`}
    >
      <div>
        <h3 className="text-section">{title}</h3>
        {count && <p className="text-small text-ink-3">{count}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

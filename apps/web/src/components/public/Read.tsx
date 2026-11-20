// The Read template's parts: one leaf on the board, a compact contents list, headings hung in the margin, slips, tags
// and code wells. Prose inside a ReadSection takes its type from `.read-prose` in globals.css.

export type TocItem = { id: string; title: string };

/** The single leaf a Read page sits on, with an optional in-leaf table of contents (keep it to about 8 groups). */
export function ReadLeaf({ toc, intro, children, className = "" }: { toc?: TocItem[]; intro?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <article className={`mx-auto max-w-[1040px] rounded-leaf bg-leaf px-[30px] pt-[26px] pb-7 text-ink shadow-leaf max-sm:px-4 max-sm:pt-5 ${className}`}>
      {intro && <div className="read-prose mb-5 max-w-[54ch] text-[18px] leading-[1.55]">{intro}</div>}
      {toc && toc.length > 0 && (
        <nav aria-label="On this page" className="mb-6 rounded-leaf bg-leaf-2 px-5 py-4">
          <h2 className="text-label text-ink-3">On this page</h2>
          <ol className="mt-1 grid gap-x-6 sm:grid-cols-2">
            {toc.map((t) => (
              <li key={t.id}>
                <a href={`#${t.id}`} className="inline-flex min-h-10 items-center text-[15px] font-semibold text-board-ink underline-offset-4 hover:underline">{t.title}</a>
              </li>
            ))}
          </ol>
        </nav>
      )}
      {children}
    </article>
  );
}

/** A heading hung in the leaf's margin column (HungSection, 16/700), body at a 54ch measure. */
export function ReadSection({ id, title, first, children }: { id?: string; title: string; first?: boolean; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-h` : undefined} className={`grid scroll-mt-4 grid-cols-[148px_minmax(0,1fr)] gap-x-[22px] py-[18px] max-md:block ${first ? "border-t-2 border-ink" : "border-t border-rule"}`}>
      <h2 id={id ? `${id}-h` : undefined} className="text-section max-md:mb-2">{title}</h2>
      <div className="read-prose min-w-0">{children}</div>
    </section>
  );
}

/** A slip for a note that matters: leaf-2 with a 2px ink rule, never a colour. */
export function Callout({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="callout my-3 max-w-[54ch] border-t-2 border-ink bg-leaf-2 px-4 py-3 text-[15px] leading-[1.55]">
      {title && <p className="mb-1 font-bold">{title}</p>}
      <div className="[&>p+p]:mt-2">{children}</div>
    </div>
  );
}

/** Small square-cornered label. Ink on leaf-2; `alarm` only for security notes. */
export function Tag({ children, tone = "ink" }: { children: React.ReactNode; tone?: "ink" | "alarm" }) {
  return (
    <span className={`inline-flex items-center rounded-[var(--radius-s)] px-1.5 py-0.5 text-label whitespace-nowrap ${tone === "alarm" ? "bg-alarm-bg text-on-alarm-bg" : "bg-leaf-2 text-ink shadow-[inset_0_0_0_1px_var(--color-rule-2)]"}`}>
      {children}
    </span>
  );
}

/** Code in a leaf-2 well. Monospace is allowed here and nowhere else (DESIGN.md, Typography). */
export function CodeWell({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <pre aria-label={label} tabIndex={0} className="my-3 max-w-full overflow-x-auto rounded-leaf bg-leaf-2 px-4 py-3 font-mono text-[14px] leading-[1.55] text-ink shadow-[inset_0_0_0_1px_var(--color-rule)]">
      {children}
    </pre>
  );
}

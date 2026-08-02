import { AccountShell } from "@/components/shell/AccountShell";
import { APP_VERSION } from "@/lib/version";
import {
  parseChangelog,
  parseInline,
  type ChangeTag,
  type InlineToken,
} from "@/lib/changelog";

export const metadata = {
  title: "What's new — MyTailLog",
  description:
    "Every notable change to MyTailLog, newest first — new features, improvements, fixes, and security work, grouped by release.",
};

// Tag → annunciator colour, reusing the design system's existing status ramp.
const TAG_STYLE: Record<ChangeTag, string> = {
  New: "border-annun-green/40 text-annun-green",
  Improved: "border-accent/40 bg-accent-soft text-accent",
  Fixed: "border-annun-amber/40 text-annun-amber",
  Security: "border-annun-red/40 text-annun-red",
};

function Inline({ tokens }: { tokens: InlineToken[] }) {
  return (
    <>
      {tokens.map((t, i) => {
        if (t.kind === "bold") return <strong key={i} className="font-semibold text-ink">{t.text}</strong>;
        if (t.kind === "code")
          return (
            <code key={i} className="readout rounded-sm border border-line px-1 py-0.5 text-[11.5px] text-dim">
              {t.text}
            </code>
          );
        if (t.kind === "link")
          return (
            <a
              key={i}
              href={t.href}
              className="underline decoration-line underline-offset-2 hover:decoration-line2 hover:text-ink"
            >
              {t.text}
            </a>
          );
        return <span key={i}>{t.text}</span>;
      })}
    </>
  );
}

export default function WhatsNewPage() {
  // Inlined at build time by next.config.mjs — see src/lib/changelog.ts.
  const releases = parseChangelog(process.env.CHANGELOG_MD ?? "");

  return (
    <AccountShell>
      <main className="mx-auto max-w-3xl px-6 py-8">
        <header className="mb-8">
          <div className="eyebrow mb-2">Account</div>
          <h1 className="font-display text-[27px] font-semibold leading-none">What&apos;s new</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-dim">
            Every notable change, newest first. Releases are calendar-versioned — the
            number in the header of every page tells you which one you&apos;re on. You&apos;re
            running{" "}
            <span className="readout rounded-sm border border-line px-1.5 py-0.5 text-[11.5px] text-faint">
              v{APP_VERSION}
            </span>
            .
          </p>
        </header>

        {releases.length === 0 ? (
          <p className="text-sm text-faint">No releases recorded yet.</p>
        ) : (
          <div className="flex flex-col gap-10">
            {releases.map((r) => (
              <section key={r.version} id={r.version} className="scroll-mt-20">
                <div className="mb-4 flex flex-wrap items-baseline gap-3 border-b border-line pb-2">
                  <h2 className="readout text-[19px] font-semibold text-ink">{r.version}</h2>
                  {r.dateLabel && <span className="text-[12.5px] text-faint">{r.dateLabel}</span>}
                  {r.version === APP_VERSION && (
                    <span className="rounded-full border border-accent/40 bg-accent-soft px-2 py-0.5 text-[11px] text-accent">
                      you&apos;re here
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-6">
                  {r.groups.map((g, gi) => (
                    <div key={gi}>
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] ${TAG_STYLE[g.tag]}`}
                          style={g.tag === "Fixed" ? { background: "var(--amb-bg)" } : undefined}
                        >
                          {g.tag}
                        </span>
                        <h3 className="text-[15px] font-semibold text-ink">{g.topic}</h3>
                      </div>
                      <ul className="flex flex-col gap-2 text-[13.5px] leading-relaxed text-dim">
                        {g.items.map((item, ii) => (
                          <li key={ii} className="flex gap-2.5">
                            <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-faint" />
                            <span>
                              <Inline tokens={parseInline(item)} />
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <p className="mt-10 border-t border-line pt-4 text-[12.5px] text-faint">
          MyTailLog is MIT-licensed and open source — the full engineering history is in{" "}
          <a
            href="https://github.com/iiamit/MyTailLog"
            className="underline decoration-line underline-offset-2 hover:text-ink"
          >
            the git log
          </a>
          .
        </p>
      </main>
    </AccountShell>
  );
}

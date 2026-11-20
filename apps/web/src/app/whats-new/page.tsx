import { InformationShell } from "@/components/InformationShell";
import { Tag } from "@/components/public/Read";
import { APP_VERSION } from "@/lib/version";
import { parseChangelog, parseInline, type InlineToken } from "@/lib/changelog";

export const metadata = {
  title: "What's new",
  description:
    "Every notable change to MyTailLog, newest first: new features, improvements, fixes and security work, grouped by release.",
};

function Inline({ tokens }: { tokens: InlineToken[] }) {
  return (
    <>
      {tokens.map((t, i) => {
        if (t.kind === "bold") return <strong key={i}>{t.text}</strong>;
        if (t.kind === "code") return <code key={i}>{t.text}</code>;
        if (t.kind === "link") return <a key={i} href={t.href}>{t.text}</a>;
        return <span key={i}>{t.text}</span>;
      })}
    </>
  );
}

export default function WhatsNewPage() {
  // Inlined at build time by next.config.mjs (see src/lib/changelog.ts).
  const releases = parseChangelog(process.env.CHANGELOG_MD ?? "");

  return (
    <InformationShell
      group="about"
      path="/whats-new"
      title="What's new"
      lede={
        <p>
          Every notable change, newest first. Releases are numbered by year and month; you&apos;re on release {APP_VERSION}.
          Follow along in a feed reader with the <a href="/whats-new/rss.xml">RSS feed</a>, or read the full history in{" "}
          <a href="https://github.com/iiamit/MyTailLog">the source repository</a>.
        </p>
      }
      toc={releases.slice(0, 8).map((r) => ({ id: r.version, title: r.dateLabel ? `${r.dateLabel} (${r.version})` : r.version }))}
    >
      {releases.length === 0 ? (
        <p>No releases recorded yet.</p>
      ) : (
        releases.map((r, ri) => (
          <section
            key={r.version}
            id={r.version}
            aria-labelledby={`r-${r.version}`}
            className={`grid scroll-mt-4 grid-cols-[148px_minmax(0,1fr)] gap-x-[22px] max-md:block ${ri === 0 ? "border-t-2 border-ink" : ""}`}
          >
            <div className="pt-[18px] max-md:pb-2">
              <h2 id={`r-${r.version}`} className="text-section">{r.dateLabel ?? r.version}</h2>
              <p className="text-small text-ink-3">Release {r.version}</p>
              {r.version === APP_VERSION && <p className="mt-1"><Tag>You&apos;re on this one</Tag></p>}
            </div>
            {/* The dated stop on a small ink line: one stop per release, the line running down to the next. */}
            <div className="read-prose relative min-w-0 py-[18px] pl-8">
              <span aria-hidden className={`absolute top-0 left-[6px] w-[3px] bg-ink ${ri === releases.length - 1 ? "h-7" : "bottom-0"}`} />
              <span aria-hidden className="absolute top-[22px] left-0 size-[15px] rounded-full border-[3px] border-ink bg-leaf" />
              {r.groups.map((g, gi) => (
                <div key={gi} className={gi ? "mt-6" : ""}>
                  <h3 className="!m-0 flex flex-wrap items-center gap-2">
                    <Tag tone={g.tag === "Security" ? "alarm" : "ink"}>{g.tag}</Tag>
                    <span>{g.topic.charAt(0).toUpperCase() + g.topic.slice(1)}</span>
                  </h3>
                  <ul className="mt-2">
                    {g.items.map((item, ii) => (
                      <li key={ii}><Inline tokens={parseInline(item)} /></li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </InformationShell>
  );
}

import { parseChangelog } from "@/lib/changelog";

const xml = (value: string) => value.replace(/[<>&"']/g, (c) => ({
  "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;",
})[c]!);

export function GET() {
  const releases = parseChangelog(process.env.CHANGELOG_MD ?? "");
  const items = releases.map((release) => {
    const link = `https://mytaillog.com/whats-new#${encodeURIComponent(release.version)}`;
    const description = release.groups
      .flatMap((group) => group.items.map((item) => `${group.tag} — ${group.topic}: ${item}`))
      .join("\n");
    return `<item><title>MyTailLog ${xml(release.version)}</title><link>${link}</link><guid>${link}</guid><description>${xml(description)}</description></item>`;
  }).join("");

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>MyTailLog — What&apos;s new</title><link>https://mytaillog.com/whats-new</link><description>New features, improvements, fixes, and security updates from MyTailLog.</description>${items}</channel></rss>`,
    { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } },
  );
}

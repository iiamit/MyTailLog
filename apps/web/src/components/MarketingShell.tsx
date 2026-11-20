import { PublicTheme } from "@/components/PublicTheme";
import { ReadLeaf, ReadSection, type TocItem } from "@/components/public/Read";
import type { PublicGroup } from "@/lib/publicNav";

/** The Read template for public pages: the group's board head with the title, then one leaf. */
export function MarketingShell({
  group,
  title,
  lede,
  current,
  toc,
  children,
}: {
  group: PublicGroup;
  title: string;
  lede?: React.ReactNode;
  current: string;
  toc?: TocItem[];
  children: React.ReactNode;
}) {
  return (
    <PublicTheme group={group} path={current} title={title}>
      <ReadLeaf intro={lede} toc={toc}>{children}</ReadLeaf>
    </PublicTheme>
  );
}

/** Section heading + body, with an anchor target for the page's table of contents. */
export function MarketingSection({ id, title, first, children }: { id: string; title: string; first?: boolean; children: React.ReactNode }) {
  return <ReadSection id={id} title={title} first={first}>{children}</ReadSection>;
}

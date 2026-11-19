import { BoardHead, Spine } from "@/ui/Board";
import type { BooksContext } from "@/lib/v2/booksLoad";

export type BooksTab = "map" | "pages" | "review" | null;

/** Logbooks board head (03 §4: Map · Pages · Review {n}) and the spine with this screen's window. */
export function BooksHead({
  id,
  books,
  current,
  actions,
  spine,
}: {
  id: string;
  books: BooksContext;
  current: BooksTab;
  actions?: React.ReactNode;
  spine: { context: string; window?: { from: string; to: string } | null; linkLabel?: string; href?: string; windowDescription?: string };
}) {
  const a = `/aircraft/${id}`;
  const waiting = books.due?.snap.counts.pagesToReview ?? 0;
  const tabs = [
    { label: "Map", href: `${a}/logbooks/map`, current: current === "map" },
    // shortcut: Pages (W-BOOKS-05) is still today's library until its v2 screen lands.
    { label: "Pages", href: `${a}/pages`, current: current === "pages" },
    ...(books.context.canEdit
      ? [{ label: "Review", href: `${a}/logbooks/review`, current: current === "review", count: waiting || undefined, countLabel: `${waiting} waiting` }]
      : []),
  ];
  return (
    <>
      <BoardHead title="Logbooks" subTabs={tabs} actions={actions} />
      <Spine
        tail={books.context.reg}
        context={spine.context}
        href={spine.href ?? `${a}/logbooks/map`}
        model={books.model}
        window={spine.window}
        linkLabel={spine.linkLabel ?? (current === "map" && !spine.window ? "Whole life" : "Open the map")}
        statusHref={`${a}/status`}
        windowDescription={spine.windowDescription}
      />
    </>
  );
}

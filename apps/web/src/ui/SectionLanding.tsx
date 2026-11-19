import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Board, BoardHead, HungSection, Leaf, Leaves, SourceMat, Spine, type SubTab } from "@/ui/Board";
import type { Section } from "@/lib/uiV2";

export type InterimLink = { label: string; detail: string; path: string };

/**
 * A section whose screens are still being rebuilt: the binder shell, plus the section's pages in the
 * current design (opened with ?ui=v1 so the owner stays in the new design everywhere else).
 * shortcut: interim by design (13 §6 opt-in transition); each phase replaces one of these with its real screens.
 */
export function SectionLanding({
  aircraftId,
  tail,
  section,
  title,
  subTabs,
  intro,
  links,
}: {
  aircraftId: string;
  tail: string;
  section: Section;
  title: string;
  subTabs?: SubTab[];
  intro: string;
  links: InterimLink[];
}) {
  const a = `/aircraft/${aircraftId}`;
  return (
    <Board section={section}>
      <BoardHead title={title} subTabs={subTabs} />
      <Spine tail={tail} context="The whole life" href={`${a}/logbooks`} />
      <Leaves>
        <Leaf label={title}>
          <p className="mb-5 max-w-[34ch] text-lede">{intro}</p>
          <HungSection title="In the current design" count={`${links.length} ${links.length === 1 ? "page" : "pages"}`} first>
            <ul className="divide-y divide-rule">
              {links.map((l) => (
                <li key={l.path}>
                  <Link
                    href={`${a}/${l.path}${l.path.includes("?") ? "&" : "?"}ui=v1`}
                    className="state-layer -mx-2 flex min-h-12 items-center gap-3 rounded-control px-2 py-2.5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-body-strong">{l.label}</span>
                      <span className="block text-small text-ink-3">{l.detail}</span>
                    </span>
                    <ArrowRight aria-hidden size={20} className="text-board-ink" />
                  </Link>
                </li>
              ))}
            </ul>
          </HungSection>
        </Leaf>
        <SourceMat />
      </Leaves>
    </Board>
  );
}

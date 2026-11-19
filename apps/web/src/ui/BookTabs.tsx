"use client";

import { useRef, useState } from "react";
import { ScanViewer, type Box } from "@/ui/ScanViewer";
import { LINE_TOKEN } from "@/lib/v2/status";

export type BookPage = { key: string; book: string; label: string; pageId: string | null; alt: string; lit: Box | null };

/** One tab per book a visit signed, on the mat (02 §4.10): WAI-ARIA tabs, the ScanViewer is the panel. */
export function BookTabs({ pages, initial = 0 }: { pages: BookPage[]; initial?: number }) {
  const [i, setI] = useState(Math.min(initial, pages.length - 1));
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (j: number) => {
    const n = (j + pages.length) % pages.length;
    setI(n);
    refs.current[n]?.focus();
  };
  const p = pages[i];
  return (
    <>
      <div role="tablist" aria-label="Pages of this visit" className="flex flex-wrap gap-1">
        {pages.map((t, j) => (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[j] = el;
            }}
            type="button"
            role="tab"
            id={`booktab-${t.key}`}
            aria-selected={j === i}
            aria-controls="booktab-panel"
            tabIndex={j === i ? 0 : -1}
            onClick={() => setI(j)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              move(e.key === "ArrowRight" ? j + 1 : j - 1);
            }}
            className={`state-layer inline-flex h-[34px] items-center gap-[7px] rounded-[var(--radius-m)] border px-3 text-[14px] font-semibold ${
              j === i ? "border-leaf bg-leaf text-ink" : "border-[#5a5e68] text-on-cover"
            }`}
          >
            <span aria-hidden className="inline-block h-1 w-3.5 rounded-[2px]" style={{ background: LINE_TOKEN[t.book] }} />
            {t.label}
          </button>
        ))}
      </div>
      <div id="booktab-panel" role="tabpanel" aria-labelledby={`booktab-${p.key}`} className="flex min-h-0 flex-1 flex-col">
        {p.pageId ? (
          <ScanViewer key={p.pageId} src={`/api/page/${p.pageId}/image`} alt={p.alt} lit={p.lit} />
        ) : (
          <p className="m-auto text-[15px] text-on-cover-2">No page is linked to this entry yet.</p>
        )}
      </div>
    </>
  );
}

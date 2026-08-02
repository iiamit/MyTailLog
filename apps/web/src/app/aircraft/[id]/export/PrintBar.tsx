"use client";

import Link from "next/link";
import { BackupButton } from "@/components/BackupButton";

// PDF + CSV + full backup controls, as the three export-option cards. Both PDFs
// come from the browser's own "Save as PDF" over a print-styled page (no PDF
// library) — the one-page summary at ../summary, and the full entry-by-entry
// report rendered below this bar. Hidden when actually printing, so only the
// report itself appears on paper.
export function PrintBar({ aircraftId }: { aircraftId: string }) {
  const csv = (type: string) => `/api/aircraft/${aircraftId}/export?type=${type}`;
  return (
    <div className="mb-6 grid grid-cols-1 gap-3.5 sm:grid-cols-3 print:hidden">
      <div className="panel flex flex-col p-5">
        <div className="mb-3 text-[22px]">🖨</div>
        <div className="mb-1.5 text-[15px] font-semibold text-ink">PDF reports</div>
        <div className="mb-4 text-[12.5px] leading-relaxed text-dim">
          <b className="text-dim">Maintenance summary</b> — one page: status, open
          squawks, ADs, what&apos;s due, installed equipment and current W&amp;B. The
          document you hand a buyer, an insurer, or your IA at annual.
        </div>
        <Link
          href={`/aircraft/${aircraftId}/summary`}
          className="mt-auto block rounded-md border border-line2 bg-panel2 py-2.5 text-center text-[13px] text-ink hover:border-accent"
        >
          Maintenance summary →
        </Link>
        <button
          onClick={() => window.print()}
          className="mt-2 w-full rounded-md border border-line py-2.5 text-[12.5px] text-dim hover:border-line2 hover:text-ink"
        >
          Full records report (every entry)
        </button>
      </div>

      <div className="panel p-5">
        <div className="mb-3 text-[22px]">▤</div>
        <div className="mb-1.5 text-[15px] font-semibold text-ink">CSV export</div>
        <div className="mb-4 text-[12.5px] leading-relaxed text-dim">
          Every extracted entry as a spreadsheet — slice it however you like.
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            ["entries", "Entries"],
            ["ad", "AD/SB"],
            ["equipment", "Equipment"],
            ["maintenance", "Maintenance"],
          ].map(([type, label]) => (
            <a
              key={type}
              href={csv(type)}
              className="rounded-md border border-line2 bg-panel2 px-3 py-2 text-[12.5px] text-ink hover:border-accent"
            >
              {label}
            </a>
          ))}
        </div>
      </div>

      <div
        className="rounded-xl border border-accent p-5"
        style={{ background: "linear-gradient(180deg, var(--accent-soft), var(--panel))" }}
      >
        <div className="mb-3 text-[22px]">🗄</div>
        <div className="mb-1.5 text-[15px] font-semibold text-ink">Full backup (.zip)</div>
        <div className="mb-4 text-[12.5px] leading-relaxed text-dim">
          Scans, extractions and metadata in one re-importable archive, with a
          <code className="readout px-1 text-[11.5px]">README.txt</code> documenting
          every file and column. Recommended monthly.
        </div>
        <BackupButton aircraftId={aircraftId} />
      </div>
    </div>
  );
}

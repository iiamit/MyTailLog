"use client";

import { BackupButton } from "@/components/BackupButton";

// Print/PDF + CSV + full backup controls, as the three export-option cards.
// Print → the browser's "Save as PDF" produces the bundle (no PDF library
// needed) over the printable report rendered below this bar. Hidden when
// actually printing — only the report itself should appear on paper.
export function PrintBar({ aircraftId }: { aircraftId: string }) {
  const csv = (type: string) => `/api/aircraft/${aircraftId}/export?type=${type}`;
  return (
    <div className="mb-6 grid grid-cols-1 gap-3.5 sm:grid-cols-3 print:hidden">
      <div className="panel p-5">
        <div className="mb-3 text-[22px]">🖨</div>
        <div className="mb-1.5 text-[15px] font-semibold text-ink">Print / PDF report</div>
        <div className="mb-4 text-[12.5px] leading-relaxed text-dim">
          A clean status &amp; timeline summary for your A&amp;P, insurer, or a
          prospective buyer.
        </div>
        <button
          onClick={() => window.print()}
          className="w-full rounded-md border border-line2 bg-panel2 py-2.5 text-[13px] text-ink hover:border-accent"
        >
          Generate PDF
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
          Scans, extractions and metadata in one re-importable archive.
          Recommended monthly.
        </div>
        <BackupButton aircraftId={aircraftId} />
      </div>
    </div>
  );
}

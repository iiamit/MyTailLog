"use client";

// Print/PDF + CSV controls. Print → the browser's "Save as PDF" produces the
// bundle (no PDF library needed). Hidden when actually printing.
export function PrintBar({ aircraftId }: { aircraftId: string }) {
  const csv = (type: string) => `/api/aircraft/${aircraftId}/export?type=${type}`;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 print:hidden">
      <button
        onClick={() => window.print()}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
      >
        Print / Save as PDF
      </button>
      <span className="text-xs text-slate-500 dark:text-slate-400">CSV:</span>
      {[
        ["entries", "Entries"],
        ["ad", "AD/SB"],
        ["equipment", "Equipment"],
        ["maintenance", "Maintenance"],
      ].map(([type, label]) => (
        <a
          key={type}
          href={csv(type)}
          className="rounded-md border border-slate-300 px-3 py-2 text-xs hover:border-slate-500 dark:border-slate-700"
        >
          {label}
        </a>
      ))}
    </div>
  );
}

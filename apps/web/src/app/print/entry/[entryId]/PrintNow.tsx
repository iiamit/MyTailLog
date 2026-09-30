"use client";

export function PrintNow() {
  return <div className="no-print mb-5 text-sm">
    <button type="button" onClick={() => window.print()} className="rounded bg-accent px-4 py-2 font-medium text-bg">Print or save PDF</button>
    <p className="mt-2 text-dim">Print at 100% scale on full-sheet adhesive paper, then trim. This private print link expires in 10 minutes.</p>
  </div>;
}

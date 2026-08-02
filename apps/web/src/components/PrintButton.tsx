"use client";

// Browser print → "Save as PDF" is the whole PDF pipeline; globals.css swaps the
// dark tokens for a light ramp under @media print. No PDF library needed.
export function PrintButton({
  label = "Print / Save as PDF",
  className = "rounded-md border border-line2 bg-panel2 px-4 py-2.5 text-[13px] text-ink hover:border-accent",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <button onClick={() => window.print()} className={className}>
      {label}
    </button>
  );
}

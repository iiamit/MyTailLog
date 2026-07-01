/**
 * The design principle, stated in the app itself (not just the ToS). This is a
 * liability/scope guardrail per the plan: MyTailLog is an index of the physical
 * logbooks, which remain the legal record per 14 CFR 91.417. Render this
 * prominently on the aircraft dashboard — do not bury it.
 */
export function Disclaimer({ variant = "banner" }: { variant?: "banner" | "inline" }) {
  if (variant === "inline") {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Index only — not the legal maintenance record (14 CFR 91.417). Confirm
        against the physical logbook before relying on any value.
      </p>
    );
  }

  return (
    <div
      role="note"
      className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
    >
      <strong className="font-semibold">This is an index, not the record.</strong>{" "}
      The physical logbooks remain the system of record per 14 CFR 91.417.
      MyTailLog does not replace official maintenance records, is not an
      airworthiness determination, and is not a maintenance sign-off. Every
      value shown is derived from OCR/extraction — confirm it against the paper
      logbook before you rely on it.
    </div>
  );
}

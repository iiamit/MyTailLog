"use client";

import { useState } from "react";

/**
 * A destructive action button that asks for confirmation inline (no native
 * window.confirm): first click arms it, swapping to Confirm / Cancel.
 */
export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = "Confirm",
  className = "",
  disabled = false,
}: {
  onConfirm: () => void;
  children: React.ReactNode;
  confirmLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);

  if (armed) {
    return (
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            setArmed(false);
            onConfirm();
          }}
          className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={() => setArmed(false)}
          className="rounded-md border border-slate-300 px-3 py-1 text-xs hover:border-slate-500 dark:border-slate-700"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setArmed(true)}
      disabled={disabled}
      className={className}
    >
      {children}
    </button>
  );
}

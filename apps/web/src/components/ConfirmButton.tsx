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
          className="rounded-md bg-annun-red px-3 py-1 text-xs font-medium text-bg hover:opacity-90"
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={() => setArmed(false)}
          className="rounded-md border border-line px-3 py-1 text-xs hover:border-line2"
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

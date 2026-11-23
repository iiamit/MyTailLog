"use client";

import { useRef } from "react";
import { buttonClass } from "@/ui/Button";

/**
 * ConfirmDialog (02 §7.8) around a submit button: the form submits only after the owner confirms in a modal
 * <dialog>. Put it inside the <form> whose action it confirms.
 */
export function ConfirmSubmit({
  label,
  question,
  confirmLabel,
  variant = "quiet",
  size = "s",
  danger = true,
}: {
  label: string;
  question: string;
  confirmLabel?: string;
  variant?: "quiet" | "secondary" | "alarm" | "primary";
  size?: "s" | "m";
  danger?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={buttonClass(variant, size)} onClick={() => ref.current?.showModal()}>
        {label}
      </button>
      <dialog
        ref={ref}
        aria-label={label}
        className="m-auto max-w-[440px] rounded-leaf bg-leaf p-6 text-ink shadow-leaf backdrop:bg-mat/60"
      >
        <p className="text-body">{question}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={buttonClass("quiet", "m")} onClick={() => ref.current?.close()} autoFocus>
            Cancel
          </button>
          <button type="submit" className={buttonClass(danger ? "alarm" : "primary", "m")} onClick={() => ref.current?.close()}>
            {confirmLabel ?? label}
          </button>
        </div>
      </dialog>
    </>
  );
}

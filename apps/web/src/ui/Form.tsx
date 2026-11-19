"use client";

import { useRef } from "react";
import Link from "next/link";
import { buttonClass } from "@/ui/Button";

/** TextInput / Select / DateInput look (02 §7.3). Textareas add `h-auto py-2`. */
export const fieldClass = "mt-1 block h-[42px] w-full rounded-control border border-control-border bg-leaf px-3 text-body text-ink";

/** A labelled field with optional helper and error (02 §7.3). Children are the control. */
export function Field({ label, help, error, children }: { label: string; help?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block text-label">
      {label}
      {children}
      {help && <span className="mt-1 block text-small font-normal text-ink-3">{help}</span>}
      {error && <span role="alert" className="mt-1 block text-small font-semibold text-alarm-text">{error}</span>}
    </label>
  );
}

/** The right leaf a form takes over while open (white Leaf with a heading and Cancel back to `closeHref`). */
export function FormLeaf({ title, closeHref, children }: { title: string; closeHref?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby="form-leaf-title" className="flex min-w-0 flex-col overflow-auto rounded-leaf bg-leaf px-7 pt-[22px] pb-5 text-ink shadow-leaf">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="form-leaf-title" className="text-heading">{title}</h2>
        {closeHref && (
          <Link href={closeHref} replace scroll={false} className={buttonClass("quiet", "s")}>
            Close
          </Link>
        )}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Inline result line after an action (the board's toast stand-in; announced politely). */
export function Notice({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "alarm" }) {
  return (
    <p
      role={tone === "alarm" ? "alert" : "status"}
      className={`rounded-[var(--radius-s)] px-4 py-3 text-body ${tone === "alarm" ? "bg-leaf-2 font-semibold text-alarm-text" : "bg-leaf-2"}`}
    >
      {children}
    </p>
  );
}

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

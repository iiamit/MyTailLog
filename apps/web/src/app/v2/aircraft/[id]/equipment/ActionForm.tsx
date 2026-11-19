"use client";

import { useActionState } from "react";
import { buttonClass } from "@/ui/Button";

export type ActionState = { error?: string } | null;

/**
 * A form posting to a server action that redirects on success and returns `{ error }` otherwise; the error shows
 * above the buttons. Shared by Equipment, W&B and Details (W-AIRCRAFT-03..05).
 * shortcut: lives here rather than src/ui while three screens use it; move it there when a fourth does.
 */
export function ActionForm({
  action,
  submit,
  variant = "primary",
  extra,
  className = "flex flex-col gap-4",
  children,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  submit?: string;
  variant?: "primary" | "secondary" | "alarm";
  extra?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form action={run} className={className}>
      {children}
      {state?.error && (
        <p role="alert" className="text-small font-semibold text-alarm-text">
          {state.error}
        </p>
      )}
      {(submit || extra) && (
        <div className="flex flex-wrap items-center gap-2">
          {submit && (
            <button type="submit" disabled={pending} className={buttonClass(variant, "m")}>
              {submit}
            </button>
          )}
          {extra}
        </div>
      )}
    </form>
  );
}

/** Ticks or clears every checkbox named `name` in the surrounding form ("Select all", W-AIRCRAFT-03). */
export function SelectAll({ name }: { name: string }) {
  return (
    <button
      type="button"
      className={buttonClass("quiet", "s")}
      onClick={(e) => {
        const boxes = [...(e.currentTarget.form?.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`) ?? [])];
        const on = !boxes.every((b) => b.checked);
        boxes.forEach((b) => (b.checked = on));
      }}
    >
      Select all
    </button>
  );
}

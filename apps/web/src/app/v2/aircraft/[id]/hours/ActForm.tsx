"use client";

import { useActionState } from "react";

export type ActResult = { error?: string; ok?: string } | null;

/**
 * A form bound to a server action that answers inline: errors as an alert, success as a polite status line.
 * Actions that close a panel redirect instead and the page shows the `done` notice.
 */
export function ActForm({
  action,
  className,
  children,
}: {
  action: (prev: ActResult, form: FormData) => Promise<ActResult>;
  className?: string;
  children: React.ReactNode;
}) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form action={run} className={className} aria-busy={pending || undefined}>
      {children}
      {state?.error && (
        <p role="alert" className="mt-2 w-full text-small font-semibold text-alarm-text">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="mt-2 w-full text-small text-ink-2">
          {state.ok}
        </p>
      )}
    </form>
  );
}

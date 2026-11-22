"use client";

import { useActionState, useState } from "react";

export type ActResult = { error?: string; ok?: string } | null;

/**
 * A form bound to a server action that answers inline: errors as an alert, success as a polite status line.
 * Actions that close a panel redirect instead and the page shows the `done` notice.
 */
export function ActForm({
  action,
  base,
  className,
  children,
}: {
  base?: string;
  action: (prev: ActResult, form: FormData) => Promise<ActResult>;
  className?: string;
  children: React.ReactNode;
}) {
  const [version] = useState(base);
  const [state, run, pending] = useActionState(action, null);
  return (
    <form action={run} className={className} aria-busy={pending || undefined}>
      {version && <input type="hidden" name="base" value={version} />}
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

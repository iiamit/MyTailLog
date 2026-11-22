"use client";

import { useActionState } from "react";
import Link from "next/link";
import { EXPLAIN_LABEL, EXPLAIN_STATUSES } from "@/lib/v2/records";
import { buttonClass } from "@/ui/Button";
import { Field, FormLeaf, fieldClass } from "@/ui/Form";
import { explainGap, type FormState } from "./actions";

/** "Explain the gap" (W-MAINT-05 `?panel=explain`): writes logbook_gap.status and its note. */
export function ExplainForm({ aircraftId, gapId, renderedBase, title, status, note, closeHref }: {
  aircraftId: string; gapId: string; renderedBase: string; title: string; status: string; note: string | null; closeHref: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(explainGap.bind(null, aircraftId, gapId, renderedBase), null);
  return (
    <FormLeaf title="Explain the gap" closeHref={closeHref}>
      <p className="mb-4 text-body text-ink-2">{title}</p>
      <form action={action} className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-label">What explains it?</legend>
          {EXPLAIN_STATUSES.map((s) => (
            <label key={s} className="flex items-center gap-2 text-body">
              <input type="radio" name="status" value={s} defaultChecked={status === s} required className="size-4 accent-[var(--color-ink)]" />
              {EXPLAIN_LABEL[s]}
            </label>
          ))}
        </fieldset>
        <Field label="Note" help="Shown with the gap on the map, the record room and the dossier.">
          <textarea name="note" rows={3} maxLength={1000} defaultValue={note ?? ""} className={`${fieldClass} h-auto py-2`} />
        </Field>
        {state?.error && <p role="alert" className="text-small font-semibold text-alarm-text">{state.error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={pending} className={buttonClass("primary", "m")}>Save</button>
          <Link href={closeHref} replace scroll={false} className={buttonClass("quiet", "m")}>Cancel</Link>
        </div>
      </form>
    </FormLeaf>
  );
}

"use client";

import { useActionState } from "react";
import { buttonClass } from "@/ui/Button";
import { Field, Notice, fieldClass } from "@/ui/Form";
import { bookVisit, moveVisit, sendVisit, type VisitFormState } from "./actions";

type Item = { key: string; label: string; detail: string };
type Provider = { id: string; name: string };

/** BookVisitDialog (W-STATUS-03) as a right-leaf form: week, optional day, shop, the items, notes. */
export function BookVisitForm({
  aircraftId, suggestionKey, weekOf, minWeek, items, providers, providerId, cancelHref,
}: {
  aircraftId: string; suggestionKey: string | null; weekOf: string; minWeek: string; items: Item[]; providers: Provider[];
  providerId: string | null; cancelHref: string;
}) {
  const [state, action, pending] = useActionState<VisitFormState, FormData>(bookVisit.bind(null, aircraftId, suggestionKey), null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Week of" help="A Monday. One reminder goes out 7 days before the week.">
        <input name="weekOf" type="date" required step={7} min={minWeek} defaultValue={weekOf} className={fieldClass} />
      </Field>
      <Field label="Day (optional)" help="Leave it blank until the shop gives you a day.">
        <input name="visitDate" type="date" className={fieldClass} />
      </Field>
      <Field label="Shop or mechanic">
        <select name="providerId" defaultValue={providerId ?? ""} className={fieldClass}>
          <option value="">Not chosen yet</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </Field>
      <fieldset>
        <legend className="text-label">Items</legend>
        <ul className="mt-1 divide-y divide-rule">
          {items.map((i) => (
            <li key={i.key}>
              <label className="flex min-h-11 items-start gap-3 py-2">
                <input type="checkbox" name="item" value={i.key} defaultChecked className="mt-1 size-[18px] accent-[var(--color-ink)]" />
                <span>
                  <span className="block text-body-strong">{i.label}</span>
                  {i.detail && <span className="block text-small text-ink-3">{i.detail}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <Field label="Notes">
        <textarea name="notes" rows={3} className={`${fieldClass} h-auto py-2`} />
      </Field>
      {state?.error && <Notice tone="alarm">{state.error}</Notice>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={buttonClass("primary", "m")}>Book visit</button>
        <a href={cancelHref} className={buttonClass("quiet", "m")}>Cancel</a>
      </div>
    </form>
  );
}

/** "Move": pick another week. */
export function MoveVisitForm({ aircraftId, visitId, renderedBase, weekOf, minWeek }: { aircraftId: string; visitId: string; renderedBase: string; weekOf: string; minWeek: string }) {
  const [state, action, pending] = useActionState<VisitFormState, FormData>(moveVisit.bind(null, aircraftId, visitId, renderedBase), null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <Field label="Move to the week of">
        <input name="weekOf" type="date" required step={7} min={minWeek} defaultValue={weekOf} className={fieldClass} />
      </Field>
      <button type="submit" disabled={pending} className={buttonClass("secondary", "m")}>Move</button>
      {state?.error && <Notice tone="alarm">{state.error}</Notice>}
    </form>
  );
}

/** "Send to {provider}": makes the link, then hands the owner a mail draft. MyTailLog never sends it. */
export function SendVisitForm({
  aircraftId, visitId, recipient, providerId, providerName,
}: { aircraftId: string; visitId: string; recipient: string; providerId: string | null; providerName: string | null }) {
  const [state, action, pending] = useActionState<VisitFormState, FormData>(sendVisit.bind(null, aircraftId, visitId), null);
  if (state?.url) {
    return (
      <div className="flex flex-col gap-2 rounded-[var(--radius-s)] bg-leaf-2 px-4 py-3">
        <p role="status" className="text-body">Link made. It ends {state.expiresAt?.slice(0, 10)}.</p>
        <input readOnly value={state.url} aria-label="Link for the shop" className={fieldClass} onFocus={(e) => e.currentTarget.select()} />
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClass("secondary", "s")} onClick={() => navigator.clipboard?.writeText(state.url!)}>
            Copy link
          </button>
          {state.mailto && <a href={state.mailto} className={buttonClass("primary", "s")}>Open in your email</a>}
        </div>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label="For" help="The link shows this visit's items and their last pages. No account needed; it ends in 30 days.">
        <input name="recipientLabel" required maxLength={80} defaultValue={recipient} className={fieldClass} />
      </Field>
      {providerId && <input type="hidden" name="providerId" value={providerId} />}
      {state?.error && <Notice tone="alarm">{state.error}</Notice>}
      <div>
        <button type="submit" disabled={pending} className={buttonClass("secondary", "m")}>
          {providerName ? `Send to ${providerName}` : "Make the link"}
        </button>
      </div>
    </form>
  );
}

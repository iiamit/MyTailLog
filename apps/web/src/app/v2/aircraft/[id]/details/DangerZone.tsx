"use client";

import { useActionState, useRef, useState } from "react";
import { buttonClass } from "@/ui/Button";
import { Field, fieldClass } from "@/ui/Form";
import { tailMatches } from "@/lib/v2/details";
import type { ActionState } from "../equipment/ActionForm";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

const Err = ({ state }: { state: ActionState }) =>
  state?.error ? <p role="alert" className="text-small font-semibold text-alarm-text">{state.error}</p> : null;

/** Transfer to a new owner: the confirm names the recipient (W-AIRCRAFT-05 #transfer). */
export function TransferForm({ action, tail }: { action: Action; tail: string }) {
  const [state, run, pending] = useActionState(action, null);
  const [email, setEmail] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <form action={run} className="flex flex-col gap-3">
      <Field label="New owner's email">
        <input name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" className={fieldClass} />
      </Field>
      <label className="flex items-center gap-2 text-body">
        <input type="checkbox" name="keep" className="size-4" /> Keep view access for me
      </label>
      <Err state={state} />
      <div>
        <button
          type="button"
          disabled={pending || !email.includes("@")}
          onClick={() => dialog.current?.showModal()}
          className={buttonClass("alarm", "m")}
        >
          Transfer {tail}
        </button>
      </div>
      <dialog ref={dialog} className="m-auto max-w-[440px] rounded-leaf bg-leaf p-6 text-ink shadow-leaf backdrop:bg-mat/60">
        <p className="text-body">
          Transfer {tail} to {email.trim()}? You can&apos;t undo this yourself.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" autoFocus className={buttonClass("quiet", "m")} onClick={() => dialog.current?.close()}>Cancel</button>
          <button type="submit" className={buttonClass("alarm", "m")} onClick={() => dialog.current?.close()}>Transfer {tail}</button>
        </div>
      </dialog>
    </form>
  );
}

/** Delete: enabled only once the typed tail matches (W-AIRCRAFT-05 #delete). */
export function DeleteForm({ action, tail, cancelHref }: { action: Action; tail: string; cancelHref: string }) {
  const [state, run, pending] = useActionState(action, null);
  const [typed, setTyped] = useState("");
  return (
    <form action={run} className="flex flex-col gap-3">
      <Field label="Type the tail number to confirm">
        <input name="confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} className={`${fieldClass} max-w-[220px] uppercase`} />
      </Field>
      <Err state={state} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending || !tailMatches(typed, tail)} className={buttonClass("alarm", "m")}>
          Delete {tail} and its records
        </button>
        <a href={cancelHref} onClick={() => setTyped("")} className={buttonClass("quiet", "m")}>Cancel</a>
      </div>
    </form>
  );
}

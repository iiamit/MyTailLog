"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/ui/Button";
import { Field, fieldClass } from "@/ui/Form";
import { saveItemDate, saveMeters, saveReminders } from "./actions";

type Res = { ok: true } | { error: string };

/** A small form that saves on submit, says what happened, and refreshes the first status beside it. */
function useSave() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (p: Promise<Res>) => {
    setBusy(true);
    setMsg(null);
    const r = await p.catch(() => ({ error: "That didn't save. Check your connection and try again." }));
    setBusy(false);
    setMsg("error" in r ? { ok: false, text: r.error } : { ok: true, text: "Saved." });
    if (!("error" in r)) router.refresh();
  };
  const said = msg && (
    <span role={msg.ok ? "status" : "alert"} className={`text-small ${msg.ok ? "text-ink-2" : "font-semibold text-alarm-text"}`}>
      {msg.text}
    </span>
  );
  return { run, busy, said };
}

export function MetersForm({ aircraftId, tach, hobbs }: { aircraftId: string; tach: number | null; hobbs: number | null }) {
  const { run, busy, said } = useSave();
  const [editing, setEditing] = useState(tach == null && hobbs == null);
  if (!editing)
    return (
      <p className="flex flex-wrap items-center gap-3 text-body">
        {[tach != null && `Tach ${tach.toFixed(1)}`, hobbs != null && `hobbs ${hobbs.toFixed(1)}`].filter(Boolean).join(", ")}
        <button type="button" className={buttonClass("quiet", "s")} onClick={() => setEditing(true)}>Change</button>
        {said}
      </p>
    );
  return (
    <form
      action={async (fd) => {
        await run(saveMeters(aircraftId, fd));
      }}
      className="grid gap-3"
    >
      <div className="grid max-w-[420px] grid-cols-2 gap-3">
        <Field label="Tach">
          <input name="tach" type="number" step="0.1" min="0" inputMode="decimal" defaultValue={tach ?? ""} className={fieldClass} />
        </Field>
        <Field label="Hobbs">
          <input name="hobbs" type="number" step="0.1" min="0" inputMode="decimal" defaultValue={hobbs ?? ""} className={fieldClass} />
        </Field>
      </div>
      <p className="text-small text-ink-3">No hobbs? The tach is enough.</p>
      <span className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className={buttonClass("secondary", "s")}>{busy ? "Saving…" : "Save meters"}</button>
        {said}
      </span>
    </form>
  );
}

/** "Add date" for a Part 91 item: a DateInput, max today. */
export function ItemDateForm({ aircraftId, kind, label, today, cta = "Save" }: { aircraftId: string; kind: string; label: string; today: string; cta?: string }) {
  const { run, busy, said } = useSave();
  return (
    <form
      action={async (fd) => {
        await run(saveItemDate(aircraftId, kind, fd));
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <Field label={label}>
        <input name="date" type="date" max={today} required className={`${fieldClass} w-[180px]`} />
      </Field>
      <button type="submit" disabled={busy} className={`${buttonClass("secondary", "s")} mb-1`}>{busy ? "Saving…" : cta}</button>
      {said && <span className="mb-2">{said}</span>}
    </form>
  );
}

export function RemindersToggle({ on, email }: { on: boolean; email: string }) {
  const { run, said } = useSave();
  const [checked, setChecked] = useState(on);
  return (
    <div className="grid gap-1">
      <label className="flex items-start gap-3 text-body">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => {
            setChecked(e.target.checked);
            run(saveReminders(e.target.checked));
          }}
          className="mt-1 size-[18px] shrink-0"
        />
        <span>
          <span className="block font-semibold">Email me before anything comes due</span>
          <span className="block text-small text-ink-3">To {email}. You can change the lead time for each item later.</span>
        </span>
      </label>
      {said}
    </div>
  );
}

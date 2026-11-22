"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MaintenanceItem, ServiceProvider } from "@/lib/database.types";
import { ITEM_TYPES, LINES, SHOP_KINDS } from "@/lib/v2/items";
import { buttonClass } from "@/ui/Button";
import { ConfirmSubmit, Field, FormLeaf, fieldClass } from "@/ui/Form";
import { saveItem, saveProvider, stopTracking, type FormState } from "./actions";

const box = "size-4 accent-[var(--color-ink)]";
const area = `${fieldClass} h-auto py-2`;
const two = "grid grid-cols-2 gap-3";

/** Item form on the right leaf (W-MAINT-06): "Track an item" or the item's label. */
export function ItemForm({
  aircraftId,
  item,
  providers,
  closeHref,
  askHref,
}: {
  aircraftId: string;
  item: MaintenanceItem | null;
  providers: Pick<ServiceProvider, "id" | "name" | "kind">[];
  closeHref: string;
  askHref: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveItem.bind(null, aircraftId, item?.id ?? null), null);
  const [base] = useState(item?.updated_at);
  const [kind, setKind] = useState(item?.kind ?? "annual");
  const std = (k: string) => ITEM_TYPES.find((t) => t.kind === k);
  const first = item ? null : std(kind);
  const [label, setLabel] = useState(item?.label ?? first?.label ?? "");
  const [months, setMonths] = useState(String(item?.interval_months ?? first?.months ?? ""));
  const [hours, setHours] = useState(String(item?.interval_hours ?? first?.hours ?? ""));
  const [regulatory, setRegulatory] = useState(item?.regulatory ?? first?.regulatory ?? false);
  const [line, setLine] = useState(item?.line ?? first?.line ?? "airframe");

  // Choosing a standard type prefills its rule (web-inventory §3.7 defaults); an edited name is kept.
  const pick = (k: string) => {
    setKind(k);
    const t = std(k);
    if (!t || k === "other") return;
    if (!label || ITEM_TYPES.some((x) => x.label === label)) setLabel(t.label);
    setMonths(String(t.months ?? ""));
    setHours(String(t.hours ?? ""));
    setRegulatory(t.regulatory);
    setLine(t.line);
  };

  return (
    <FormLeaf title={item ? item.label : "Track an item"} closeHref={closeHref}>
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="base" value={base ?? ""} />
        <Field label="Type">
          <select name="kind" value={kind} onChange={(e) => pick(e.target.value)} className={fieldClass}>
            {ITEM_TYPES.map((t) => <option key={t.kind} value={t.kind}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Name">
          <input name="label" required value={label} onChange={(e) => setLabel(e.target.value)} className={fieldClass} />
        </Field>
        <div className={two}>
          <Field label="Every (months)" help={["annual", "transponder", "pitot_static", "elt"].includes(kind) ? "Due at the end of the month." : undefined}>
            <input name="interval_months" type="number" min="0" step="1" inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} className={fieldClass} />
          </Field>
          <Field label="Every (hours)">
            <input name="interval_hours" type="number" min="0" step="0.1" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} className={fieldClass} />
          </Field>
        </div>
        <fieldset>
          <legend className="text-label">Hours counted on</legend>
          <div className="mt-1 flex gap-4 text-body">
            {[["", "Default"], ["tach", "Tach"], ["hobbs", "Hobbs"], ["airframe", "Airframe"]].map(([v, l]) => (
              <label key={v} className="flex items-center gap-1.5">
                <input type="radio" name="meter" value={v} defaultChecked={(item?.meter ?? "") === v} className={box} /> {l}
              </label>
            ))}
          </div>
          <p className="mt-1 text-small text-ink-3">Oil changes usually count hobbs time; inspections count tach.</p>
        </fieldset>
        <Field label="Book" help="Which logbook its entries are written in.">
          <select name="line" value={line ?? ""} onChange={(e) => setLine(e.target.value)} className={fieldClass}>
            {LINES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Expires on" help="For items with a date instead of an interval, like the ELT battery.">
          <input name="expires_on" type="date" defaultValue={item?.expires_on ?? ""} className={fieldClass} />
        </Field>
        <div className={two}>
          <Field label="Done by">
            <select name="shop_kind" defaultValue={item?.shop_kind ?? ""} className={fieldClass}>
              <option value="">Usual for this item</option>
              {SHOP_KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Shop or mechanic">
            <select name="provider_id" defaultValue={item?.provider_id ?? ""} className={fieldClass}>
              <option value="">Default for the kind</option>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        </div>
        <div className={two}>
          <Field label="Rides along within (days)" help="How early this item may be done to share a shop visit.">
            <input name="visit_window_days" type="number" min="0" step="1" placeholder="60" defaultValue={item?.visit_window_days ?? ""} className={fieldClass} />
          </Field>
          <Field label="Rides along within (hours)">
            <input name="visit_window_hours" type="number" min="0" step="1" placeholder="25" defaultValue={item?.visit_window_hours ?? ""} className={fieldClass} />
          </Field>
        </div>
        <div className={two}>
          <Field label="Last done">
            <input name="last_done_date" type="date" defaultValue={item?.last_done_date ?? ""} className={fieldClass} />
          </Field>
          <Field label="At hours">
            <input name="last_done_hours" type="number" min="0" step="0.1" inputMode="decimal" defaultValue={item?.last_done_hours ?? ""} className={fieldClass} />
          </Field>
        </div>
        <Link href={askHref} className="-mt-2 text-small font-semibold text-board-ink underline decoration-dotted">
          Find it in the logs
        </Link>
        <label className="flex items-start gap-2 text-body">
          <input type="checkbox" name="regulatory" checked={regulatory} onChange={(e) => setRegulatory(e.target.checked)} className={`${box} mt-1`} />
          Required under Part 91. Untick for advisory items like TBO.
        </label>
        <div className={two}>
          <Field label="Remind me (days before)">
            <select name="remind_lead_days" defaultValue={item?.remind_lead_days ?? ""} className={fieldClass}>
              <option value="">Your default</option>
              {[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>{d} days</option>)}
            </select>
          </Field>
          <Field label="Remind me (hours before)">
            <select name="remind_lead_hours" defaultValue={item?.remind_lead_hours ?? ""} className={fieldClass}>
              <option value="">Your default</option>
              {[5, 10, 15, 25].map((h) => <option key={h} value={h}>{h} hours</option>)}
            </select>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-body">
          <input type="checkbox" name="ifr_only" defaultChecked={item?.ifr_only ?? kind === "vor"} className={box} /> IFR only
        </label>
        <Field label="Notes">
          <textarea name="notes" rows={3} defaultValue={item?.notes ?? ""} className={area} />
        </Field>
        {state?.error && <p role="alert" className="text-small font-semibold text-alarm-text">{state.error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pending} className={buttonClass("primary", "m")}>Save</button>
          <Link href={closeHref} replace scroll={false} className={buttonClass("quiet", "m")}>Cancel</Link>
        </div>
      </form>
      {item && (
        <form action={stopTracking.bind(null, aircraftId, item.id, item.updated_at)} className="mt-6 border-t border-rule pt-4">
          <ConfirmSubmit
            label="Stop tracking"
            question={`Stop tracking ${item.label}? Its history stays in the logbooks; it just won't be counted.`}
          />
        </form>
      )}
    </FormLeaf>
  );
}

/** Provider form (W-MAINT-06 `?provider=new|{id}`). */
export function ProviderForm({ aircraftId, provider, closeHref }: { aircraftId: string; provider: ServiceProvider | null; closeHref: string }) {
  const [base] = useState(provider?.updated_at ?? null);
  const [state, action, pending] = useActionState<FormState, FormData>(saveProvider.bind(null, aircraftId, provider?.id ?? null, base), null);
  return (
    <FormLeaf title={provider ? provider.name : "Add a shop or mechanic"} closeHref={closeHref}>
      <form action={action} className="flex flex-col gap-4">
        <Field label="Name">
          <input name="name" required defaultValue={provider?.name ?? ""} className={fieldClass} />
        </Field>
        <Field label="Kind">
          <select name="kind" defaultValue={provider?.kind ?? "mechanic"} className={fieldClass}>
            {SHOP_KINDS.filter(([v]) => v !== "self").map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <div className={two}>
          <Field label="Certificate number">
            <input name="certNumber" defaultValue={provider?.cert_number ?? ""} className={fieldClass} />
          </Field>
          <Field label="Airport">
            <input name="airport" placeholder="KBED" defaultValue={provider?.airport ?? ""} className={fieldClass} />
          </Field>
        </div>
        <Field label="Email" help="Only fills in your own email when you send them a link.">
          <input name="email" type="email" defaultValue={provider?.email ?? ""} className={fieldClass} />
        </Field>
        <Field label="Phone">
          <input name="phone" type="tel" defaultValue={provider?.phone ?? ""} className={fieldClass} />
        </Field>
        <label className="flex items-center gap-2 text-body">
          <input type="checkbox" name="isDefault" defaultChecked={provider?.is_default ?? false} className={box} /> Default for this kind
        </label>
        {state?.error && <p role="alert" className="text-small font-semibold text-alarm-text">{state.error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={pending} className={buttonClass("primary", "m")}>Save</button>
          <Link href={closeHref} replace scroll={false} className={buttonClass("quiet", "m")}>Cancel</Link>
        </div>
      </form>
    </FormLeaf>
  );
}

/** "Find completions in the logs" (POST …/maintenance/scan; needs AI allowance). The result is shown inline. */
export function FindCompletions({ aircraftId }: { aircraftId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = () =>
    start(async () => {
      setMsg(null);
      try {
        const res = await fetch(`/api/aircraft/${aircraftId}/maintenance/scan`, { method: "POST" });
        const j = (await res.json().catch(() => ({}))) as { error?: string; updated?: number; entryCount?: number };
        if (!res.ok) return setMsg(j.error ?? "The check could not run. Try again.");
        const m = j.entryCount ?? 0;
        setMsg(j.updated ? `Updated ${j.updated} ${j.updated === 1 ? "item" : "items"} from ${m} entries.` : `Checked ${m} entries. No completions found.`);
        router.refresh();
      } catch {
        setMsg("No connection. Try again when you're online.");
      }
    });
  return (
    <div className="space-y-2">
      <button type="button" onClick={run} disabled={pending} className={buttonClass("secondary", "m")}>
        {pending ? "Reading the logs…" : "Find completions in the logs"}
      </button>
      <p className="text-small text-ink-3">Last-done dates update by themselves as pages are confirmed. Use this to check the whole history again.</p>
      {msg && <p role="status" className="text-body">{msg}</p>}
    </div>
  );
}

/** "Not now" hides a proposal for this visit only; nothing is stored, so it may be proposed again. */
export function ProposalRow({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <li className="flex flex-wrap items-center gap-2 py-2.5">
      {children}
      <button type="button" className={buttonClass("quiet", "s")} onClick={() => setHidden(true)}>Not now</button>
    </li>
  );
}

"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { IdentitySuggestion } from "@/lib/extraction/pageDetails";
import { Field, fieldClass } from "@/ui/Form";
import { buttonClass } from "@/ui/Button";
import { reviewPageDetails } from "@/app/v2/aircraft/[id]/logbooks/actions";

export type IdentityTarget = { id: string; updated_at: string; name?: string; category?: string | null; make?: string | null; model?: string | null; serial_number?: string | null; part_number?: string | null; tail_number?: string };
const LABEL: Record<string, string> = { make: "Manufacturer", model: "Model", serial_number: "Serial number", part_number: "Part number", tail_number: "Registration" };
const KINDS = ["identity", "equipment", "maintenance", "reference", "blank"];

export function PageDetailsReview(p: { aircraftId: string; pageId: string; base: string; kinds: string[]; suggestions: IdentitySuggestion[]; targets: IdentityTarget[]; canEdit: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [kinds, setKinds] = useState(p.kinds);
  function save(decision: Record<string, unknown>) {
    start(async () => {
      const r = await reviewPageDetails(p.aircraftId, p.pageId, p.base, decision);
      setMessage("error" in r ? r.error : "Saved. The source page stays linked to these details.");
      if (!("error" in r)) router.refresh();
    });
  }
  return <section aria-label="Page contents and aircraft details" className="my-4 space-y-4 border-y border-rule py-4">
    <h2 className="text-body font-bold">Page contents</h2>
    <p className="text-small text-ink-2">Identification and reference pages belong here too. They do not need maintenance entries.</p>
    <fieldset disabled={!p.canEdit || busy} className="space-y-2">
      <legend className="text-label">What is on this page? Choose all that apply.</legend>
      <div className="flex flex-wrap gap-x-4">
        {KINDS.map((k) => <label key={k} className="flex min-h-12 items-center gap-2 text-small"><input type="checkbox" checked={kinds.includes(k)} onChange={(e) => setKinds(e.target.checked ? [...kinds, k] : kinds.filter((x) => x !== k))} />{k === "identity" ? "Identification" : k[0].toUpperCase() + k.slice(1)}</label>)}
      </div>
      <button type="button" className={buttonClass("quiet", "s")} onClick={() => save({ action: "classify", kinds })}>Save page type</button>
    </fieldset>
    {p.suggestions.map((s) => s.status === "pending" ? <Suggestion key={s.id} suggestion={s} targets={p.targets} aircraftId={p.aircraftId} disabled={!p.canEdit || busy} save={save} /> : <p key={s.id} className="text-small text-ink-2">{s.name} · {s.status === "accepted" ? "Details accepted" : "Suggestion dismissed"}</p>)}
    {p.canEdit && <button type="button" disabled={busy} className={buttonClass("quiet", "s")} onClick={() => start(async () => {
      try {
        const r = await fetch(`/api/pages/${p.pageId}/extract`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queue: true }) });
        const result = await r.json();
        setMessage(r.ok ? "Queued for reading, including aircraft details. Confirmed entries and review decisions will be kept." : result.error || "Could not queue this page.");
        if (r.ok) router.refresh();
      } catch { setMessage("Could not connect. Try again when online."); }
    })}>Find aircraft details in this page</button>}
    {message && <p role="status" className="text-small font-semibold">{message}</p>}
  </section>;
}

function Suggestion({ suggestion: s, targets, aircraftId, disabled, save }: { suggestion: IdentitySuggestion; targets: IdentityTarget[]; aircraftId: string; disabled: boolean; save: (d: Record<string, unknown>) => void }) {
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const [target, setTarget] = useState(s.subject === "aircraft" ? aircraftId : "new");
  const [installed, setInstalled] = useState(false);
  const options = targets.filter((t) => s.subject === "aircraft" ? t.id === aircraftId : t.id !== aircraftId);
  const current = options.find((t) => t.id === target);
  return <form ref={form} aria-labelledby={id} className="space-y-3 border-t border-rule pt-4" action={(fd) => {
    const fields = Object.fromEntries(Object.keys(s.fields).map((k) => [k, String(fd.get(k) ?? "").trim()]).filter(([, v]) => v));
    save({ action: "accept", suggestionId: s.id, fields, targetId: current?.id ?? crypto.randomUUID(), targetBase: current?.updated_at ?? null, installed });
  }}>
    <h3 id={id} className="text-body font-bold">{s.name}</h3>
    <blockquote className="border-s-2 border-rule ps-3 text-small text-ink-2">{s.quote}</blockquote>
    <p className="text-small text-ink-2">Read by AI · {s.confidence < 0.8 ? "Uncertain — check every detail against the scan." : "Check against the scan before accepting."}</p>
    <fieldset disabled={disabled} className="space-y-3">
      {s.subject !== "aircraft" && <Field label="Apply details to"><select value={target} onChange={(e) => setTarget(e.target.value)} className={fieldClass}><option value="new">New historical equipment record</option>{options.map((t) => <option key={t.id} value={t.id}>{t.name} {t.serial_number ? `· S/N ${t.serial_number}` : ""}</option>)}</select></Field>}
      {Object.entries(s.fields).map(([k, v]) => <Field key={k} label={LABEL[k]} help={`Currently: ${current ? String(current[k as keyof IdentityTarget] ?? "Not recorded") : "Not recorded"}`}><input name={k} defaultValue={v} maxLength={200} autoCorrect="off" spellCheck={false} className={fieldClass} /></Field>)}
      {s.subject !== "aircraft" && target === "new" && <label className="flex min-h-12 items-start gap-2 text-small"><input type="checkbox" checked={installed} onChange={(e) => setInstalled(e.target.checked)} className="mt-1" />I have checked that this equipment is installed today. Otherwise keep it as historical equipment.</label>}
      <div className="flex flex-wrap gap-2"><button type="submit" className={buttonClass("secondary", "s")}>Accept details</button><button type="button" className={buttonClass("quiet", "s")} onClick={() => save({ action: "dismiss", suggestionId: s.id })}>Dismiss suggestion</button></div>
    </fieldset>
  </form>;
}

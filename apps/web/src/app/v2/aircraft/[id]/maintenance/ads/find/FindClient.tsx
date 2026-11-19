"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, X } from "lucide-react";
import { searchADs, type FaaAd } from "@/lib/faa/federalRegister";
import { extractModels, matchedModels } from "@/lib/faa/applicability";
import { fmtDate } from "@/lib/due/engine";
import { nextDueChoice, whyItCameUp } from "@/lib/v2/ads";
import { getExploreTargets, type CandidateAd } from "@/app/aircraft/[id]/compliance/explore/actions";
import { Leaf, Leaves } from "@/ui/Board";
import { buttonClass } from "@/ui/Button";
import { Field, Notice, fieldClass } from "@/ui/Form";
import { markNotApplicable, trackFound } from "./actions";

type Row = CandidateAd & { why: string; strength: number; makeOnly: boolean };
const key = (n: string | null) => (n ?? "").replace(/\s+/g, "").toLowerCase();

/** W-MAINT-02: results on the left leaf, the selected candidate and how to track it on the right. */
export function FindClient({
  aircraftId,
  tail,
  make,
  model,
  parts,
  annualDue,
}: {
  aircraftId: string;
  tail: string;
  make: string | null;
  model: string | null;
  parts: { name: string; make: string }[];
  annualDue: string | null;
}) {
  const partsByMake = useMemo(() => new Map(parts.map((p) => [p.make.toLowerCase(), p.name])), [parts]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [keywords, setKeywords] = useState("");
  const [state, setState] = useState<"idle" | "searching" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [hiddenTracked, setHiddenTracked] = useState(0);
  const [showMake, setShowMake] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [tracked, setTracked] = useState<Map<string, string | undefined>>(new Map());

  const chips = [...new Set([make, ...parts.map((p) => p.make)].map((m) => m?.trim()).filter((m): m is string => !!m))];
  const modelChip = model ? [make, model].filter(Boolean).join(" ") : null;

  const run = useCallback(async () => {
    if (!navigator.onLine) return setError("Finding ADs needs a connection.");
    setState("searching");
    setError(null);
    const kw = keywords.split(",").map((s) => s.trim()).filter(Boolean);
    const res = await getExploreTargets(aircraftId, { model: modelChip && !removed.has(modelChip) ? (model ?? "") : "", keywords: kw });
    if ("error" in res) {
      setState("idle");
      return setError("Set the aircraft's make or model on Details, or add equipment, or type a keyword.");
    }
    const terms = res.terms.filter((t) => t.kind !== "manufacturer" || !removed.has(t.term));
    const trackedKeys = new Set(res.tracked);
    const found = new Map<string, CandidateAd>();
    let skipped = 0;
    let failures = 0;
    // The Federal Register is fetched from the browser: GPO blocks our servers' egress, its API allows CORS.
    for (const { term, kind } of terms) {
      let ads: FaaAd[] = [];
      try {
        ({ ads } = await searchADs(term, { perPage: 40 }));
      } catch {
        failures++;
        continue;
      }
      for (const ad of ads) {
        const k = key(ad.adNumber);
        if (!k || found.has(k)) continue;
        if (trackedKeys.has(k)) { skipped++; continue; }
        const models = extractModels(ad.title, ad.abstract);
        found.set(k, { ...ad, term, kind, source: "federal_register", models, matched: matchedModels(models, res.model ?? model), documentStatus: null });
      }
    }
    for (const ad of res.drs) if (!found.has(key(ad.adNumber))) found.set(key(ad.adNumber), ad);
    if (terms.length && failures === terms.length && res.drs.length === 0) setError("Couldn't reach the Federal Register or FAA DRS just now. Try again in a minute.");
    const out = [...found.values()]
      .map((c) => ({ ...c, ...whyItCameUp(c, { make, model }, partsByMake) }))
      .sort((x, y) => x.strength - y.strength || (y.effectiveOn ?? "").localeCompare(x.effectiveOn ?? ""));
    setRows(out);
    setHiddenTracked(skipped);
    setSel(out[0]?.adNumber ?? null);
    setState("done");
  }, [aircraftId, keywords, make, model, modelChip, partsByMake, removed]);

  // Search once on arrival with the aircraft's own terms.
  useEffect(() => {
    const t = setTimeout(() => void run(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- first load only; later searches are "Search again"
  }, []);

  const strong = rows.filter((r) => !r.makeOnly);
  const weak = rows.filter((r) => r.makeOnly);
  const visible = showMake ? rows : strong;
  const current = rows.find((r) => r.adNumber === sel) ?? null;

  function onKey(e: React.KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
    if (e.key !== "j" && e.key !== "k") return;
    const i = visible.findIndex((r) => r.adNumber === sel);
    const next = visible[Math.min(visible.length - 1, Math.max(0, i + (e.key === "j" ? 1 : -1)))];
    if (next) setSel(next.adNumber);
  }

  const th = "border-b border-rule-2 pr-3 pb-2 font-bold";
  return (
    <Leaves split="1.55fr 1fr">
      <Leaf label={`Find ADs for ${tail}`}>
        <div onKeyDown={onKey}>
          <h2 className="mb-3 text-heading">Find ADs for {tail}</h2>
          <p className="mb-2 text-body">Search the FAA for ADs that name</p>
          <ul className="mb-3 flex flex-wrap gap-2" aria-label="Search terms">
            {[...(modelChip ? [modelChip] : []), ...chips].map((c) => {
              const off = removed.has(c);
              return (
                <li key={c}>
                  <button
                    type="button"
                    aria-pressed={!off}
                    onClick={() => setRemoved((s) => { const n = new Set(s); if (off) n.delete(c); else n.add(c); return n; })}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-small font-semibold ${off ? "border-control-border text-ink-3 line-through" : "border-ink text-ink"}`}
                  >
                    {c} {!off && <X aria-hidden size={14} />}<span className="sr-only">{off ? ", left out" : ", searched"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[240px] flex-1">
              <Field label="Add a part or keyword">
                <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="fuel selector, Hartzell, seat rail" className={fieldClass} />
              </Field>
            </div>
            <button type="button" onClick={() => void run()} disabled={state === "searching"} className={buttonClass("secondary", "m")}>
              Search again
            </button>
          </div>

          <div className="mt-5" aria-live="polite">
            {error && <Notice tone="alarm">{error}</Notice>}
            {state === "searching" && <p className="text-body text-ink-2">Searching FAA sources…</p>}
            {state === "done" && !error && rows.length === 0 && <p className="text-body text-ink-2">No ADs found for these terms. Try a part name or keyword.</p>}
            {state === "done" && rows.length > 0 && (
              <p className="mb-3 text-body">
                {rows.length} {rows.length === 1 ? "candidate" : "candidates"}. {strong.length} name this aircraft or a part on it.
                {hiddenTracked > 0 && ` ${hiddenTracked} you already track ${hiddenTracked === 1 ? "is" : "are"} hidden.`}
              </p>
            )}
          </div>

          {state === "done" && visible.length > 0 && (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="text-label text-ink-3">
                  <th scope="col" className={th}>AD</th>
                  <th scope="col" className={th}>Subject</th>
                  <th scope="col" className={th}>Why it came up</th>
                  <th scope="col" className="border-b border-rule-2 pb-2 font-bold">Effective</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const isSel = r.adNumber === sel;
                  const cell = `border-b border-rule py-2.5 pr-3 align-top ${isSel ? "bg-leaf-2" : ""}`;
                  return (
                    <tr key={`${r.source}:${r.documentNumber}`}>
                      <td className={`${cell} whitespace-nowrap`}>
                        <button type="button" onClick={() => setSel(r.adNumber)} aria-current={isSel ? "true" : undefined} className="text-body-strong tabular-nums hover:underline">
                          {r.adNumber}
                        </button>
                        {tracked.has(key(r.adNumber)) && <span className="block text-caption text-ink-3">Tracking</span>}
                      </td>
                      <td className={`${cell} max-w-[34ch] text-small`}>{r.title}</td>
                      <td className={`${cell} text-small text-ink-2`}>
                        {r.why}
                        {r.source === "drs" && <span className="block text-caption text-ink-3">FAA DRS{r.documentStatus ? `, ${r.documentStatus}` : ""}</span>}
                      </td>
                      <td className={`${cell} whitespace-nowrap text-small`}>{r.effectiveOn ? fmtDate(r.effectiveOn) : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {state === "done" && weak.length > 0 && !showMake && (
            <button type="button" onClick={() => setShowMake(true)} className={`${buttonClass("quiet", "s")} mt-2`}>
              Show {weak.length} more that only name the make
            </button>
          )}
          <p className="mt-6 text-small text-ink-3">A candidate is a lead to check with your A&amp;P, not a finding that it applies.</p>
        </div>
      </Leaf>
      <CandidateLeaf
        key={current?.adNumber ?? "none"}
        aircraftId={aircraftId}
        tail={tail}
        ad={current}
        annualDue={annualDue}
        partsByMake={partsByMake}
        trackedId={current ? tracked.get(key(current.adNumber)) : undefined}
        isTracked={!!current && tracked.has(key(current.adNumber))}
        onTracked={(n, id) => setTracked((m) => new Map(m).set(key(n), id))}
      />
    </Leaves>
  );
}

function CandidateLeaf({
  aircraftId,
  tail,
  ad,
  annualDue,
  partsByMake,
  trackedId,
  isTracked,
  onTracked,
}: {
  aircraftId: string;
  tail: string;
  ad: Row | null;
  annualDue: string | null;
  partsByMake: Map<string, string>;
  trackedId: string | undefined;
  isTracked: boolean;
  onTracked: (adNumber: string, id: string | undefined) => void;
}) {
  const [recurring, setRecurring] = useState(false);
  const [hours, setHours] = useState("");
  const [months, setMonths] = useState("");
  const [due, setDue] = useState<"annual" | "date" | "tach">(annualDue ? "annual" : "date");
  const [dueValue, setDueValue] = useState("");
  const [naOpen, setNaOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (!ad?.adNumber) {
    return (
      <Leaf label="Candidate">
        <p className="text-body text-ink-2">Select a candidate to read it and track it.</p>
      </Leaf>
    );
  }
  const number = ad.adNumber;
  const part = partsByMake.get(ad.term.toLowerCase());

  async function track() {
    const h = hours.trim() === "" ? null : Number(hours);
    const m = months.trim() === "" ? null : Number(months);
    if (recurring && h == null && m == null) return setError("A recurring AD needs an interval: hours, months, or both.");
    if ([h, m].some((v) => v != null && !(Number.isFinite(v) && v >= 0))) return setError("Intervals and hours are zero or more.");
    setBusy(true);
    setError(null);
    const res = await trackFound(aircraftId, ad!, { recurring, intervalHours: h, intervalMonths: m, ...nextDueChoice(due, dueValue, annualDue) });
    setBusy(false);
    if (res.error) return setError(res.error);
    onTracked(number, res.id);
    setDone(`AD ${number} tracked.`);
  }

  async function doesNotApply() {
    setBusy(true);
    setError(null);
    const res = await markNotApplicable(aircraftId, { adNumber: number, title: ad!.title }, reason);
    setBusy(false);
    if (res.error) return setError(res.error);
    onTracked(number, res.id);
    setDone(`AD ${number} tracked as Does not apply.`);
  }

  return (
    <Leaf label={`AD ${number}`}>
      <p className="text-small text-ink-3">
        AD {number} · FAA{ad.effectiveOn ? `, effective ${new Date(`${ad.effectiveOn}T00:00:00Z`).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}` : ""}
      </p>
      <h2 className="mt-1 text-heading">{ad.title}</h2>
      {ad.abstract && <p className="mt-2 line-clamp-6 text-body text-ink-2">{ad.abstract}</p>}
      <p className="mt-3 text-body">
        {part ? `On ${tail}: the ${part} is made by ${ad.term}. ` : ""}
        Check its serial against the affected range before you track this.
      </p>
      {ad.models.length > 0 && <p className="mt-2 text-small text-ink-3">Models named: {ad.models.join(", ")}</p>}
      <div className="mt-3 flex flex-wrap gap-x-4 text-small">
        {ad.htmlUrl && (
          <a href={ad.htmlUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-board-ink underline decoration-dotted">
            {ad.source === "drs" ? "Read the AD on FAA DRS" : "Read the AD on the Federal Register"} <ExternalLink aria-hidden size={13} />
          </a>
        )}
        {ad.pdfUrl && (
          <a href={ad.pdfUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-board-ink underline decoration-dotted">
            PDF <ExternalLink aria-hidden size={13} />
          </a>
        )}
      </div>

      {isTracked || done ? (
        <div className="mt-5 flex flex-col gap-3">
          <Notice>
            {done ?? `AD ${number} tracked.`}{" "}
            {trackedId && (
              <Link href={`/aircraft/${aircraftId}/maintenance/ads?ad=${trackedId}`} className="font-semibold underline">Open it</Link>
            )}
          </Notice>
          <button type="button" disabled className={buttonClass("primary", "m")}><Check aria-hidden size={16} /> Tracking</button>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-4 border-t border-rule pt-4">
          <fieldset>
            <legend className="text-label">How it repeats</legend>
            <div className="mt-1 inline-flex rounded-control border border-control-border p-0.5">
              {([false, true] as const).map((v) => (
                <label key={String(v)} className="cursor-pointer rounded-[var(--radius-s)] px-3 py-1.5 text-small font-semibold has-checked:bg-ink has-checked:text-leaf">
                  <input type="radio" name="repeats" checked={recurring === v} onChange={() => setRecurring(v)} className="sr-only" />
                  {v ? "Recurring" : "One time"}
                </label>
              ))}
            </div>
          </fieldset>
          {recurring && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Every (hours)">
                <input type="number" min="0" step="0.1" value={hours} onChange={(e) => setHours(e.target.value)} className={fieldClass} />
              </Field>
              <Field label="Every (months)">
                <input type="number" min="0" step="1" value={months} onChange={(e) => setMonths(e.target.value)} className={fieldClass} />
              </Field>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Next due">
              <select value={due} onChange={(e) => setDue(e.target.value as typeof due)} className={fieldClass}>
                <option value="annual" disabled={!annualDue}>At the next annual{annualDue ? `, ${fmtDate(annualDue)}` : ""}</option>
                <option value="date">On a date</option>
                <option value="tach">At tach</option>
              </select>
            </Field>
            {due === "date" && (
              <Field label="Date">
                <input type="date" value={dueValue} onChange={(e) => setDueValue(e.target.value)} className={fieldClass} />
              </Field>
            )}
            {due === "tach" && (
              <Field label="Tach">
                <input type="number" min="0" step="0.1" inputMode="decimal" value={dueValue} onChange={(e) => setDueValue(e.target.value)} className={fieldClass} />
              </Field>
            )}
          </div>
          {error && <p role="alert" className="text-small font-semibold text-alarm-text">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={track} disabled={busy} className={buttonClass("primary", "m")}>Track this AD</button>
            <button type="button" onClick={() => setNaOpen((o) => !o)} disabled={busy} aria-expanded={naOpen} className={buttonClass("secondary", "m")}>
              Doesn&apos;t apply
            </button>
          </div>
          {naOpen && (
            <div className="flex flex-col gap-2">
              <Field label="Reason">
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. serial outside the affected range" className={fieldClass} />
              </Field>
              <div>
                <button type="button" onClick={doesNotApply} disabled={busy} className={buttonClass("secondary", "s")}>Track as Does not apply</button>
              </div>
            </div>
          )}
        </div>
      )}
      <p className="mt-6 text-small text-ink-3">A candidate is a lead to check with your A&amp;P, not a finding that it applies.</p>
    </Leaf>
  );
}

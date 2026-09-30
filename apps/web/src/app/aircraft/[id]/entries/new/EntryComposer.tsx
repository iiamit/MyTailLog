"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { TEMPLATES, missingTemplateFields, templateWork, type TemplateId } from "@/lib/authored-entries";
import type { SigningCredential } from "@/lib/database.types";
import { requestEntryCode, signEntry, type SignInput } from "./actions";

type Book = { id: string; type: string; label: string };
const fieldClass = "mt-1 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm";
const number = (s: string) => s.trim() === "" ? null : Number(s);

export function EntryComposer({ aircraftId, tailNumber, books, fullName, credentials, correctionId }: {
  aircraftId: string; tailNumber: string; books: Book[]; fullName: string;
  credentials: SigningCredential[]; correctionId: string | null;
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState<TemplateId>("oil_filter");
  const [bookId, setBookId] = useState(books.find((b) => b.type === "engine")?.id ?? books[0]?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [hobbs, setHobbs] = useState("");
  const [tach, setTach] = useState("");
  const [airframe, setAirframe] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [customWork, setCustomWork] = useState<string | null>(null);
  const [credentialId, setCredentialId] = useState(credentials[0]?.id ?? "");
  const [performedBy, setPerformedBy] = useState(fullName);
  const [attested, setAttested] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [challengeId, setChallengeId] = useState("");
  const [pendingInput, setPendingInput] = useState<SignInput | null>(null);
  const [code, setCode] = useState("");
  const template = TEMPLATES.find((t) => t.id === templateId)!;
  const selectedCredential = credentials.find((c) => c.id === credentialId);
  const work = customWork ?? templateWork(templateId, answers);
  const draftKey = `mytaillog:entry-draft:${aircraftId}:${correctionId ?? "new"}`;
  const missing = useMemo(() => missingTemplateFields(templateId, answers), [templateId, answers]);

  useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(draftKey) ?? "null");
      if (!draft) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore a saved browser draft once after hydration
      if (TEMPLATES.some((t) => t.id === draft.templateId)) setTemplateId(draft.templateId);
      if (books.some((b) => b.id === draft.bookId)) setBookId(draft.bookId);
      setDate(draft.date ?? date); setHobbs(draft.hobbs ?? ""); setTach(draft.tach ?? "");
      setAirframe(draft.airframe ?? ""); setAnswers(draft.answers ?? {});
      setCustomWork(draft.customWork ?? null); setPerformedBy(draft.performedBy ?? fullName);
    } catch { /* a damaged local draft should not block a new entry */ }
  // Only restore when the aircraft changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);
  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify({ templateId, bookId, date, hobbs, tach, airframe, answers, customWork, performedBy }));
  }, [draftKey, templateId, bookId, date, hobbs, tach, airframe, answers, customWork, performedBy]);

  async function requestCode() {
    setError("");
    if (missing.length) { setError(`Complete: ${missing.join(", ")}.`); return; }
    if (!selectedCredential) { setError("Add a signing credential first."); return; }
    if (selectedCredential.kind !== "mechanic" && template.category !== "preventive") { setError("This template requires a mechanic credential."); return; }
    if (!bookId || !date || !fullName.trim() || !performedBy.trim() || work.trim().length < 20 || !attested) {
      setError("Complete the entry, your profile name, and the signing confirmation."); return;
    }
    if ([hobbs, tach, airframe].some((s) => s.trim() && (!Number.isFinite(Number(s)) || Number(s) < 0))) {
      setError("Meter readings must be non-negative numbers."); return;
    }
    setBusy(true);
    const input: SignInput = {
      id: crypto.randomUUID(), aircraftId, logbookId: bookId, templateId, entryDate: date,
      hobbs: number(hobbs), tach: number(tach), airframe: number(airframe), work,
      answers, credentialId, performedBy, supersedesEntryId: correctionId, attested,
    };
    const result = await requestEntryCode(input);
    setBusy(false);
    if ("error" in result) { setError(result.error); return; }
    setPendingInput(input); setChallengeId(result.id);
  }

  async function sign() {
    if (!pendingInput || !challengeId) return;
    setError(""); setBusy(true);
    const result = await signEntry(pendingInput, challengeId, code);
    setBusy(false);
    if ("error" in result) { setError(result.error); return; }
    localStorage.removeItem(draftKey);
    router.push(`/aircraft/${aircraftId}/entries/${result.id}`);
  }

  return <main className="mx-auto max-w-3xl px-6 py-8">
    <Link href={`/aircraft/${aircraftId}/timeline`} className="text-sm text-accent">← Logbook timeline</Link>
    <h1 className="mt-5 font-display text-2xl font-semibold">{correctionId ? "Correct a signed entry" : "New logbook entry"}</h1>
    <p className="mt-2 text-sm text-dim">{tailNumber} · Your draft stays on this device until you sign online. Sign only work you are authorized to approve.</p>
    <div className="mt-6 space-y-5" style={{ display: challengeId ? "none" : undefined }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">Logbook<select className={fieldClass} value={bookId} onChange={(e) => setBookId(e.target.value)}>{books.map((b) => <option value={b.id} key={b.id}>{b.label}</option>)}</select></label>
        <label className="text-sm">Template<select className={fieldClass} value={templateId} onChange={(e) => { setTemplateId(e.target.value as TemplateId); setAnswers({}); setCustomWork(null); }}>{TEMPLATES.map((t) => <option value={t.id} key={t.id}>{t.title}</option>)}</select></label>
      </div>
      <p className="rounded-md bg-panel2 p-3 text-xs text-dim">{template.source} Applicability depends on the aircraft, work, and signer. Annual and 100-hour inspections require a separate record and are not supported here.</p>
      <div className="grid gap-4 sm:grid-cols-4">
        <label className="text-sm">Completed<input type="date" className={fieldClass} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="text-sm">Tach<input type="number" min="0" step="0.1" className={fieldClass} value={tach} onChange={(e) => setTach(e.target.value)} /></label>
        <label className="text-sm">Hobbs<input type="number" min="0" step="0.1" className={fieldClass} value={hobbs} onChange={(e) => setHobbs(e.target.value)} /></label>
        <label className="text-sm">Airframe time<input type="number" min="0" step="0.1" className={fieldClass} value={airframe} onChange={(e) => setAirframe(e.target.value)} /></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{template.fields.map((f) => <label key={f.key} className="text-sm">{f.label}{f.required ? " *" : ""}<input className={fieldClass} value={answers[f.key] ?? ""} onChange={(e) => setAnswers({ ...answers, [f.key]: e.target.value })} />{f.hint && <span className="mt-1 block text-xs text-dim">{f.hint}</span>}</label>)}</div>
      <label className="block text-sm">Work performed — review and edit before signing<textarea className={`${fieldClass} min-h-36`} value={work} onChange={(e) => setCustomWork(e.target.value)} /></label>
      {customWork !== null && <button type="button" className="text-xs text-accent" onClick={() => setCustomWork(null)}>Reset to template wording</button>}
      <label className="block text-sm">Person who performed the work<input className={fieldClass} value={performedBy} onChange={(e) => setPerformedBy(e.target.value)} /></label>
      <div className="rounded-md border border-line p-4">
        <label className="block text-sm">Sign with certificate<select className={fieldClass} value={credentialId} onChange={(e) => setCredentialId(e.target.value)}><option value="">Select certificate</option>{credentials.filter((c) => c.kind !== "sport_pilot").map((c) => <option key={c.id} value={c.id}>{c.kind.replaceAll("_", " ")} · {c.certificate_number}</option>)}</select></label>
        <Link href="/profile/credentials" className="mt-2 inline-block text-xs text-accent">Manage credentials</Link>
        <p className="mt-3 text-xs text-dim">Signer: {fullName || "set your name in Profile"}. Your signature approves return to service only for the work described. The signed record cannot be edited or deleted; corrections create another signed entry.</p>
        <label className="mt-3 flex gap-2 text-sm"><input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} />I performed or approved only the work described, am authorized to sign it, and intend this electronic signature to approve return to service for that work.</label>
      </div>
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      <button type="button" disabled={busy || !attested} onClick={requestCode} className="rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-bg disabled:opacity-50">{busy ? "Sending code…" : "Email a signing code"}</button>
    </div>
    {challengeId && pendingInput && <div className="mt-6 space-y-4 rounded-lg border border-line p-5">
      <h2 className="font-semibold">Confirm your signature</h2>
      <p className="text-sm text-dim">An eight-digit code was sent to your account email. It expires in 10 minutes. Review this exact entry before entering it:</p>
      <p className="whitespace-pre-wrap rounded bg-panel2 p-3 text-sm">{pendingInput.work}</p>
      <p className="text-xs text-dim">{pendingInput.entryDate} · Tach {pendingInput.tach ?? "—"} · Hobbs {pendingInput.hobbs ?? "—"} · Airframe {pendingInput.airframe ?? "—"}</p>
      <label className="block text-sm">Signing code<input inputMode="numeric" autoComplete="one-time-code" maxLength={8} className={fieldClass} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></label>
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-3"><button type="button" disabled={busy || code.length !== 8} onClick={sign} className="rounded bg-accent px-4 py-2 text-sm font-semibold text-bg disabled:opacity-50">{busy ? "Signing…" : "Sign this entry"}</button>
        <button type="button" onClick={() => { setChallengeId(""); setPendingInput(null); setCode(""); setError(""); }} className="text-sm text-accent">Edit entry</button></div>
    </div>}
  </main>;
}

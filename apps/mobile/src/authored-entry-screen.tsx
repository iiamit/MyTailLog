import { useEffect, useState } from "react";
import { TEMPLATES, TEMPLATE_VERSION, missingTemplateFields, templateWork, type TemplateId } from "@/lib/authored-entries";
import { getByAircraft } from "./db";
import { API_BASE, supabase } from "./supabase";
import type { Aircraft, Logbook } from "./types";
import { TopBar, input, primary, text } from "./ui";
import { color } from "./tokens";

type Credential = { id: string; kind: string; certificate_number: string; rating: string | null };
const kinds = [
  ["private_pilot", "Private pilot"], ["commercial_pilot", "Commercial pilot"],
  ["airline_transport_pilot", "Airline transport pilot"], ["mechanic", "Mechanic (A&P)"],
];
const label: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 5, color: color.dim, fontSize: 12 };
const control: React.CSSProperties = { ...input, width: "100%", boxSizing: "border-box" };
const num = (s: string) => s.trim() ? Number(s) : null;

export function MobileEntryComposer({ aircraft, correctionId, onBack, onSigned }: {
  aircraft: Aircraft; correctionId?: string | null; onBack: () => void; onSigned: () => void | Promise<void>;
}) {
  const [books, setBooks] = useState<Logbook[]>([]);
  const [bookId, setBookId] = useState("");
  const [templateId, setTemplateId] = useState<TemplateId>("oil_filter");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [tach, setTach] = useState("");
  const [hobbs, setHobbs] = useState("");
  const [airframe, setAirframe] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [customWork, setCustomWork] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [performedBy, setPerformedBy] = useState("");
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [credentialId, setCredentialId] = useState("");
  const [newKind, setNewKind] = useState("private_pilot");
  const [newNumber, setNewNumber] = useState("");
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [pendingArgs, setPendingArgs] = useState<Record<string, unknown> | null>(null);
  const [code, setCode] = useState("");
  const draftKey = `mytaillog:entry-draft:${aircraft.id}:${correctionId ?? "new"}`;
  const template = TEMPLATES.find((t) => t.id === templateId)!;
  const work = customWork ?? templateWork(templateId, answers);

  useEffect(() => {
    void getByAircraft<Logbook>("logbook", aircraft.id).then((rows) => {
      setBooks(rows); setBookId((current) => current || rows.find((b) => b.type === "engine")?.id || rows[0]?.id || "");
    });
    try {
      const d = JSON.parse(localStorage.getItem(draftKey) ?? "null");
      if (d) {
        if (TEMPLATES.some((t) => t.id === d.templateId)) setTemplateId(d.templateId);
        setBookId(d.bookId ?? ""); setDate(d.date ?? date); setTach(d.tach ?? ""); setHobbs(d.hobbs ?? "");
        setAirframe(d.airframe ?? ""); setAnswers(d.answers ?? {}); setCustomWork(d.customWork ?? null);
        setFullName(d.fullName ?? ""); setPerformedBy(d.performedBy ?? "");
      }
    } catch { /* start clean if local draft was damaged */ }
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [{ data: profile }, { data: creds }] = await Promise.all([
        supabase.from("profile").select("full_name").eq("id", user.id).maybeSingle(),
        supabase.from("signing_credential").select("id, kind, certificate_number, rating").eq("user_id", user.id),
      ]);
      if (profile?.full_name) { setFullName((n) => n || profile.full_name); setPerformedBy((n) => n || profile.full_name); }
      if (creds) { setCredentials(creds); setCredentialId((id) => id || creds[0]?.id || ""); }
    })();
  // Restore only when the aircraft changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aircraft.id]);
  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify({ bookId, templateId, date, tach, hobbs, airframe, answers, customWork, fullName, performedBy }));
  }, [draftKey, bookId, templateId, date, tach, hobbs, airframe, answers, customWork, fullName, performedBy]);

  async function addCredential() {
    setError("");
    if (!newNumber.trim()) { setError("Enter a certificate number."); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Sign in again."); return; }
    const { data, error: e } = await supabase.from("signing_credential")
      .insert({ user_id: user.id, kind: newKind, certificate_number: newNumber.trim(), rating: newKind === "mechanic" ? "A&P" : null })
      .select("id, kind, certificate_number, rating").single();
    if (e) { setError(e.message); return; }
    setCredentials([...credentials, data]); setCredentialId(data.id); setNewNumber("");
  }

  async function requestCode() {
    setError("");
    const missing = missingTemplateFields(templateId, answers);
    if (missing.length) { setError(`Complete: ${missing.join(", ")}.`); return; }
    const cred = credentials.find((c) => c.id === credentialId);
    if (!cred || !bookId || !fullName.trim() || !date || work.trim().length < 20 || !attested) { setError("Complete the entry, signer details, and confirmation."); return; }
    if (cred.kind !== "mechanic" && template.category !== "preventive") { setError("This work requires a mechanic credential."); return; }
    if ([tach, hobbs, airframe].some((s) => s.trim() && (!Number.isFinite(Number(s)) || Number(s) < 0))) { setError("Meter readings must be non-negative numbers."); return; }
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in again.");
      const { error: profileError } = await supabase.from("profile").update({ full_name: fullName.trim() }).eq("id", user.id);
      if (profileError) throw profileError;
      const request = {
        p_id: crypto.randomUUID(), p_aircraft_id: aircraft.id, p_logbook_id: bookId,
        p_template_id: templateId, p_template_version: TEMPLATE_VERSION, p_entry_date: date,
        p_hobbs: num(hobbs), p_tach: num(tach), p_airframe: num(airframe),
        p_work: work.trim(), p_answers: answers, p_credential_id: credentialId,
        p_performed_by: performedBy.trim(), p_supersedes_entry_id: correctionId ?? null, p_attested: true,
      };
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Sign in again.");
      const res = await fetch(`${API_BASE}/api/signed-entries/challenge`, {
        method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not email the signing code.");
      setPendingArgs(request); setChallengeId(body.id);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  async function sign() {
    if (!pendingArgs || !challengeId || code.length !== 8) return;
    setBusy(true); setError("");
    try {
      const { data, error: e } = await supabase.rpc("sign_authored_entry", {
        ...pendingArgs, p_challenge_id: challengeId, p_code: code,
      });
      if (e) throw e;
      if (!data) throw new Error("The code is incorrect or expired. Request a new code if needed.");
      localStorage.removeItem(draftKey);
      await onSigned();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return <div style={{ paddingBottom: 50 }}>
    <TopBar title={correctionId ? "Correct signed entry" : "New logbook entry"} onBack={onBack} />
    <p style={{ ...text.secondary, color: color.dim }}>Draft saved on this device. Signing requires a connection.</p>
    <div style={{ display: challengeId ? "none" : "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
      <label style={label}>Logbook<select style={control} value={bookId} onChange={(e) => setBookId(e.target.value)}>{books.map((b) => <option key={b.id} value={b.id}>{b.title || b.type}</option>)}</select></label>
      <label style={label}>Template<select style={control} value={templateId} onChange={(e) => { setTemplateId(e.target.value as TemplateId); setAnswers({}); setCustomWork(null); }}>{TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
      <p style={{ ...text.secondary, color: color.dim, margin: 0 }}>{template.source} Confirm applicability to this aircraft.</p>
      <label style={label}>Completed<input type="date" style={control} value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <div style={{ display: "flex", gap: 8 }}>
        <label style={{ ...label, flex: 1 }}>Tach<input type="number" min="0" step="0.1" style={control} value={tach} onChange={(e) => setTach(e.target.value)} /></label>
        <label style={{ ...label, flex: 1 }}>Hobbs<input type="number" min="0" step="0.1" style={control} value={hobbs} onChange={(e) => setHobbs(e.target.value)} /></label>
        <label style={{ ...label, flex: 1 }}>Airframe<input type="number" min="0" step="0.1" style={control} value={airframe} onChange={(e) => setAirframe(e.target.value)} /></label>
      </div>
      {template.fields.map((f) => <label key={f.key} style={label}>{f.label}{f.required ? " *" : ""}<input style={control} value={answers[f.key] ?? ""} onChange={(e) => setAnswers({ ...answers, [f.key]: e.target.value })} />{f.hint}</label>)}
      <label style={label}>Work performed — review before signing<textarea style={{ ...control, minHeight: 135 }} value={work} onChange={(e) => setCustomWork(e.target.value)} /></label>
      {customWork !== null && <button type="button" onClick={() => setCustomWork(null)} style={{ color: color.accent, border: 0, background: "none", textAlign: "left" }}>Reset wording</button>}
      <label style={label}>Your full name<input style={control} value={fullName} onChange={(e) => setFullName(e.target.value)} /></label>
      <label style={label}>Person who performed the work<input style={control} value={performedBy} onChange={(e) => setPerformedBy(e.target.value)} /></label>
      <label style={label}>Sign with certificate<select style={control} value={credentialId} onChange={(e) => setCredentialId(e.target.value)}><option value="">Select certificate</option>{credentials.map((c) => <option key={c.id} value={c.id}>{c.kind.replaceAll("_", " ")} · {c.certificate_number}</option>)}</select></label>
      <div style={{ border: `1px solid ${color.hairline}`, padding: 12, borderRadius: 10 }}>
        <p style={{ ...text.secondary, marginTop: 0 }}>Add a certificate</p>
        <select style={control} value={newKind} onChange={(e) => setNewKind(e.target.value)}>{kinds.map(([kind, name]) => <option key={kind} value={kind}>{name}</option>)}</select>
        <input style={{ ...control, marginTop: 8 }} placeholder="Certificate number" value={newNumber} onChange={(e) => setNewNumber(e.target.value)} />
        <button type="button" onClick={addCredential} style={{ marginTop: 8, color: color.accent, border: 0, background: "none" }}>Save certificate</button>
      </div>
      <label style={{ ...text.secondary, color: color.ink, display: "flex", gap: 8 }}><input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} />I am authorized to sign this work and intend this electronic signature to approve return to service only for the work described.</label>
      {error && <p role="alert" style={{ color: "#ff6b6b", fontSize: 13 }}>{error}</p>}
      <button type="button" disabled={busy || !attested} onClick={requestCode} style={primary}>{busy ? "Sending code…" : "Email a signing code"}</button>
    </div>
    {challengeId && pendingArgs && <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20 }}>
      <h2 style={{ color: color.ink }}>Confirm your signature</h2>
      <p style={{ ...text.secondary, color: color.dim }}>Enter the eight-digit code sent to your account email. It expires in 10 minutes.</p>
      <p style={{ ...text.secondary, color: color.ink, whiteSpace: "pre-wrap" }}>{String(pendingArgs.p_work)}</p>
      <p style={{ ...text.meta, color: color.dim }}>{String(pendingArgs.p_entry_date)} · Tach {String(pendingArgs.p_tach ?? "—")} · Hobbs {String(pendingArgs.p_hobbs ?? "—")}</p>
      <label style={label}>Signing code<input style={control} inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></label>
      {error && <p role="alert" style={{ color: "#ff6b6b", fontSize: 13 }}>{error}</p>}
      <button type="button" disabled={busy || code.length !== 8} onClick={sign} style={primary}>{busy ? "Signing…" : "Sign this entry"}</button>
      <button type="button" onClick={() => { setChallengeId(""); setPendingArgs(null); setCode(""); setError(""); }} style={{ border: 0, background: "none", color: color.accent }}>Edit entry</button>
    </div>}
  </div>;
}

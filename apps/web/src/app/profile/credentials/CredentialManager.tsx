"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SigningCredential } from "@/lib/database.types";

export const CREDENTIAL_KINDS = [
  ["private_pilot", "Private pilot"],
  ["commercial_pilot", "Commercial pilot"],
  ["airline_transport_pilot", "Airline transport pilot"],
  ["mechanic", "Mechanic (A&P)"],
] as const;

export function CredentialManager({ initial, userId }: { initial: SigningCredential[]; userId: string }) {
  const [rows, setRows] = useState(initial);
  const [kind, setKind] = useState<SigningCredential["kind"]>("private_pilot");
  const [number, setNumber] = useState("");
  const [rating, setRating] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const db = createClient();

  async function add() {
    setError("");
    if (!number.trim()) { setError("Enter the certificate number."); return; }
    setBusy(true);
    const { data, error: e } = await db.from("signing_credential")
      .insert({ user_id: userId, kind, certificate_number: number.trim(), rating: kind === "mechanic" ? rating.trim() || "A&P" : null })
      .select("*").single();
    setBusy(false);
    if (e) { setError(e.message); return; }
    setRows([...rows, data]); setNumber(""); setRating("");
  }

  async function remove(id: string) {
    const { error: e } = await db.from("signing_credential").delete().eq("id", id).eq("user_id", userId);
    if (e) { setError(e.message); return; }
    setRows(rows.filter((r) => r.id !== id));
  }

  return <div className="mt-6 space-y-6">
    <ul className="space-y-2">{rows.map((r) => <li key={r.id} className="flex items-center justify-between rounded-lg border border-line p-3 text-sm">
      <span>{CREDENTIAL_KINDS.find(([k]) => k === r.kind)?.[1] ?? r.kind} · {r.certificate_number}{r.rating ? ` · ${r.rating}` : ""}</span>
      <button type="button" className="text-accent" onClick={() => remove(r.id)}>Remove</button>
    </li>)}</ul>
    <div className="space-y-3 rounded-lg border border-line p-4">
      <h2 className="font-semibold">Add a credential</h2>
      <label className="block text-sm">Certificate kind<select className="mt-1 block w-full rounded border border-line bg-panel p-2" value={kind} onChange={(e) => setKind(e.target.value as SigningCredential["kind"])}>{CREDENTIAL_KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select></label>
      <label className="block text-sm">Certificate number<input className="mt-1 block w-full rounded border border-line bg-panel p-2" value={number} onChange={(e) => setNumber(e.target.value)} maxLength={40} /></label>
      {kind === "mechanic" && <label className="block text-sm">Ratings<input className="mt-1 block w-full rounded border border-line bg-panel p-2" value={rating} onChange={(e) => setRating(e.target.value)} placeholder="A&P" /></label>}
      <button type="button" disabled={busy} onClick={add} className="rounded bg-accent px-4 py-2 text-sm text-white disabled:opacity-50">Save credential</button>
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    </div>
  </div>;
}

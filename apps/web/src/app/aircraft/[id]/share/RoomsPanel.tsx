"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom, revokeRoom, deleteRoom } from "./actions";

export type RoomRow = {
  id: string;
  label: string;
  url: string | null;
  expiresAt: string;
  active: boolean;
  revoked: boolean;
  views: number;
  lastView: string | null;
};
export type RoomBook = { id: string; label: string; confirmed: number };
export type RoomDoc = { id: string; label: string };

const DAYS = [7, 30, 90, 180];
const inputClass = "rounded-md border border-line bg-panel2 px-3 py-2 text-ink outline-hidden focus:border-accent";

export function RoomsPanel({
  aircraftId,
  rooms,
  books,
  docs,
  unconfirmed,
  initialLabel,
}: {
  aircraftId: string;
  rooms: RoomRow[];
  books: RoomBook[];
  docs: RoomDoc[];
  unconfirmed: number;
  initialLabel: string;
}) {
  const router = useRouter();
  const [label, setLabel] = useState(initialLabel);
  const [summary, setSummary] = useState(true);
  const [bookIds, setBookIds] = useState(books.map((b) => b.id));
  const [scans, setScans] = useState(false);
  const [docIds, setDocIds] = useState(docs.map((d) => d.id));
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createRoom(aircraftId, { label, includeSummary: summary, logbookIds: bookIds, includeScans: scans, documentIds: docIds, days });
    setBusy(false);
    if (res.error) return setError(res.error);
    setCreated(res.url ?? null);
    setLabel("");
    router.refresh();
  }

  async function act(fn: typeof revokeRoom, id: string) {
    setError(null);
    const res = await fn(aircraftId, id);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  async function copy(url: string) {
    await navigator.clipboard.writeText(url);
    setCopied(url);
  }

  return (
    <section id="record-room" className="panel mb-6 p-5" aria-labelledby="room-h">
      <h2 id="room-h" className="font-display text-[17px] font-semibold">Record room links</h2>
      <p className="mt-1 max-w-2xl text-[13px] text-dim">
        A read-only link for a buyer, mechanic, IA or insurer. They don&apos;t need an account and see only what you
        pick. Every link expires, you can revoke it at any time, and each view is counted.
      </p>

      {rooms.length > 0 && (
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {rooms.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5 text-[13px]">
              <div className="min-w-0 flex-1">
                <div className={r.active ? "text-ink" : "text-faint"}>{r.label}</div>
                <div className="text-[11.5px] text-faint">
                  {r.revoked ? "revoked" : r.active ? `expires ${r.expiresAt.slice(0, 10)}` : `expired ${r.expiresAt.slice(0, 10)}`}
                  {` · ${r.views} ${r.views === 1 ? "view" : "views"}`}
                  {r.lastView ? ` · last ${r.lastView.slice(0, 10)}` : ""}
                </div>
              </div>
              {r.active && r.url && (
                <>
                  <button type="button" onClick={() => copy(r.url!)} className="text-accent hover:opacity-80">
                    {copied === r.url ? "Copied" : "Copy"}
                  </button>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-dim hover:text-ink">Preview</a>
                  <button type="button" onClick={() => act(revokeRoom, r.id)} className="text-annun-red hover:opacity-80">Revoke</button>
                </>
              )}
              {!r.active && (
                <button type="button" onClick={() => act(deleteRoom, r.id)} className="text-dim hover:text-ink">Delete</button>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={create} className="mt-5 flex flex-col gap-3 text-[13px]">
        <label className="flex flex-col gap-1">
          <span className="text-dim">Who is it for?</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} required placeholder="Buyer · J. Smith" className={inputClass} />
        </label>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-dim">Include</legend>
          <Check checked={summary} onChange={() => setSummary(!summary)}>Maintenance summary · status, ADs, equipment, W&amp;B</Check>
          {books.map((b) => (
            <Check key={b.id} checked={bookIds.includes(b.id)} onChange={() => setBookIds(toggle(bookIds, b.id))}>
              {b.label} · {b.confirmed} confirmed
            </Check>
          ))}
          <Check checked={scans} onChange={() => setScans(!scans)}>Page scans from selected logbooks (may include unconfirmed content)</Check>
          {docs.map((d) => (
            <Check key={d.id} checked={docIds.includes(d.id)} onChange={() => setDocIds(toggle(docIds, d.id))}>
              Vault: {d.label}
            </Check>
          ))}
        </fieldset>
        {unconfirmed > 0 && (
          <p className="text-[12px] text-annun-amber">
            {unconfirmed} {unconfirmed === 1 ? "entry isn't" : "entries aren't"} confirmed yet and won&apos;t appear in the entry list. Page scans may still show them if included.
          </p>
        )}

        <label className="flex items-center gap-2">
          <span className="text-dim">Expires in</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={inputClass}>
            {DAYS.map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
        </label>

        {error && <p role="alert" className="text-annun-red">{error}</p>}
        {created && (
          <p role="status" className="text-annun-green">
            Link created.{" "}
            <button type="button" onClick={() => copy(created)} className="underline">{copied === created ? "Copied" : "Copy it"}</button>
          </p>
        )}
        <div>
          <button disabled={busy} className="rounded-[9px] bg-accent px-4 py-2.5 font-semibold text-bg hover:opacity-90 disabled:opacity-50">
            {busy ? "Creating…" : "Create link"}
          </button>
        </div>
      </form>
    </section>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: () => void; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-dim">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{children}</span>
    </label>
  );
}

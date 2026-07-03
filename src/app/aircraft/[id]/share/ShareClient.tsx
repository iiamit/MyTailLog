"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ShareRole } from "@/lib/database.types";
import { addShare, removeShare, transferAircraft } from "./actions";

export type ShareRow = { id: string; email: string; role: ShareRole };

const inputClass =
  "rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

const ROLE_LABEL: Record<ShareRole, string> = {
  viewer: "View only",
  editor: "Can contribute",
};

export function ShareClient({
  aircraftId,
  tail,
  shares,
}: {
  aircraftId: string;
  tail: string;
  shares: ShareRow[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<ShareRow[]>(shares);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("viewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await addShare(aircraftId, email, role);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    const clean = email.trim().toLowerCase();
    setRows((rs) => {
      const without = rs.filter((r) => r.email.toLowerCase() !== clean);
      return [...without, { id: crypto.randomUUID(), email: clean, role }];
    });
    setEmail("");
  }

  async function remove(id: string) {
    setError(null);
    const res = await removeShare(aircraftId, id);
    if (res.error) {
      setError(res.error);
      return;
    }
    setRows((rs) => rs.filter((r) => r.id !== id));
  }

  // Transfer
  const [transferEmail, setTransferEmail] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [transferErr, setTransferErr] = useState<string | null>(null);
  async function transfer(e: React.FormEvent) {
    e.preventDefault();
    if (
      !window.confirm(
        `Transfer ${tail} to ${transferEmail}? You'll lose ownership; they can then share it back with you.`,
      )
    )
      return;
    setTransferring(true);
    setTransferErr(null);
    const res = await transferAircraft(aircraftId, transferEmail);
    setTransferring(false);
    if (res.error) {
      setTransferErr(res.error);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-lg border border-slate-200 p-5 dark:border-slate-800">
        <h2 className="font-semibold">People with access</h2>

        {rows.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Not shared with anyone yet.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.email}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{ROLE_LABEL[r.role]}</div>
                </div>
                <button
                  onClick={() => remove(r.id)}
                  className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-xs text-red-600 hover:border-red-400 dark:border-slate-700 dark:text-red-400"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={add} className="flex flex-col gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          <label className="text-sm font-medium">Invite by email</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="person@example.com"
              className={`${inputClass} flex-1`}
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as ShareRole)}
              className={inputClass}
            >
              <option value="viewer">View only</option>
              <option value="editor">Can contribute</option>
            </select>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-white dark:text-slate-900"
            >
              {busy ? "Adding…" : "Invite"}
            </button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            They get access as soon as they sign in with this email — no account needed first.
          </p>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </form>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-red-200 p-5 dark:border-red-900/50">
        <h2 className="font-semibold text-red-700 dark:text-red-400">Transfer ownership</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Hands {tail} and all its records to another MyTailLog user. They must already have an
          account. This can&apos;t be undone by you afterward.
        </p>
        <form onSubmit={transfer} className="flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            required
            value={transferEmail}
            onChange={(e) => setTransferEmail(e.target.value)}
            placeholder="new-owner@example.com"
            className={`${inputClass} flex-1`}
          />
          <button
            type="submit"
            disabled={transferring}
            className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
          >
            {transferring ? "Transferring…" : "Transfer"}
          </button>
        </form>
        {transferErr && <p className="text-sm text-red-600 dark:text-red-400">{transferErr}</p>}
      </section>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ShareRole } from "@/lib/database.types";
import { addShare, removeShare, transferAircraft, deleteAircraft } from "./actions";

export type ShareRow = { id: string; email: string; role: ShareRole };

const inputClass =
  "rounded-md border border-line bg-panel2 px-3 py-2 text-ink outline-hidden focus:border-accent";

const ROLE_LABEL: Record<ShareRole, string> = {
  viewer: "View only",
  editor: "Can contribute",
};

// Two-letter avatar initials from an email's local part (e.g. "jane.doe@…" → "JA").
function initials(email: string): string {
  const local = email.split("@")[0] ?? "";
  return (local.slice(0, 2) || "??").toUpperCase();
}

export function ShareClient({
  aircraftId,
  tail,
  shares,
  ownerEmail,
}: {
  aircraftId: string;
  tail: string;
  shares: ShareRow[];
  ownerEmail: string;
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

  async function remove(email: string) {
    setError(null);
    const res = await removeShare(aircraftId, email);
    if (res.error) {
      setError(res.error);
      return;
    }
    setRows((rs) => rs.filter((r) => r.email.toLowerCase() !== email.toLowerCase()));
  }

  // Delete
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  async function doDelete(e: React.FormEvent) {
    e.preventDefault();
    setDeleting(true);
    setDeleteErr(null);
    const res = await deleteAircraft(aircraftId, confirmText);
    if (res.error) {
      setDeleteErr(res.error);
      setDeleting(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
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
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="panel flex flex-col gap-1 p-5">
        <h2 className="text-sm font-semibold text-ink">People with access</h2>
        <p className="mb-3 text-xs text-faint">
          Viewers see everything read-only; editors can review and add revisions.
        </p>

        <div className="flex items-center gap-3 border-b border-line py-3">
          <span className="readout flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full border border-accent bg-accent-soft text-[12px] text-accent">
            {ownerEmail ? initials(ownerEmail) : "YOU"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-ink">You</div>
            <div className="truncate text-[11px] text-faint">{ownerEmail || "owner"}</div>
          </div>
          <span className="text-[11px] text-dim">Owner</span>
        </div>

        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 border-b border-line py-3">
            <span className="readout flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full border border-line2 bg-panel2 text-[12px] text-dim">
              {initials(r.email)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-ink">{r.email}</div>
              <div className="truncate text-[11px] text-faint">{ROLE_LABEL[r.role]}</div>
            </div>
            <button
              onClick={() => remove(r.email)}
              className="shrink-0 rounded-md border border-line px-3 py-1.5 text-xs text-annun-red hover:border-annun-red/60"
            >
              Remove
            </button>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="border-b border-line py-3 text-sm text-dim">Not shared with anyone yet.</p>
        )}

        <form onSubmit={add} className="flex flex-col gap-2 pt-4">
          <label className="text-sm font-medium text-ink">Invite by email</label>
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
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "Adding…" : "+ Invite"}
            </button>
          </div>
          <p className="text-xs text-dim">
            They get access as soon as they sign in with this email — no account needed first.
          </p>
          {error && <p className="text-sm text-annun-red">{error}</p>}
        </form>
      </section>

      <div className="flex flex-col gap-3.5">
        <section className="panel flex flex-col gap-2.5 p-[18px]">
          <h2 className="text-[13.5px] font-semibold text-ink">Transfer at sale</h2>
          <p className="text-xs leading-relaxed text-dim">
            Hands {tail} and all its records to another MyTailLog user in one step. They must
            already have an account. This can&apos;t be undone by you afterward.
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
              className="rounded-md border border-line2 bg-panel2 px-4 py-2 text-[13px] text-ink hover:border-accent disabled:opacity-60"
            >
              {transferring ? "Transferring…" : "Transfer ownership"}
            </button>
          </form>
          {transferErr && <p className="text-sm text-annun-red">{transferErr}</p>}
        </section>

        <section
          className="flex flex-col gap-2.5 rounded-xl border p-[18px]"
          style={{ borderColor: "rgba(255,97,86,.3)", background: "var(--red-bg)" }}
        >
          <h2 className="text-[13.5px] font-semibold text-annun-red">Delete aircraft</h2>
          <p className="text-xs leading-relaxed text-dim">
            Permanently removes {tail} and everything under it — every logbook, page, scan,
            extracted entry, AD/SB record, and maintenance item. Export a backup first.
          </p>
          <form onSubmit={doDelete} className="flex flex-col gap-2">
            <label className="text-xs text-ink">
              Type <span className="font-mono font-semibold">DELETE</span> to confirm:
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                className={`${inputClass} flex-1`}
              />
              <button
                type="submit"
                disabled={deleting || confirmText !== "DELETE"}
                className="rounded-md border border-annun-red px-4 py-2 text-[13px] font-medium text-annun-red hover:bg-panel2 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete…"}
              </button>
            </div>
          </form>
          {deleteErr && <p className="text-sm text-annun-red">{deleteErr}</p>}
        </section>
      </div>
    </div>
  );
}

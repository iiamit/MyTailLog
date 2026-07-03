"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { updateProfile } from "./actions";

const inputClass =
  "rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";
const card =
  "flex flex-col gap-3 rounded-lg border border-slate-200 p-5 dark:border-slate-800";

function Status({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <p className={`text-sm ${msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
      {msg.text}
    </p>
  );
}

export function ProfileClient({
  email,
  fullName,
  certNumber,
  notifyDue,
}: {
  email: string;
  fullName: string;
  certNumber: string;
  notifyDue: boolean;
}) {
  const router = useRouter();

  // Details + preferences (server action → DB)
  const [detailsMsg, setDetailsMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);

  async function saveDetails(formData: FormData) {
    setSavingDetails(true);
    setDetailsMsg(null);
    const res = await updateProfile(formData);
    setSavingDetails(false);
    setDetailsMsg(
      res.error ? { ok: false, text: res.error } : { ok: true, text: "Saved." },
    );
  }

  // Email change (Supabase auth → confirmation email)
  const [newEmail, setNewEmail] = useState("");
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function changeEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailMsg(null);
    const { error } = await createClient().auth.updateUser({ email: newEmail });
    setEmailMsg(
      error
        ? { ok: false, text: error.message }
        : { ok: true, text: `Confirm the change from a link sent to ${newEmail}.` },
    );
  }

  // Password set/change
  const [newPassword, setNewPassword] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    const { error } = await createClient().auth.updateUser({ password: newPassword });
    if (error) {
      setPwMsg({ ok: false, text: error.message });
    } else {
      setNewPassword("");
      setPwMsg({ ok: true, text: "Password updated — you can now sign in with it." });
    }
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Details + preferences */}
      <form action={saveDetails} className={card}>
        <h2 className="font-semibold">Details</h2>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Full name</span>
          <input name="full_name" defaultValue={fullName} className={inputClass} placeholder="Jane Aviator" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">A&amp;P / IA certificate number</span>
          <input name="cert_number" defaultValue={certNumber} className={inputClass} placeholder="Optional" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="notify_due" defaultChecked={notifyDue} />
          Email me when maintenance or AD items come due
          <span className="text-xs text-slate-400">(reminders not sent yet)</span>
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={savingDetails}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-white dark:text-slate-900"
          >
            {savingDetails ? "Saving…" : "Save"}
          </button>
          <Status msg={detailsMsg} />
        </div>
      </form>

      {/* How you sign in */}
      <div className={card}>
        <h2 className="font-semibold">How you sign in</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Magic links to <strong>{email}</strong> always work. Set a password to also sign in
          with one.
        </p>
        <form onSubmit={changePassword} className="flex flex-col gap-2">
          <label className="text-sm font-medium">Set / change password</label>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 8 characters"
            className={inputClass}
          />
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:border-slate-500 dark:border-slate-700"
            >
              Update password
            </button>
            <Status msg={pwMsg} />
          </div>
        </form>

        <form onSubmit={changeEmail} className="mt-2 flex flex-col gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          <label className="text-sm font-medium">Change email</label>
          <input
            type="email"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="new@example.com"
            className={inputClass}
          />
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:border-slate-500 dark:border-slate-700"
            >
              Send confirmation
            </button>
            <Status msg={emailMsg} />
          </div>
        </form>
      </div>

      <div>
        <button
          onClick={signOut}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

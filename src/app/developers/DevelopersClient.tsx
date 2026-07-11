"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SCOPE_LABELS } from "@/lib/oauth/scopes";
import { createOAuthApp, deleteOAuthApp } from "./actions";

export type OAuthApp = {
  client_id: string;
  name: string;
  redirect_uris: string[];
  scopes: string[];
  is_confidential: boolean;
  created_at: string;
};

const card = "flex flex-col gap-3 rounded-lg border border-line p-5";
const inputClass =
  "rounded-md border border-line bg-panel2 px-3 py-2 text-ink outline-none focus:border-accent";

export function DevelopersClient({ apps, dataScopes }: { apps: OAuthApp[]; dataScopes: string[] }) {
  const router = useRouter();
  const [list, setList] = useState<OAuthApp[]>(apps);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [newId, setNewId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function register(formData: FormData) {
    setBusy(true);
    setMsg(null);
    setNewId(null);
    const res = await createOAuthApp(formData);
    setBusy(false);
    if (res.error) {
      setMsg({ ok: false, text: res.error });
      return;
    }
    setNewId(res.clientId ?? null);
    setMsg({ ok: true, text: "App registered." });
    router.refresh();
    // Optimistically reflect it (refresh will reconcile).
    (document.getElementById("register-app") as HTMLFormElement | null)?.reset();
  }

  async function remove(clientId: string) {
    const res = await deleteOAuthApp(clientId);
    if (res.error) {
      setMsg({ ok: false, text: res.error });
      return;
    }
    setList((l) => l.filter((a) => a.client_id !== clientId));
    if (newId === clientId) setNewId(null);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Register */}
      <form id="register-app" action={register} className={card}>
        <h2 className="font-semibold">Register an app</h2>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Name</span>
          <input name="name" className={inputClass} placeholder="My Maintenance Tracker" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Redirect URIs</span>
          <textarea
            name="redirect_uris"
            rows={2}
            className={inputClass}
            placeholder={"https://app.example.com/oauth/callback\n(one per line — https, or http://localhost)"}
          />
        </label>
        <fieldset className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Scopes</span>
          {dataScopes.map((s) => (
            <label key={s} className="flex items-center gap-2">
              <input type="checkbox" name="scopes" value={s} />
              <span className="text-ink">{s}</span>
              <span className="text-faint">{SCOPE_LABELS[s] ?? ""}</span>
            </label>
          ))}
          <label className="mt-1 flex items-center gap-2">
            <input type="checkbox" name="offline_access" />
            <span className="text-ink">offline_access</span>
            <span className="text-faint">issue a refresh token for long-lived access</span>
          </label>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Registering…" : "Register app"}
          </button>
          {msg && (
            <span className={`text-sm ${msg.ok ? "text-annun-green" : "text-annun-red"}`}>{msg.text}</span>
          )}
        </div>
        {newId && (
          <div className="rounded-md border border-line bg-panel2 p-3 text-sm">
            <div className="text-faint">Your client_id (public client — use with PKCE, no secret):</div>
            <code className="readout break-all text-ink">{newId}</code>
          </div>
        )}
        <p className="text-[11px] text-faint">
          Apps are public OAuth 2.1 clients (Authorization Code + PKCE). See the{" "}
          <a href="/developers/docs" className="underline">
            API docs
          </a>
          .
        </p>
      </form>

      {/* List */}
      <div className={card}>
        <h2 className="font-semibold">Your apps</h2>
        {list.length === 0 ? (
          <p className="text-sm text-dim">No apps yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {list.map((app) => (
              <li key={app.client_id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0 text-sm">
                  <div className="font-medium text-ink">{app.name}</div>
                  <div className="readout break-all text-[12px] text-faint">{app.client_id}</div>
                  <div className="mt-1 text-faint">{app.scopes.join(", ")}</div>
                  <div className="text-faint">{app.redirect_uris.join(", ")}</div>
                </div>
                <button
                  type="button"
                  onClick={() => remove(app.client_id)}
                  className="shrink-0 rounded-md border border-line px-3 py-1.5 text-sm text-dim hover:border-line2 hover:text-annun-red"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

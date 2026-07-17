"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SCOPE_LABELS } from "@/lib/oauth/scopes";
import { createOAuthApp, deleteOAuthApp, rotateOAuthSecret, updateOAuthAppScopes } from "./actions";

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
  // Render the server-provided `apps` directly; router.refresh() re-fetches after
  // create/delete (no local copy to drift out of sync).
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [newId, setNewId] = useState<string | null>(null);
  // A freshly issued client secret, shown ONCE (create or rotate).
  const [secret, setSecret] = useState<{ clientId: string; value: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // client_id of the app whose scopes are being edited inline (null = none).
  const [editing, setEditing] = useState<string | null>(null);

  async function register(formData: FormData) {
    setBusy(true);
    setMsg(null);
    setNewId(null);
    setSecret(null);
    const res = await createOAuthApp(formData);
    setBusy(false);
    if (res.error) {
      setMsg({ ok: false, text: res.error });
      return;
    }
    setNewId(res.clientId ?? null);
    if (res.clientId && res.clientSecret) setSecret({ clientId: res.clientId, value: res.clientSecret });
    setMsg({ ok: true, text: "App registered." });
    (document.getElementById("register-app") as HTMLFormElement | null)?.reset();
    router.refresh();
  }

  async function rotate(clientId: string) {
    setMsg(null);
    const res = await rotateOAuthSecret(clientId);
    if (res.error) {
      setMsg({ ok: false, text: res.error });
      return;
    }
    if (res.secret) setSecret({ clientId, value: res.secret });
    router.refresh();
  }

  async function saveScopes(clientId: string, formData: FormData) {
    setMsg(null);
    const res = await updateOAuthAppScopes(clientId, formData);
    if (res.error) {
      setMsg({ ok: false, text: res.error });
      return;
    }
    setEditing(null);
    setMsg({ ok: true, text: "Scopes updated. The client can request them on its next authorization." });
    router.refresh();
  }

  async function remove(clientId: string) {
    const res = await deleteOAuthApp(clientId);
    if (res.error) {
      setMsg({ ok: false, text: res.error });
      return;
    }
    if (newId === clientId) setNewId(null);
    if (secret?.clientId === clientId) setSecret(null);
    router.refresh();
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
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="confidential" />
          <span className="text-ink">Confidential (server-to-server)</span>
          <span className="text-faint">issues a client secret (else public + PKCE)</span>
        </label>
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
            <div className="text-faint">Your client_id:</div>
            <code className="readout break-all text-ink">{newId}</code>
          </div>
        )}
        {secret && (
          <div className="rounded-md border border-annun-amber/40 bg-[var(--amb-bg)] p-3 text-sm">
            <div className="font-medium text-annun-amber">
              Client secret — copy it now, it won&apos;t be shown again.
            </div>
            <code className="readout mt-1 block break-all text-ink" data-testid="client-secret">
              {secret.value}
            </code>
          </div>
        )}
        <p className="text-[11px] text-faint">
          OAuth 2.1, Authorization Code + PKCE. Public by default; check{" "}
          <em>Confidential</em> for a server app with a client secret. See the{" "}
          <a href="/developers/docs" className="underline">
            API docs
          </a>
          .
        </p>
      </form>

      {/* List */}
      <div className={card}>
        <h2 className="font-semibold">Your apps</h2>
        {apps.length === 0 ? (
          <p className="text-sm text-dim">No apps yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {apps.map((app) => (
              <li key={app.client_id} className="flex flex-col gap-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 text-sm">
                    <div className="flex items-center gap-2 font-medium text-ink">
                      {app.name}
                      <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-faint">
                        {app.is_confidential ? "confidential" : "public"}
                      </span>
                    </div>
                    <div className="readout break-all text-[12px] text-faint">{app.client_id}</div>
                    <div className="mt-1 text-faint">{app.scopes.join(", ")}</div>
                    <div className="text-faint">{app.redirect_uris.join(", ")}</div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(editing === app.client_id ? null : app.client_id)}
                      className="rounded-md border border-line px-3 py-1.5 text-sm text-dim hover:border-line2 hover:text-ink"
                    >
                      {editing === app.client_id ? "Cancel" : "Edit scopes"}
                    </button>
                    {app.is_confidential && (
                      <button
                        type="button"
                        onClick={() => rotate(app.client_id)}
                        className="rounded-md border border-line px-3 py-1.5 text-sm text-dim hover:border-line2 hover:text-ink"
                      >
                        Rotate secret
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => remove(app.client_id)}
                      className="rounded-md border border-line px-3 py-1.5 text-sm text-dim hover:border-line2 hover:text-annun-red"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {editing === app.client_id && (
                  <form
                    action={(fd) => saveScopes(app.client_id, fd)}
                    className="flex flex-col gap-2 rounded-md border border-line bg-panel2 p-4 text-sm"
                  >
                    <span className="font-medium">Scopes</span>
                    {dataScopes.map((s) => (
                      <label key={s} className="flex items-start gap-2">
                        <input type="checkbox" name="scopes" value={s} defaultChecked={app.scopes.includes(s)} />
                        <span>{SCOPE_LABELS[s] ?? s}</span>
                      </label>
                    ))}
                    <label className="mt-1 flex items-center gap-2">
                      <input type="checkbox" name="offline_access" defaultChecked={app.scopes.includes("offline_access")} />
                      <span>Offline access (refresh tokens)</span>
                    </label>
                    <button
                      type="submit"
                      className="mt-1 self-start rounded-md border border-accent px-3 py-1.5 text-sm text-accent hover:bg-accent hover:text-panel"
                    >
                      Save scopes
                    </button>
                    <span className="text-faint">
                      Existing connections keep their old scopes until the user re-authorizes.
                    </span>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

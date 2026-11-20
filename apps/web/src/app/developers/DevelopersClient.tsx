"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SCOPE_LABELS } from "@/lib/oauth/scopes";
import { ReadSection } from "@/components/public/Read";
import { buttonClass } from "@/ui/Button";
import { fieldClass } from "@/ui/Form";
import { createOAuthApp, deleteOAuthApp, rotateOAuthSecret, updateOAuthAppScopes } from "./actions";

export type OAuthApp = {
  client_id: string;
  name: string;
  redirect_uris: string[];
  scopes: string[];
  is_confidential: boolean;
  created_at: string;
};

const check = "size-5 shrink-0 accent-ink";
const scopeRow = "flex min-h-11 items-start gap-3 py-1.5";
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
    <div>
      <ReadSection id="register" title="Register an app" first>
        <form id="register-app" action={register} className="grid max-w-[54ch] gap-4">
          <label className="block text-label">
            Name
            <input name="name" className={fieldClass} placeholder="e.g. My maintenance tracker" />
          </label>
          <label className="block text-label">
            Redirect URIs
            <textarea name="redirect_uris" rows={3} className={`${fieldClass} h-auto py-2`} placeholder={"e.g. https://app.example.com/oauth/callback"} />
            <span className="mt-1 block text-small font-normal text-ink-3">One per line: https, or http://localhost while you develop.</span>
          </label>
          <fieldset>
            <legend className="text-label">Scopes</legend>
            {dataScopes.map((s) => (
              <label key={s} className={scopeRow}>
                <input type="checkbox" name="scopes" value={s} className={`${check} mt-0.5`} />
                <span><code>{s}</code><span className="block text-small text-ink-2">{SCOPE_LABELS[s] ?? ""}</span></span>
              </label>
            ))}
            <label className={scopeRow}>
              <input type="checkbox" name="offline_access" className={`${check} mt-0.5`} />
              <span><code>offline_access</code><span className="block text-small text-ink-2">Issue a refresh token for long-lived access</span></span>
            </label>
          </fieldset>
          <label className={scopeRow}>
            <input type="checkbox" name="confidential" className={`${check} mt-0.5`} />
            <span className="font-semibold">Confidential (server-to-server)<span className="block text-small font-normal text-ink-2">Issues a client secret. Otherwise the app is public and uses PKCE.</span></span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={busy} className={buttonClass("primary")}>
              {busy ? "Registering…" : "Register app"}
            </button>
            {msg && (
              <span role={msg.ok ? "status" : "alert"} className={`text-small font-semibold ${msg.ok ? "text-ink" : "text-alarm-text"}`}>{msg.text}</span>
            )}
          </div>
          {newId && (
            <div className="rounded-leaf bg-leaf-2 px-4 py-3">
              <p className="text-label text-ink-3">Your client_id</p>
              <code className="break-all">{newId}</code>
            </div>
          )}
          {secret && (
            <div className="border-t-2 border-ink bg-leaf-2 px-4 py-3">
              <p className="font-bold">Client secret: copy it now. It won&apos;t be shown again.</p>
              <code className="mt-1 block break-all" data-testid="client-secret">
                {secret.value}
              </code>
            </div>
          )}
          <p className="text-small text-ink-2">
            OAuth 2.1, authorization code with PKCE. Public by default; check <em>Confidential</em>{" "}for a server app with a
            client secret. See the <a href="/developers/docs">API docs</a>.
          </p>
        </form>
      </ReadSection>

      <ReadSection id="apps" title="Your apps">
        {apps.length === 0 ? (
          <p>No apps yet.</p>
        ) : (
          <ul className="!m-0 !list-none !p-0">
            {apps.map((app) => (
              <li key={app.client_id} className="!m-0 border-b border-rule py-3 last:border-b-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-bold">
                      {app.name}
                      <span className="rounded-[var(--radius-s)] bg-leaf-2 px-1.5 py-0.5 text-label shadow-[inset_0_0_0_1px_var(--color-rule-2)]">
                        {app.is_confidential ? "Confidential" : "Public"}
                      </span>
                    </p>
                    <code className="break-all">{app.client_id}</code>
                    <p className="!mt-1 text-small text-ink-2">{app.scopes.join(", ")}</p>
                    <p className="!mt-0 text-small break-all text-ink-2">{app.redirect_uris.join(", ")}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button type="button" onClick={() => setEditing(editing === app.client_id ? null : app.client_id)} className={buttonClass("secondary", "s")}>
                      {editing === app.client_id ? "Cancel" : "Edit scopes"}
                    </button>
                    {app.is_confidential && (
                      <button type="button" onClick={() => rotate(app.client_id)} className={buttonClass("secondary", "s")}>
                        Rotate secret
                      </button>
                    )}
                    <button type="button" onClick={() => remove(app.client_id)} className={buttonClass("secondary", "s")}>
                      Delete
                    </button>
                  </div>
                </div>
                {editing === app.client_id && (
                  <form action={(fd) => saveScopes(app.client_id, fd)} className="mt-3 grid gap-1 rounded-leaf bg-leaf-2 px-4 py-3">
                    <p className="text-label">Scopes</p>
                    {dataScopes.map((s) => (
                      <label key={s} className={scopeRow}>
                        <input type="checkbox" name="scopes" value={s} defaultChecked={app.scopes.includes(s)} className={`${check} mt-0.5`} />
                        <span>{SCOPE_LABELS[s] ?? s}</span>
                      </label>
                    ))}
                    <label className={scopeRow}>
                      <input type="checkbox" name="offline_access" defaultChecked={app.scopes.includes("offline_access")} className={`${check} mt-0.5`} />
                      <span>Offline access (refresh tokens)</span>
                    </label>
                    <button type="submit" className={`${buttonClass("primary", "s")} mt-1 justify-self-start`}>
                      Save scopes
                    </button>
                    <p className="text-small text-ink-2">Existing connections keep their old scopes until the owner authorizes again.</p>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </ReadSection>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MfbSyncButton } from "@/components/MfbSyncButton";
import type { AlertSettings } from "@/lib/reminders";
import {
  updateProfile,
  updateNotifications,
  saveMfbCredentials,
  disconnectMfb,
  saveAiKey,
  removeAiKey,
  revokeOAuthClient,
  setBackupFrequency,
  disconnectBackup,
} from "./actions";

export type ConnectedApp = {
  clientId: string;
  name: string;
  allAircraft: boolean;
  aircraft: string[];
  scopes: string[];
  since: string;
};

type MfbState = {
  clientId: string;
  hasSecret: boolean;
  connected: boolean;
  username: string;
};

type BackupState = {
  id: string;
  /** "Dropbox", "Google Drive". */
  name: string;
  /** False when this provider's CLIENT_ID/SECRET aren't provisioned. */
  configured: boolean;
  connected: boolean;
  accountLabel: string;
  frequency: "off" | "monthly" | "quarterly";
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: "running" | "ok" | "failed" | "skipped_too_large" | null;
  lastSize: string;
  lastError: string | null;
};

type AiState = {
  keyLast4: string | null;
  provider: "anthropic" | "openai" | null;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  totalCalls: number;
  /** Calls in the last rolling 24 hours — what the daily cap counts. */
  callsToday: number;
  /** The cap that applies right now (higher once you bring your own key). */
  dailyCap: number;
};

// Maps the ?mfb=<status> the OAuth callback / authorize routes redirect back with.
const MFB_STATUS: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "MyFlightBook connected." },
  denied: { ok: false, text: "Authorization was denied at MyFlightBook." },
  state: { ok: false, text: "Couldn’t verify the sign-in request — please try again." },
  noclient: { ok: false, text: "Save your MyFlightBook client ID and secret first." },
  error: { ok: false, text: "Something went wrong talking to MyFlightBook." },
};

// Maps the ?backup=<status>&provider=<id> the authorize / callback routes
// redirect with. `who` is the provider's display name, or a neutral fallback.
const backupStatus = (status: string, who: string): { ok: boolean; text: string } | null =>
  ({
    connected: { ok: true, text: `${who} connected — backups run monthly.` },
    denied: { ok: false, text: `Authorization was denied at ${who}.` },
    state: { ok: false, text: "Couldn’t verify the sign-in request — please try again." },
    unconfigured: { ok: false, text: `${who} backups aren’t configured on this server yet.` },
    error: { ok: false, text: `Something went wrong talking to ${who}.` },
  })[status] ?? null;

const RUN_STATUS: Record<string, { ok: boolean; text: string }> = {
  ok: { ok: true, text: "Succeeded" },
  failed: { ok: false, text: "Failed" },
  running: { ok: true, text: "Running" },
  skipped_too_large: { ok: false, text: "Skipped — too large to upload" },
};

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");

const inputClass =
  "rounded-md border border-line bg-panel2 px-3 py-2 text-ink outline-hidden focus:border-accent";
const card =
  "flex flex-col gap-3 rounded-lg border border-line p-5";

function Status({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <p className={`text-sm ${msg.ok ? "text-annun-green" : "text-annun-red"}`}>
      {msg.text}
    </p>
  );
}

// One notification category: an enable checkbox + its lead-time number input(s).
function AlertRow({
  label,
  enableName,
  enableDefault,
  fields,
}: {
  label: string;
  enableName: string;
  enableDefault: boolean;
  fields: { name: string; unit: string; value: number }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <label className="flex min-w-52 items-center gap-2">
        <input type="checkbox" name={enableName} defaultChecked={enableDefault} />
        <span>{label}</span>
      </label>
      {fields.map((f) => (
        <label key={f.name} className="flex items-center gap-1.5 text-xs text-faint">
          <input
            type="number"
            min={0}
            name={f.name}
            defaultValue={f.value}
            className="w-20 rounded-md border border-line bg-panel2 px-2 py-1 text-ink outline-hidden focus:border-accent"
          />
          {f.unit}
        </label>
      ))}
    </div>
  );
}

export function ProfileClient({
  email,
  fullName,
  certNumber,
  notifyDue,
  alerts,
  mfb,
  ai,
  backups,
  connectedApps,
}: {
  email: string;
  fullName: string;
  certNumber: string;
  notifyDue: boolean;
  alerts: AlertSettings;
  mfb: MfbState;
  ai: AiState;
  backups: BackupState[];
  connectedApps: ConnectedApp[];
}) {
  const router = useRouter();

  // Connected OAuth apps (view + revoke)
  const [apps, setApps] = useState<ConnectedApp[]>(connectedApps);
  const [revoking, setRevoking] = useState<string | null>(null);
  async function revokeApp(clientId: string) {
    setRevoking(clientId);
    const res = await revokeOAuthClient(clientId);
    setRevoking(null);
    if (!res.error) setApps((a) => a.filter((x) => x.clientId !== clientId));
  }

  // Details (server action → DB)
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

  // Notification settings (master toggle + per-category lead times)
  const [notifyOn, setNotifyOn] = useState(notifyDue);
  const [notifMsg, setNotifMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingNotif, setSavingNotif] = useState(false);

  async function saveNotifications(formData: FormData) {
    setSavingNotif(true);
    setNotifMsg(null);
    const res = await updateNotifications(formData);
    setSavingNotif(false);
    setNotifMsg(res.error ? { ok: false, text: res.error } : { ok: true, text: "Saved." });
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

  // An app the user already granted hours:write. Taken from the grant itself so
  // this never hardcodes a partner name.
  const hoursWriter = connectedApps.find((a) => a.scopes.includes("hours:write"));

  // MyFlightBook connection
  const search = useSearchParams();
  const oauthStatus = search.get("mfb");
  const [mfbMsg, setMfbMsg] = useState<{ ok: boolean; text: string } | null>(
    oauthStatus ? MFB_STATUS[oauthStatus] ?? null : null,
  );
  const [savingMfb, setSavingMfb] = useState(false);

  async function saveMfb(formData: FormData) {
    setSavingMfb(true);
    setMfbMsg(null);
    const res = await saveMfbCredentials(formData);
    setSavingMfb(false);
    setMfbMsg(res.error ? { ok: false, text: res.error } : { ok: true, text: "Saved." });
    if (!res.error) router.refresh();
  }

  async function disconnect() {
    const res = await disconnectMfb();
    setMfbMsg(res.error ? { ok: false, text: res.error } : { ok: true, text: "Disconnected." });
    if (!res.error) router.refresh();
  }

  // Bring-your-own AI key
  const [savingAiKey, setSavingAiKey] = useState(false);
  const [aiKeyMsg, setAiKeyMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function saveKey(formData: FormData) {
    setSavingAiKey(true);
    setAiKeyMsg(null);
    const res = await saveAiKey(formData);
    setSavingAiKey(false);
    setAiKeyMsg(res.error ? { ok: false, text: res.error } : { ok: true, text: "Key saved." });
    if (!res.error) router.refresh();
  }

  async function removeKey() {
    const res = await removeAiKey();
    setAiKeyMsg(res.error ? { ok: false, text: res.error } : { ok: true, text: "Key removed." });
    if (!res.error) router.refresh();
  }

  // Cloud backups — one card per provider, each independently connected,
  // scheduled and swept. Messages are keyed by provider id so a failure on one
  // doesn't appear under the other.
  const [backupMsg, setBackupMsg] = useState<Record<string, { ok: boolean; text: string }>>(() => {
    const status = search.get("backup");
    const which = search.get("provider") ?? "";
    const msg = status
      ? backupStatus(status, backups.find((b) => b.id === which)?.name ?? "The backup destination")
      : null;
    return msg ? { [which]: msg } : {};
  });
  const [savingBackup, setSavingBackup] = useState<string | null>(null);

  const setMsg = (id: string, msg: { ok: boolean; text: string }) =>
    setBackupMsg((prev) => ({ ...prev, [id]: msg }));

  async function saveBackupFrequency(formData: FormData) {
    const id = String(formData.get("backup_provider") ?? "");
    setSavingBackup(id);
    const res = await setBackupFrequency(formData);
    setSavingBackup(null);
    setMsg(id, res.error ? { ok: false, text: res.error } : { ok: true, text: "Saved." });
    if (!res.error) router.refresh();
  }

  async function disconnectCloudBackup(id: string, name: string) {
    const res = await disconnectBackup(id);
    setMsg(id, res.error ? { ok: false, text: res.error } : { ok: true, text: `${name} disconnected.` });
    if (!res.error) router.refresh();
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  const usd = (n: number) =>
    n < 0.01 && n > 0 ? "<$0.01" : `$${n.toFixed(2)}`;
  const tokens = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

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
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={savingDetails}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-60"
          >
            {savingDetails ? "Saving…" : "Save"}
          </button>
          <Status msg={detailsMsg} />
        </div>
      </form>

      {/* Notifications */}
      <form action={saveNotifications} className={card}>
        <h2 className="font-semibold">Notifications</h2>
        <p className="text-xs text-faint">
          A daily check emails you before maintenance, inspections, and ADs come due. Set how far
          in advance per category. The oil-change <em>interval</em> (hours between changes) is set
          on the oil item on each aircraft&apos;s Maintenance page — this only controls how early
          you&apos;re alerted.
        </p>

        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="notify_due"
            checked={notifyOn}
            onChange={(e) => setNotifyOn(e.target.checked)}
          />
          Email me reminders before items come due
        </label>

        <fieldset
          disabled={!notifyOn}
          className="flex flex-col gap-3 border-t border-line pt-3 disabled:opacity-50"
        >
          <AlertRow
            label="Annual inspection"
            enableName="annual_enabled"
            enableDefault={alerts.annual.enabled}
            fields={[{ name: "annual_lead_days", unit: "days before", value: alerts.annual.lead_days }]}
          />
          <AlertRow
            label="Oil change"
            enableName="oil_enabled"
            enableDefault={alerts.oil.enabled}
            fields={[{ name: "oil_lead_hours", unit: "hours before", value: alerts.oil.lead_hours }]}
          />
          <AlertRow
            label="Airworthiness Directives (AD/SB)"
            enableName="ad_enabled"
            enableDefault={alerts.ad.enabled}
            fields={[
              { name: "ad_lead_days", unit: "days before", value: alerts.ad.lead_days },
              { name: "ad_lead_hours", unit: "hours before", value: alerts.ad.lead_hours },
            ]}
          />
          <AlertRow
            label="Everything else"
            enableName="default_enabled"
            enableDefault={alerts.default.enabled}
            fields={[
              { name: "default_lead_days", unit: "days before", value: alerts.default.lead_days },
              { name: "default_lead_hours", unit: "hours before", value: alerts.default.lead_hours },
            ]}
          />
        </fieldset>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={savingNotif}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-60"
          >
            {savingNotif ? "Saving…" : "Save notifications"}
          </button>
          <Status msg={notifMsg} />
        </div>
      </form>

      {/* How you sign in */}
      <div className={card}>
        <h2 className="font-semibold">How you sign in</h2>
        <p className="text-xs text-faint">
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
              className="rounded-md border border-line px-4 py-2 text-sm font-medium text-dim hover:border-line2 hover:text-ink"
            >
              Update password
            </button>
            <Status msg={pwMsg} />
          </div>
        </form>

        <form onSubmit={changeEmail} className="mt-2 flex flex-col gap-2 border-t border-line pt-4">
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
              className="rounded-md border border-line px-4 py-2 text-sm font-medium text-dim hover:border-line2 hover:text-ink"
            >
              Send confirmation
            </button>
            <Status msg={emailMsg} />
          </div>
        </form>
      </div>

      {/* MyFlightBook */}
      <div className={card}>
        <h2 className="font-semibold">MyFlightBook</h2>
        {/* Both directions carry the same two names, and the grant below is the
            easier one to make, so people arrive here having done that and read
            "Not connected" as a bug. Name the other link explicitly. */}
        {hoursWriter && !mfb.connected && (
          <p className="rounded-md border border-line bg-panel2 p-3 text-xs text-dim">
            <span className="font-medium text-ink">You don&apos;t need this.</span>{" "}
            <span className="font-medium text-ink">{hoursWriter.name}</span> can already add hours to your
            aircraft — you granted it that under <span className="font-medium text-ink">Connected apps</span>{" "}
            below, and it pushes them to you. This card is the older reverse setup, where MyTailLog reaches
            into your MyFlightBook logbook instead. Only fill it in if you specifically want MyTailLog to do
            the pulling.
          </p>
        )}
        <p className="text-xs text-faint">
          Pull each aircraft&apos;s latest recorded hobbs &amp; tach from your{" "}
          <a
            href="https://myflightbook.com/logbook/mvc/oauth"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-line hover:decoration-line2"
          >
            MyFlightBook
          </a>{" "}
          logbook. Register your own OAuth app there, then paste its client ID and
          secret below. Aircraft are matched by tail number. Your secret is stored
          securely and never shown again.
        </p>

        <p className="text-sm">
          Status:{" "}
          {mfb.connected ? (
            <span className="font-medium text-annun-green">
              Connected{mfb.username ? ` as ${mfb.username}` : ""}
            </span>
          ) : (
            <span className="text-faint">Not connected</span>
          )}
        </p>

        <form action={saveMfb} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Client ID</span>
            <input
              name="mfb_client_id"
              defaultValue={mfb.clientId}
              className={inputClass}
              placeholder="From your MyFlightBook OAuth app"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Client secret</span>
            <input
              type="password"
              name="mfb_client_secret"
              autoComplete="off"
              className={inputClass}
              placeholder={mfb.hasSecret ? "•••••••• (leave blank to keep)" : "Client secret"}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">MyFlightBook username</span>
            <input
              name="mfb_username"
              defaultValue={mfb.username}
              className={inputClass}
              placeholder="Optional — shown as “Connected as …”"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={savingMfb}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-60"
            >
              {savingMfb ? "Saving…" : "Save credentials"}
            </button>
            {mfb.clientId && (
              <a
                href="/api/myflightbook/authorize"
                className="rounded-md border border-line px-4 py-2 text-sm font-medium text-dim hover:border-line2 hover:text-ink"
              >
                {mfb.connected ? "Reconnect" : "Connect MyFlightBook"}
              </a>
            )}
            <Status msg={mfbMsg} />
          </div>
        </form>

        {mfb.connected && (
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <MfbSyncButton />
            <button
              onClick={disconnect}
              className="rounded-md border border-line px-4 py-2 text-sm text-dim hover:border-line2 hover:text-ink"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>

      {/* API key (BYOK) + usage */}
      <div className={card}>
        <h2 className="font-semibold">AI &amp; your API key</h2>
        <p className="text-xs text-faint">
          Extraction and Q&amp;A run on the app&apos;s shared AI provider with a daily cap. Add your own
          Anthropic or OpenAI API key
          to bill AI usage to your own account and get a much higher daily limit. Your key is stored
          encrypted and never shown again.
        </p>
        <p className="text-xs text-faint">
          Create a key in the <a className="underline" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">Anthropic Console</a>
          {" or "}<a className="underline" href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">OpenAI Platform</a>. Chat subscriptions do not include API usage.
        </p>

        <p className="text-sm">
          Status:{" "}
          {ai.keyLast4 ? (
            <span className="font-medium text-annun-green">
              Using your {ai.provider === "openai" ? "OpenAI" : "Anthropic"} key (…{ai.keyLast4})
            </span>
          ) : (
            <span className="text-faint">On the shared key</span>
          )}
        </p>

        {/* Today's allowance, shown to EVERYONE. This used to render only for
            people with their own key, so anyone on the shared key met "Daily AI
            limit reached" with no warning — and no way to see that the number
            counts model calls, not pages. */}
        <div className="border-t border-line pt-3">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-xs text-faint">Used in the last 24 hours</span>
            <span className="font-medium tabular-nums">
              {ai.callsToday} / {ai.dailyCap} calls
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-panel2">
            <div
              className={`h-full rounded-full ${ai.callsToday >= ai.dailyCap ? "bg-annun-red" : ai.callsToday / ai.dailyCap > 0.8 ? "bg-annun-amber" : "bg-accent"}`}
              style={{ width: `${Math.min(100, (ai.callsToday / Math.max(1, ai.dailyCap)) * 100)}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-faint">
            A logbook page usually takes 2 calls to read — 3 if it has rotated stickers — so
            this allowance is roughly {Math.floor(ai.dailyCap / 2)} pages a day. Calls free up
            individually 24 hours after you make them, not all at once at midnight.
          </p>
        </div>

        {ai.keyLast4 && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-faint">Cost so far</dt>
              <dd className="font-medium tabular-nums">{usd(ai.costUsd)}</dd>
            </div>
            <div>
              <dt className="text-xs text-faint">AI calls</dt>
              <dd className="font-medium tabular-nums">{ai.calls}</dd>
            </div>
            <div>
              <dt className="text-xs text-faint">Input tokens</dt>
              <dd className="font-medium tabular-nums">{tokens(ai.inputTokens)}</dd>
            </div>
            <div>
              <dt className="text-xs text-faint">Output tokens</dt>
              <dd className="font-medium tabular-nums">{tokens(ai.outputTokens)}</dd>
            </div>
          </dl>
        )}

        <form action={saveKey} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Provider</span>
            <select name="provider" defaultValue={ai.provider ?? "anthropic"} className={inputClass}>
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">API key</span>
            <input
              type="password"
              name="api_key"
              autoComplete="off"
              className={inputClass}
              placeholder={ai.keyLast4 ? `•••••••• …${ai.keyLast4} (paste to replace)` : "Paste API key"}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={savingAiKey}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-60"
            >
              {savingAiKey ? "Saving…" : "Save key"}
            </button>
            {ai.keyLast4 && (
              <button
                type="button"
                onClick={removeKey}
                className="rounded-md border border-line px-4 py-2 text-sm text-dim hover:border-line2 hover:text-ink"
              >
                Remove key
              </button>
            )}
            <Status msg={aiKeyMsg} />
          </div>
        </form>

        <p className="text-[11px] text-faint">
          Cost is estimated from token counts at the provider&apos;s list prices — treat it as a close
          guide, not your exact invoice.
        </p>
      </div>

      {/* Scheduled cloud backups — one destination per provider, each with its
          own cadence, schedule and history. Connect both for real redundancy. */}
      <div className={card}>
        <h2 className="font-semibold">Automatic cloud backups</h2>
        <p className="text-xs text-faint">
          Push a full <code className="readout text-[12px]">.zip</code> backup — every record plus
          your original scans — to storage you own, once a month or once a quarter, one dated file
          per aircraft at{" "}
          <code className="readout text-[12px]">MyTailLog/&lt;TAIL&gt;/&lt;date&gt;-&lt;TAIL&gt;.zip</code>.
          We can only ever see the files we put there, never the rest of your account, and we only
          ever <em>add</em> — nothing is renamed, replaced or deleted, so retention stays your call.
          Connect more than one and each backs up independently.
        </p>

        {backups.map((b) => (
          <div key={b.id} className="flex flex-col gap-3 border-t border-line pt-4">
            <h3 className="text-sm font-semibold">{b.name}</h3>

            {!b.configured ? (
              <p className="text-sm text-faint">
                {b.name} backups aren&apos;t configured on this server yet (no app credentials). You
                can still download a .zip from any aircraft&apos;s Export page.
              </p>
            ) : (
              <>
                <p className="text-sm">
                  Status:{" "}
                  {b.connected ? (
                    <span className="font-medium text-annun-green">
                      Connected{b.accountLabel ? ` — ${b.accountLabel}` : ""}
                    </span>
                  ) : (
                    <span className="text-faint">Not connected</span>
                  )}
                </p>

                {b.connected && (
                  <>
                    <form action={saveBackupFrequency} className="flex flex-wrap items-center gap-3">
                      <input type="hidden" name="backup_provider" value={b.id} />
                      <label className="flex items-center gap-2 text-sm">
                        <span className="font-medium">Frequency</span>
                        <select
                          name="backup_frequency"
                          defaultValue={b.frequency}
                          aria-label={`${b.name} backup frequency`}
                          className={inputClass}
                        >
                          <option value="off">Off</option>
                          <option value="monthly">Monthly</option>
                          <option value="quarterly">Quarterly</option>
                        </select>
                      </label>
                      <button
                        type="submit"
                        disabled={savingBackup === b.id}
                        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-60"
                      >
                        {savingBackup === b.id ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => disconnectCloudBackup(b.id, b.name)}
                        className="rounded-md border border-line px-4 py-2 text-sm text-dim hover:border-line2 hover:text-ink"
                      >
                        Disconnect {b.name}
                      </button>
                    </form>

                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                      <div>
                        <dt className="text-xs text-faint">Next run</dt>
                        <dd className="font-medium tabular-nums">
                          {b.frequency === "off" ? "—" : day(b.nextRunAt)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-faint">Last run</dt>
                        <dd className="font-medium tabular-nums">{day(b.lastRunAt)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-faint">Result</dt>
                        <dd
                          className={`font-medium ${
                            b.lastStatus && RUN_STATUS[b.lastStatus]?.ok === false
                              ? "text-annun-red"
                              : ""
                          }`}
                        >
                          {b.lastStatus ? RUN_STATUS[b.lastStatus]?.text ?? b.lastStatus : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-faint">Size</dt>
                        <dd className="font-medium tabular-nums">{b.lastSize || "—"}</dd>
                      </div>
                    </dl>

                    {b.lastStatus === "skipped_too_large" && (
                      <p className="text-xs text-annun-amber">
                        That aircraft&apos;s records are too large to upload in one scheduled run —
                        download the .zip from its Export page instead.
                      </p>
                    )}
                    {b.lastStatus === "failed" && b.lastError && (
                      <p className="text-xs text-annun-red">{b.lastError}</p>
                    )}
                  </>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href={`/api/backup/${b.id}/authorize`}
                    className="rounded-md border border-line px-4 py-2 text-sm font-medium text-dim hover:border-line2 hover:text-ink"
                  >
                    {b.connected ? `Reconnect ${b.name}` : `Connect ${b.name}`}
                  </a>
                  <Status msg={backupMsg[b.id] ?? null} />
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Connected apps (OAuth) — read-only access other apps hold to aircraft. */}
      {apps.length > 0 && (
        <div className={card}>
          <h2 className="font-semibold">Connected apps</h2>
          <p className="text-[13px] text-dim">
            Apps you&apos;ve allowed to read your aircraft data. Revoking cuts off access immediately.
          </p>
          <ul className="flex flex-col divide-y divide-line">
            {apps.map((app) => (
              <li key={app.clientId} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="text-sm">
                  <div className="font-medium text-ink">{app.name}</div>
                  <div className="text-faint">
                    {app.allAircraft ? "All aircraft (incl. new)" : app.aircraft.join(", ") || "no aircraft"} ·{" "}
                    {app.scopes.join(", ")}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => revokeApp(app.clientId)}
                  disabled={revoking === app.clientId}
                  className="shrink-0 rounded-md border border-line px-3 py-1.5 text-sm text-dim hover:border-line2 hover:text-annun-red disabled:opacity-60"
                >
                  {revoking === app.clientId ? "Revoking…" : "Revoke"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <button
          onClick={signOut}
          className="rounded-md border border-line px-4 py-2 text-sm text-dim hover:border-line2 hover:text-ink"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

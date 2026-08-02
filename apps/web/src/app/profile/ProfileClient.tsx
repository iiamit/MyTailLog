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
  /** False when DROPBOX_CLIENT_ID/SECRET aren't provisioned on the server. */
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
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  totalCalls: number;
};

// Maps the ?mfb=<status> the OAuth callback / authorize routes redirect back with.
const MFB_STATUS: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "MyFlightBook connected." },
  denied: { ok: false, text: "Authorization was denied at MyFlightBook." },
  state: { ok: false, text: "Couldn’t verify the sign-in request — please try again." },
  noclient: { ok: false, text: "Save your MyFlightBook client ID and secret first." },
  error: { ok: false, text: "Something went wrong talking to MyFlightBook." },
};

// Maps the ?backup=<status> the Dropbox authorize / callback routes redirect with.
const BACKUP_STATUS: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Dropbox connected — backups run monthly." },
  denied: { ok: false, text: "Authorization was denied at Dropbox." },
  state: { ok: false, text: "Couldn’t verify the sign-in request — please try again." },
  unconfigured: { ok: false, text: "Cloud backups aren’t configured on this server yet." },
  error: { ok: false, text: "Something went wrong talking to Dropbox." },
};

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
  backup,
  connectedApps,
}: {
  email: string;
  fullName: string;
  certNumber: string;
  notifyDue: boolean;
  alerts: AlertSettings;
  mfb: MfbState;
  ai: AiState;
  backup: BackupState;
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

  // Bring-your-own Anthropic key
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

  // Cloud backups (Dropbox)
  const [backupMsg, setBackupMsg] = useState<{ ok: boolean; text: string } | null>(
    search.get("backup") ? BACKUP_STATUS[search.get("backup")!] ?? null : null,
  );
  const [savingBackup, setSavingBackup] = useState(false);

  async function saveBackupFrequency(formData: FormData) {
    setSavingBackup(true);
    setBackupMsg(null);
    const res = await setBackupFrequency(formData);
    setSavingBackup(false);
    setBackupMsg(res.error ? { ok: false, text: res.error } : { ok: true, text: "Saved." });
    if (!res.error) router.refresh();
  }

  async function disconnectCloudBackup() {
    const res = await disconnectBackup();
    setBackupMsg(
      res.error ? { ok: false, text: res.error } : { ok: true, text: "Dropbox disconnected." },
    );
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

      {/* Anthropic API key (BYOK) + usage */}
      <div className={card}>
        <h2 className="font-semibold">AI &amp; your Anthropic key</h2>
        <p className="text-xs text-faint">
          Extraction and Q&amp;A use Claude. By default they run on the app&apos;s shared key with a
          daily cap. Add your own{" "}
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-line hover:decoration-line2"
          >
            Anthropic API key
          </a>{" "}
          to bill AI usage to your own account and get a much higher daily limit. Your key is stored
          encrypted and never shown again.
        </p>
        <p className="text-xs text-faint">
          Use an <strong>API key</strong> (<code>sk-ant-…</code>) from the Anthropic Console — a
          Claude.ai Pro/Max subscription can&apos;t be used here.
        </p>

        <p className="text-sm">
          Status:{" "}
          {ai.keyLast4 ? (
            <span className="font-medium text-annun-green">
              Using your key (…{ai.keyLast4})
            </span>
          ) : (
            <span className="text-faint">On the shared key</span>
          )}
        </p>

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
            <span className="font-medium">Anthropic API key</span>
            <input
              type="password"
              name="anthropic_key"
              autoComplete="off"
              className={inputClass}
              placeholder={ai.keyLast4 ? `•••••••• …${ai.keyLast4} (paste to replace)` : "sk-ant-…"}
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
          Cost is estimated from token counts at Anthropic&apos;s list prices — treat it as a close
          guide, not your exact invoice.
        </p>
      </div>

      {/* Scheduled cloud backups (Dropbox) */}
      <div className={card}>
        <h2 className="font-semibold">Automatic cloud backups</h2>
        <p className="text-xs text-faint">
          Push a full <code className="readout text-[12px]">.zip</code> backup — every record plus
          your original scans — to your own Dropbox, once a month or once a quarter. Files are
          written to a dated path inside an app folder we can&apos;t see out of
          (<code className="readout text-[12px]">MyTailLog/&lt;TAIL&gt;/&lt;date&gt;-&lt;TAIL&gt;.zip</code>).
          Nothing in your Dropbox is ever deleted or overwritten — old backups are yours to keep or
          prune.
        </p>

        {!backup.configured ? (
          <p className="text-sm text-faint">
            Cloud backups aren&apos;t configured on this server yet (no Dropbox app credentials).
            You can still download a .zip from any aircraft&apos;s Export page.
          </p>
        ) : (
          <>
            <p className="text-sm">
              Status:{" "}
              {backup.connected ? (
                <span className="font-medium text-annun-green">
                  Connected{backup.accountLabel ? ` — ${backup.accountLabel}` : ""}
                </span>
              ) : (
                <span className="text-faint">Not connected</span>
              )}
            </p>

            {backup.connected && (
              <>
                <form action={saveBackupFrequency} className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <span className="font-medium">Frequency</span>
                    <select
                      name="backup_frequency"
                      defaultValue={backup.frequency}
                      className={inputClass}
                    >
                      <option value="off">Off</option>
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                    </select>
                  </label>
                  <button
                    type="submit"
                    disabled={savingBackup}
                    className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg hover:opacity-90 disabled:opacity-60"
                  >
                    {savingBackup ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={disconnectCloudBackup}
                    className="rounded-md border border-line px-4 py-2 text-sm text-dim hover:border-line2 hover:text-ink"
                  >
                    Disconnect
                  </button>
                </form>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-faint">Next run</dt>
                    <dd className="font-medium tabular-nums">
                      {backup.frequency === "off" ? "—" : day(backup.nextRunAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-faint">Last run</dt>
                    <dd className="font-medium tabular-nums">{day(backup.lastRunAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-faint">Result</dt>
                    <dd
                      className={`font-medium ${
                        backup.lastStatus && RUN_STATUS[backup.lastStatus]?.ok === false
                          ? "text-annun-red"
                          : ""
                      }`}
                    >
                      {backup.lastStatus ? RUN_STATUS[backup.lastStatus]?.text ?? backup.lastStatus : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-faint">Size</dt>
                    <dd className="font-medium tabular-nums">{backup.lastSize || "—"}</dd>
                  </div>
                </dl>

                {backup.lastStatus === "skipped_too_large" && (
                  <p className="text-xs text-annun-amber">
                    That aircraft&apos;s records are too large to upload in one scheduled run —
                    download the .zip from its Export page instead.
                  </p>
                )}
                {backup.lastStatus === "failed" && backup.lastError && (
                  <p className="text-xs text-annun-red">{backup.lastError}</p>
                )}
              </>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <a
                href="/api/backup/dropbox/authorize"
                className="rounded-md border border-line px-4 py-2 text-sm font-medium text-dim hover:border-line2 hover:text-ink"
              >
                {backup.connected ? "Reconnect Dropbox" : "Connect Dropbox"}
              </a>
              <Status msg={backupMsg} />
            </div>
          </>
        )}
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

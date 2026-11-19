"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { exportBackup } from "@/lib/backup/export";
import { disconnectBackup, setBackupFrequency } from "@/app/profile/actions";
import type { SettingsState } from "@/app/profile/loadSettings";
import { Confirm, Said } from "@/app/v2/account/settings/SettingsClient";
import { buttonClass } from "@/ui/Button";
import { fieldClass } from "@/ui/Form";

/** The aircraft selector at the top of the left leaf: switching keeps you on this screen. */
export function AircraftSelect({ aircraft, current }: { aircraft: { id: string; tail: string }[]; current: string | null }) {
  const router = useRouter();
  return (
    <label className="block text-label">
      Aircraft
      <select
        value={current ?? ""}
        onChange={(e) => router.replace(`/account/data?aircraft=${e.target.value}`, { scroll: false })}
        className={`${fieldClass} max-w-[280px]`}
      >
        {aircraft.map((a) => (
          <option key={a.id} value={a.id}>{a.tail}</option>
        ))}
      </select>
    </label>
  );
}

/** "Download backup": the full re-importable .zip, built in the browser with its progress shown. */
export function BackupDownload({ aircraftId }: { aircraftId: string }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={busy}
        className={buttonClass("primary", "m")}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const { blob, tail } = await exportBackup(createClient(), aircraftId, setProgress);
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `mytaillog-${tail}-${new Date().toISOString().slice(0, 10)}.zip`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
          } catch (e) {
            setError(e instanceof Error ? e.message : "The backup stopped. Try again.");
          } finally {
            setBusy(false);
            setProgress(null);
          }
        }}
      >
        {busy ? "Packing…" : "Download backup"}
      </button>
      {progress && <span role="status" className="text-small text-ink-2">{progress}</span>}
      {error && <span role="alert" className="text-small font-semibold text-alarm-text">{error}</span>}
    </span>
  );
}

const RESULT: Record<string, string> = { ok: "worked", failed: "failed", running: "running now", skipped_too_large: "skipped, too large to upload" };
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null);
const CONNECT_STATUS: Record<string, (who: string) => { ok: boolean; text: string }> = {
  connected: (w) => ({ ok: true, text: `${w} connected. Backups run monthly.` }),
  denied: (w) => ({ ok: false, text: `${w} said no to the connection.` }),
  state: () => ({ ok: false, text: "Couldn't check the sign-in request. Try again." }),
  unconfigured: (w) => ({ ok: false, text: `${w} backups aren't set up on this server yet.` }),
  error: (w) => ({ ok: false, text: `Something went wrong talking to ${w}.` }),
};

/** Automatic backups, one row per provider (Dropbox, Google Drive). Frequency saves as it changes. */
export function AutoBackups({ backups, aircraftId, owner }: { backups: SettingsState["backups"]; aircraftId: string | null; owner: boolean }) {
  const router = useRouter();
  const search = useSearchParams();
  const [msg, setMsg] = useState<Record<string, { ok: boolean; text: string }>>(() => {
    const which = search.get("provider") ?? "";
    const s = CONNECT_STATUS[search.get("backup") ?? ""];
    return s ? { [which]: s(backups.find((b) => b.id === which)?.name ?? "The backup service") } : {};
  });
  const say = (id: string, m: { ok: boolean; text: string }) => setMsg((x) => ({ ...x, [id]: m }));
  const anyOn = backups.some((b) => b.connected && b.frequency !== "off");
  const [runMsg, setRunMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="grid gap-4">
      {backups.map((b) => (
        <div key={b.id} className="grid gap-2 border-t border-rule pt-3 first:border-0 first:pt-0">
          <p className="flex flex-wrap items-baseline justify-between gap-2 text-body">
            <b>{b.name}</b>
            <span className="text-small text-ink-2">
              {!b.configured
                ? "not available on this server"
                : !b.connected
                  ? "not connected"
                  : b.frequency === "off"
                    ? `connected${b.accountLabel ? ` as ${b.accountLabel}` : ""} · off`
                    : `${b.frequency}, a folder per aircraft under MyTailLog${b.nextRunAt ? ` · next ${day(b.nextRunAt)}` : ""}`}
            </span>
          </p>
          {b.connected && b.lastRunAt && (
            <p className={`text-small ${b.lastStatus === "failed" || b.lastStatus === "skipped_too_large" ? "font-semibold text-alarm-text" : "text-ink-3"}`}>
              Last run {day(b.lastRunAt)}
              {b.lastSize ? ` · ${b.lastSize}` : ""} · {RESULT[b.lastStatus ?? ""] ?? b.lastStatus}
              {b.lastStatus === "failed" && b.lastError ? `: ${b.lastError}` : ""}
            </p>
          )}
          {b.configured && (
            <span className="flex flex-wrap items-center gap-2">
              {b.connected && (
                <label className="flex items-center gap-2 text-small font-semibold">
                  Frequency
                  <select
                    defaultValue={b.frequency}
                    aria-label={`${b.name} backup frequency`}
                    className={`${fieldClass} mt-0 h-[34px] w-auto`}
                    onChange={async (e) => {
                      const fd = new FormData();
                      fd.set("backup_provider", b.id);
                      fd.set("backup_frequency", e.target.value);
                      const res = await setBackupFrequency(fd).catch(() => ({ error: "That didn't save. Try again." }));
                      say(b.id, res.error ? { ok: false, text: res.error } : { ok: true, text: "Saved." });
                      if (!res.error) router.refresh();
                    }}
                  >
                    <option value="off">Off</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                  </select>
                </label>
              )}
              <a href={`/api/backup/${b.id}/authorize`} className={buttonClass("secondary", "s")}>
                {b.connected ? "Reconnect" : "Connect"}
              </a>
              {b.connected && (
                <Confirm
                  label="Disconnect"
                  confirm={`Disconnect ${b.name}`}
                  question={`Disconnect ${b.name}? Backups already there stay.`}
                  run={async () => {
                    const res = await disconnectBackup(b.id).catch(() => ({ error: "That didn't save. Try again." }));
                    say(b.id, res.error ? { ok: false, text: res.error } : { ok: true, text: `${b.name} disconnected.` });
                    if (!res.error) router.refresh();
                  }}
                />
              )}
              <Said msg={msg[b.id] ?? null} />
            </span>
          )}
        </div>
      ))}
      {anyOn && aircraftId && owner && (
        <span className="flex flex-wrap items-center gap-3 border-t border-rule pt-3">
          <button
            type="button"
            className={buttonClass("secondary", "s")}
            onClick={async () => {
              setRunMsg(null);
              const res = await fetch(`/api/aircraft/${aircraftId}/backup/run`, { method: "POST" }).catch(() => null);
              const body = (await res?.json().catch(() => ({}))) as { error?: string };
              setRunMsg(res?.ok ? { ok: true, text: "Queued. Every aircraft you own goes out on the next backup run." } : { ok: false, text: body?.error ?? "Couldn't reach MyTailLog." });
            }}
          >
            Back up now
          </button>
          <Said msg={runMsg} />
        </span>
      )}
      <p className="text-small text-ink-3">Backups only ever add files; nothing in your Dropbox or Google Drive is deleted.</p>
    </div>
  );
}

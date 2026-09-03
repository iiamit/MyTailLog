import { useEffect, useState } from "react";
import { cacheUsage, clearCache } from "./blobs";
import { CapacitorHttp } from "@capacitor/core";
import { color, text, radius, hit } from "./tokens";
import { THEME_CHOICES, THEME_LABEL, useTheme, type ThemeChoice } from "./theme";
import { unregisterPush, pushState, onPushState, type PushState } from "./push";
import { API_BASE, supabase } from "./supabase";

// The account menu behind the fleet avatar.
//
// Sign out used to be a top-level button above the fleet, competing with the
// aircraft for attention — the one action nobody opens the app to perform. It
// lives here now, along with the app-level utilities (sync, offline download,
// appearance, storage) that likewise aren't why anyone opens the app.
//
// Everything the phone cannot do sits at the bottom as an honest list of links
// to the website, rather than as screens that would have to be built twice.

const WEB_SETTINGS: { label: string; detail: string; path: string }[] = [
  { label: "Profile and reminders", detail: "Your details, and how far ahead we warn you.", path: "/profile" },
  { label: "Cloud backups", detail: "Send a copy of everything to your own Dropbox.", path: "/profile" },
  { label: "MyFlightBook", detail: "Pull your flying hours in automatically.", path: "/profile" },
  { label: "Developer access", detail: "Connect another app to your records.", path: "/developers" },
];

export function AccountMenu({
  email,
  onClose,
  onSync,
  onDownloadAll,
  dl,
  onRebuild,
  onSignOut,
  aircraftId,
  onShare,
}: {
  email: string;
  onClose: () => void;
  onSync: () => void;
  onDownloadAll: () => void;
  dl: { done: number; total: number } | null;
  onRebuild: () => void;
  onSignOut: () => void;
  /** The aircraft in view — "Back up now" and sharing are per-aircraft. */
  aircraftId?: string;
  onShare?: () => void;
}) {
  const downloading = !!dl && dl.total > 0 && dl.done < dl.total;
  const { choice, setChoice } = useTheme();
  const storage = useStorage(dl);
  const push = usePushState();
  const [testing, setTesting] = useState<string | null>(null);
  const [backup, setBackup] = useState<string | null>(null);

  async function runBackup() {
    if (!aircraftId) return;
    setBackup("Starting…");
    setBackup(await postBackup(aircraftId));
  }

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 60, display: "flex", alignItems: "flex-end" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 560, margin: "0 auto", background: color.surface,
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          border: `1px solid ${color.hairline}`,
          padding: "16px 16px calc(20px + env(safe-area-inset-bottom))",
          display: "flex", flexDirection: "column", gap: 6,
          maxHeight: "88vh", overflowY: "auto",
        }}
      >
        <div style={{ ...text.meta, color: color.faint, marginBottom: 6 }}>{email}</div>

        <MenuItem label="Sync now" onClick={onSync} />
        {/* Only where reminders can actually arrive. The answer is the point:
            a working push says so, and a failure names the reason instead of
            leaving someone to guess from an empty inbox. */}
        {push.status === "registered" && (
          <MenuItem
            label={testing ?? "Send a test notification"}
            detail="Checks that reminders can reach this phone."
            onClick={() => {
              if (testing) return;
              setTesting("Sending…");
              void sendTestPush().then((r) => setTesting(r));
            }}
          />
        )}
        {/* Shown only when reminders will NOT arrive. A working device says
            nothing; the point is that a silent failure stops being silent. */}
        {push.status !== "registered" && push.status !== "unsupported" && (
          <MenuItem
            label="Reminders won't arrive on this phone"
            detail={
              push.status === "denied"
                ? "Notifications are turned off for MyTailLog. Turn them on in iOS Settings → Notifications."
                : `This phone couldn't register for notifications. ${push.reason}`
            }
            onClick={() => {}}
          />
        )}
        <MenuItem
          label={downloading ? `Downloading scans… ${dl!.done}/${dl!.total}` : "Download all scans for offline"}
          detail="Fetches every page and document once so the full record browses with no signal."
          onClick={onDownloadAll}
          disabled={downloading}
        />
        {/* The feed is forward-only, so a device that passed a change it could
            not read at the time can never catch up by syncing. This is the way
            back. */}
        <MenuItem
          label="Rebuild from the server"
          detail="Downloads everything fresh. Use it if something on here looks out of date after a sync. Anything you've recorded that hasn't uploaded yet is kept."
          onClick={onRebuild}
        />
        {storage && (
          <MenuItem
            label={`Storage: ${storage.label} held · Clear cached scans`}
            detail="Removes the downloaded page and document images from this phone. Nothing is deleted from your record — they download again when you open them."
            onClick={storage.clear}
          />
        )}
        {aircraftId && (
          <MenuItem
            label="Run a backup now"
            detail={backup ?? "Sends a copy of everything to the cloud storage you connected on the website."}
            onClick={runBackup}
          />
        )}

        <Appearance choice={choice} onChoose={setChoice} />

        <div style={{ ...text.sectionLabel, color: color.faint, margin: "12px 0 2px" }}>On the website</div>
        {onShare && aircraftId && (
          <MenuItem label="Share this aircraft" detail="Give your mechanic or partner access." onClick={onShare} />
        )}
        {WEB_SETTINGS.map((s) => (
          <WebLink key={s.label} {...s} />
        ))}

        <MenuItem
          label="Sign out"
          onClick={() => {
            void unregisterPush().finally(onSignOut);
          }}
          tone={color.danger}
        />
        {/* Apple requires an in-app way to START deleting the account. It is one
            tap from here to the page that does it. */}
        <WebLink label="Delete my account" detail="Permanently removes your account and every record in it." path="/profile#delete-account" tone={color.danger} />

        <button
          onClick={onClose}
          style={{
            marginTop: 6, minHeight: hit.min, background: "transparent",
            border: `1px solid ${color.hairline}`, borderRadius: radius.row,
            color: color.dim, fontFamily: text.rowTitle.fontFamily, fontSize: 14, cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

// --- Appearance -------------------------------------------------------------

function Appearance({ choice, onChoose }: { choice: ThemeChoice; onChoose: (c: ThemeChoice) => void }) {
  return (
    <div style={{ padding: "12px 4px 4px" }}>
      <span style={{ ...text.rowTitle, color: color.ink, display: "block" }}>Appearance</span>
      <span style={{ ...text.meta, color: color.faint, display: "block", margin: "3px 0 10px", lineHeight: 1.45 }}>
        Light is easier to read outside in the sun.
      </span>
      <div style={{ display: "flex", gap: 6, background: color.surfaceRaised, borderRadius: radius.control, padding: 4 }}>
        {THEME_CHOICES.map((c) => {
          const on = c === choice;
          return (
            <button
              key={c}
              onClick={() => onChoose(c)}
              aria-pressed={on}
              className="hoverable"
              style={{
                flex: 1, minHeight: hit.min, borderRadius: radius.chip, cursor: "pointer",
                background: on ? color.surface : "transparent",
                border: `1px solid ${on ? color.hairline : "transparent"}`,
                color: on ? color.ink : color.dim,
                fontFamily: text.rowTitle.fontFamily, fontSize: 14, fontWeight: on ? 600 : 500,
              }}
            >
              {THEME_LABEL[c]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// --- Storage ----------------------------------------------------------------

/** How much of the phone the cached scans are using, and the way to get it back. */
function useStorage(dl: { done: number; total: number } | null): { label: string; clear: () => void } | null {
  const [bytes, setBytes] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    void cacheUsage()
      .catch(() => null)
      .then((usage) => {
        if (live) setBytes(usage?.bytes ?? null);
      });
    return () => {
      live = false;
    };
    // Re-measure once a download-all finishes; that is when the number moves.
  }, [dl?.done, dl?.total]);

  if (bytes == null) return null;
  return {
    label: megabytes(bytes),
    clear: () => {
      setBytes(0);
      void clearCache().catch(() => {});
    },
  };
}

/** Owner-facing size. "0 MB" is a lie when there is something there; say so. */
export function megabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (bytes === 0) return "nothing";
  if (mb < 0.1) return "under 0.1 MB";
  if (mb < 100) return `${mb.toFixed(1)} MB`;
  return `${Math.round(mb)} MB`;
}

// --- Backup -----------------------------------------------------------------

async function postBackup(aircraftId: string): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return "Sign in again to run a backup.";
  try {
    const res = await CapacitorHttp.post({
      url: `${API_BASE}/api/aircraft/${aircraftId}/backup/run`,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      data: {},
    });
    // The archive is built by the nightly sweep, so the honest word is
    // "scheduled" — nothing is sitting in a folder yet.
    if (res.status === 200) return "Backup scheduled — it runs tonight.";
    if (res.status === 404) return "Backups aren't available in this version yet.";
    const err = (res.data as { error?: string } | null)?.error;
    return err || "Couldn't start the backup.";
  } catch {
    return "Needs a connection — try again when you have signal.";
  }
}

// --- Rows -------------------------------------------------------------------

function MenuItem({
  label, detail, onClick, tone, disabled,
}: {
  label: string; detail?: string; onClick: () => void; tone?: string; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="hoverable"
      style={{
        textAlign: "left", background: "transparent", border: "none",
        borderRadius: radius.row, padding: "12px 4px", minHeight: hit.min,
        color: tone ?? color.ink, cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{ ...text.rowTitle, display: "block" }}>{label}</span>
      {detail && (
        <span style={{ ...text.meta, color: color.faint, display: "block", marginTop: 3, lineHeight: 1.45 }}>
          {detail}
        </span>
      )}
    </button>
  );
}

/** target="_blank" is what hands a link to Safari from inside the web view. */
function WebLink({ label, detail, path, tone }: { label: string; detail: string; path: string; tone?: string }) {
  return (
    <a
      href={`${API_BASE}${path}`}
      target="_blank"
      rel="noreferrer"
      className="hoverable"
      style={{
        display: "block", textDecoration: "none",
        borderRadius: radius.row, padding: "12px 4px", minHeight: hit.min,
        color: tone ?? color.ink,
      }}
    >
      <span style={{ ...text.rowTitle, display: "block" }}>
        {label} <span style={{ color: color.faint }}>↗</span>
      </span>
      <span style={{ ...text.meta, color: color.faint, display: "block", marginTop: 3, lineHeight: 1.45 }}>{detail}</span>
    </a>
  );
}

/** The push registration state, live — so the row appears the moment it fails. */
function usePushState(): PushState {
  const [s, setS] = useState<PushState>(() => pushState());
  useEffect(() => onPushState(setS), []);
  return s;
}

/** Ask the server to push to this account's devices, and report what happened. */
async function sendTestPush(): Promise<string> {
  try {
    const { data } = await supabase.auth.getSession();
    const jwt = data.session?.access_token;
    if (!jwt) return "Sign in first";
    const res = await CapacitorHttp.request({
      method: "POST",
      url: `${API_BASE}/api/push/test`,
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      data: {},
    });
    const b = (res.data ?? {}) as { sent?: number; devices?: number; error?: string; hint?: string };
    if (res.status >= 400) return `Failed — ${b.error ?? res.status}`;
    if (b.error) return `Apple refused it — ${b.error}`;
    if (!b.devices) return b.hint ?? "No device registered";
    return b.sent ? "Sent — it should arrive now" : "Nothing sent";
  } catch (e) {
    return e instanceof Error ? `Failed — ${e.message}` : "Failed";
  }
}

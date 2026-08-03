import type { Readable } from "node:stream";
import { dropboxProvider } from "./dropbox";
import { gdriveProvider } from "./gdrive";

// ===========================================================================
// The one shape a cloud-storage target has to satisfy for the backup sweep.
//
// Phase 1 shipped Dropbox, phase 2 adds Google Drive. Box stays dropped (plan
// §3: its single-use rotating refresh token permanently breaks a connection if
// a crash lands between "refreshed" and "persisted"). A user can connect both
// and get genuine redundancy — each destination is scheduled, claimed and swept
// independently (migration 0050).
// ===========================================================================

export type BackupProviderId = "dropbox" | "gdrive";

/** Everything the UI needs to render a provider that may not be connected. */
export const BACKUP_PROVIDERS: { id: BackupProviderId; name: string }[] = [
  { id: "dropbox", name: "Dropbox" },
  { id: "gdrive", name: "Google Drive" },
];

export function isBackupProviderId(id: string): id is BackupProviderId {
  return BACKUP_PROVIDERS.some((p) => p.id === id);
}

export type BackupTokens = {
  accessToken: string;
  /** Null when the provider didn't reissue one (a re-consent may omit it). */
  refreshToken: string | null;
  /** Seconds until the access token expires; null ⇒ unknown / non-expiring. */
  expiresIn: number | null;
  /** Shown as "Connected as …". Never an email unless we hold that scope. */
  accountLabel: string | null;
};

export type BackupProvider = {
  id: BackupProviderId;
  authorizeUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<BackupTokens>;
  refresh(refreshToken: string): Promise<BackupTokens>;
  /**
   * Stream `body` to `path` (absolute, provider-rooted) in chunks. Returns the
   * bytes actually written, which is also the archive size.
   *
   * `state` is opaque per-destination provider state, persisted in
   * `backup_destination.folder_path` and handed back on the next run. Dropbox
   * ignores it (App-folder access already roots us); Google Drive caches there
   * the id of the MyTailLog folder it created, because `drive.file` can only
   * see files our app made and re-resolving it every run is a wasted round
   * trip. A returned `state` that differs from the one passed in is persisted.
   */
  upload(
    accessToken: string,
    path: string,
    body: Readable,
    state?: string | null,
  ): Promise<{ path: string; bytes: number; state?: string | null }>;
};

/** The adapter for a stored destination, or null when it isn't configured. */
export function getProvider(id: string): BackupProvider | null {
  if (id === "dropbox") return dropboxProvider();
  if (id === "gdrive") return gdriveProvider();
  return null;
}

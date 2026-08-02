import type { Readable } from "node:stream";
import { dropboxProvider } from "./dropbox";

// ===========================================================================
// The one shape a cloud-storage target has to satisfy for the backup sweep.
//
// Phase 1 ships Dropbox only (plan §3: no token expiry, no console gauntlet).
// Google Drive is phase 2 and slots in here; Box is dropped. There is
// deliberately no half-built second adapter — an unused stub is a maintenance
// cost that proves nothing about whether the interface fits.
// ===========================================================================

export type BackupProviderId = "dropbox";

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
   */
  upload(accessToken: string, path: string, body: Readable): Promise<{ path: string; bytes: number }>;
};

/** The adapter for a stored destination, or null when it isn't configured. */
export function getProvider(id: string): BackupProvider | null {
  return id === "dropbox" ? dropboxProvider() : null;
}

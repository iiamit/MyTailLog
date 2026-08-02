import { createHash } from "node:crypto";

// ===========================================================================
// Scheduling maths + error redaction for the cloud backup sweep.
//
// Pure functions on purpose: no `server-only`, no DB, no network — so the parts
// that are easy to get quietly wrong (the February date, the spread, what
// counts as a token in an error string) are covered by plain node:test.
// ===========================================================================

export type BackupFrequency = "off" | "monthly" | "quarterly";

const MONTHS: Record<Exclude<BackupFrequency, "off">, number> = { monthly: 1, quarterly: 3 };

/** 400 MB. Deliberately a guess (plan §4) — phase-1 telemetry sets the real one. */
export const DEFAULT_MAX_ARCHIVE_BYTES = 400 * 1024 * 1024;

/** Ceiling above which we refuse to attempt an archive. Env-tunable, no redeploy of code. */
export function maxArchiveBytes(
  env: { BACKUP_MAX_BYTES?: string } = process.env as { BACKUP_MAX_BYTES?: string },
): number {
  const n = Number(env.BACKUP_MAX_BYTES);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_ARCHIVE_BYTES;
}

/**
 * The day of the month this user's backups run on, 1–28.
 *
 * Two reasons for both bounds. 28 because 29/30/31 don't exist in every month —
 * a February schedule would either skip or silently roll into March. And a hash
 * rather than "the 1st" because two Cloud Run instances cannot move the entire
 * user base's archives on the same night; spreading them over 28 days makes each
 * night's work 1/28th of the fleet.
 *
 * Stable per user (sha256 of the id), so it doesn't drift between runs.
 */
export function dayOfMonthFor(userId: string): number {
  return (createHash("sha256").update(userId).digest().readUInt32BE(0) % 28) + 1;
}

/**
 * The next run instant strictly after `from`, at 03:00 UTC on the user's day.
 * Null when the cadence is off.
 *
 * Anchored on `from`'s month and stepped forward, so `quarterly` means "every
 * 3rd month counting from when you set it", not "Jan/Apr/Jul/Oct".
 */
export function nextRunAt(
  frequency: BackupFrequency,
  dayOfMonth: number,
  from: Date = new Date(),
): string | null {
  if (frequency === "off") return null;
  const step = MONTHS[frequency];
  // dayOfMonth ≤ 28, so Date.UTC never rolls over into the next month.
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), dayOfMonth, 3, 0, 0));
  while (d.getTime() <= from.getTime()) d.setUTCMonth(d.getUTCMonth() + step);
  return d.toISOString();
}

/** True when the aircraft's blobs are too big to attempt in one 300 s request. */
export function tooLargeToArchive(bytes: number, limit = maxArchiveBytes()): boolean {
  return bytes > limit;
}

/** Human-readable byte size for the UI and the failure email. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n < 10 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

// A provider's 401 body quotes the credential back at you, and backup_run.error
// is readable by the browser BY DESIGN (the user must be able to see why their
// backup failed). So everything token-shaped is scrubbed before it's stored.
// Over-redaction is the safe direction here: a slightly less precise error
// message costs a support round-trip, a leaked refresh token costs the user's
// entire Dropbox app folder.
const PATTERNS: [RegExp, string][] = [
  // key: value / key=value forms, including JSON.
  [
    /("?\b(?:access_token|refresh_token|id_token|client_secret|authorization|api_key|code)"?\s*[:=]\s*"?)[^"'\s,&})]+/gi,
    "$1[redacted]",
  ],
  [/\bBearer\s+\S+/gi, "Bearer [redacted]"],
  // Dropbox short-lived access tokens ("sl.u.…") and our own AES ciphertext.
  [/\bsl\.[A-Za-z0-9._~+/-]{10,}/g, "[redacted]"],
  [/\bv1:[A-Za-z0-9+/=]{16,}/g, "[redacted]"],
  // Anything else long and opaque enough to be a credential.
  [/[A-Za-z0-9_~+/-]{40,}={0,2}/g, "[redacted]"],
];

/** Strip anything token-shaped out of an error before it reaches the database. */
export function redactSecrets(text: string, max = 500): string {
  let out = text;
  for (const [re, to] of PATTERNS) out = out.replace(re, to);
  return out.length > max ? `${out.slice(0, max)}…` : out;
}

/** `/<TAIL>/<YYYY-MM-DD>-<TAIL>.zip`, under the provider folder when there is one. */
export function remotePath(folderPath: string | null, tail: string, filename: string): string {
  const safeTail = tail.replace(/[^A-Za-z0-9-]/g, "") || "aircraft";
  const folder = (folderPath ?? "").replace(/^\/+|\/+$/g, "");
  return `/${folder ? `${folder}/` : ""}${safeTail}/${filename}`;
}

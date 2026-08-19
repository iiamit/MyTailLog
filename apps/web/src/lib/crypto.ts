// ===========================================================================
// App-layer secret encryption (AES-256-GCM, Node stdlib `crypto`).
//
// Used for the only true secrets in user data: MyFlightBook OAuth
// client_secret + tokens (0022) and each user's own AI API key (0029/0055).
// RLS already isolates these per-user; this adds at-rest encryption so a DB
// backup leak, read-replica/log exposure, or a leaked SUPABASE_SECRET_KEY
// (which bypasses RLS) doesn't hand over usable credentials.
//
// Key material comes from ENCRYPTION_KEY (any length — we SHA-256 it to a
// 32-byte key). Ciphertext is stored as "v1:base64(iv|tag|ciphertext)".
// decrypt() passes through anything without the "v1:" prefix unchanged, so
// pre-encryption plaintext rows keep working until they're next written.
// ===========================================================================

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "v1:";
const IV_LEN = 12;
const TAG_LEN = 16; // pin GCM auth tag to 16 bytes — reject truncated tags (forgery hardening)

let warnedWeakKey = false;
let warnedPlaintext = false;

function key(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "ENCRYPTION_KEY is not set — required to store MyFlightBook/Anthropic secrets encrypted.",
    );
  }
  // A short, human-chosen passphrase is cheaply brute-forceable if ciphertext
  // leaks (single unsalted SHA-256, no work factor). Warn once rather than throw
  // — a hard failure here would break decryption of existing secrets, and
  // rotating ENCRYPTION_KEY makes stored ciphertext undecryptable. Use
  // `openssl rand -base64 32` (44 chars).
  if (secret.length < 32 && !warnedWeakKey) {
    warnedWeakKey = true;
    console.warn(
      "[crypto] ENCRYPTION_KEY is under 32 chars — low entropy is brute-forceable if ciphertext leaks. Rotate to `openssl rand -base64 32` when convenient.",
    );
  }
  return createHash("sha256").update(secret).digest();
}

/** Encrypt a UTF-8 string. Returns "v1:base64(iv|tag|ciphertext)". */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv, { authTagLength: TAG_LEN });
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString("base64");
}

/**
 * True if a stored secret predates at-rest encryption — no "v1:" prefix, so
 * decryptSecret would pass it through in the clear. Callers use this to
 * re-encrypt legacy rows in place (L9 sweep); see getValidAccessToken.
 */
export function isLegacyPlaintext(stored: string | null): boolean {
  return stored != null && stored.length > 0 && !stored.startsWith(PREFIX);
}

/**
 * Decrypt a value produced by encryptSecret. A value WITHOUT the "v1:" prefix
 * is assumed to be legacy plaintext and returned as-is (migration tolerance) —
 * logged once so any straggler is visible while the sweep re-encrypts it.
 */
export function decryptSecret(stored: string | null): string | null {
  if (stored == null) return null;
  if (!stored.startsWith(PREFIX)) {
    if (!warnedPlaintext) {
      warnedPlaintext = true;
      console.warn("[crypto] read a legacy plaintext secret — should be re-encrypted on next write.");
    }
    return stored;
  }
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
  // Reject anything too short to hold iv|tag|ct — otherwise a crafted value could
  // hand setAuthTag a truncated (weaker) GCM tag.
  if (raw.length < IV_LEN + TAG_LEN) throw new Error("ciphertext too short");
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = raw.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv, { authTagLength: TAG_LEN });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

// Runnable self-check: `ENCRYPTION_KEY=test node --import tsx src/lib/crypto.ts`
// (or via the check script). Verifies round-trip, tamper detection, and the
// legacy-plaintext passthrough.
if (process.argv[1] && process.argv[1].endsWith("crypto.ts")) {
  const secret = "sk-ant-abc123-SENSITIVE";
  const enc = encryptSecret(secret);
  if (!enc.startsWith(PREFIX)) throw new Error("missing prefix");
  if (enc.includes(secret)) throw new Error("plaintext leaked into ciphertext");
  if (decryptSecret(enc) !== secret) throw new Error("round-trip failed");
  if (decryptSecret("legacy-plaintext") !== "legacy-plaintext")
    throw new Error("passthrough failed");
  if (decryptSecret(null) !== null) throw new Error("null failed");
  let tampered = false;
  try {
    const bad = PREFIX + Buffer.from(enc.slice(PREFIX.length), "base64").fill(0, 28).toString("base64");
    decryptSecret(bad);
  } catch {
    tampered = true;
  }
  if (!tampered) throw new Error("tamper not detected");
  console.log("crypto self-check OK");
}

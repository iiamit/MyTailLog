import type { BackupProvider, BackupTokens } from "./index";
import { chunkStream, type ArchiveSource } from "./chunk";
import { stubDropboxProvider } from "./dropboxStub";

// ===========================================================================
// Dropbox adapter — the ONE place Dropbox HTTP and response parsing lives, the
// same shape lib/myflightbook.ts has for MFB.
//
// Two choices carry the whole design (plan §3):
//   token_access_type=offline → a refresh token that NEVER expires, which is
//     what makes an unattended once-a-month job viable at all.
//   App folder access type    → we can only ever see files we created. The app
//     is registered with "App folder" access in the Dropbox console, so the
//     paths below are relative to /Apps/MyTailLog, not the user's root. Choosing
//     a scope that makes reading their Drive impossible beats promising not to.
//
// The archive arrives as a Node Readable from buildServerArchive and is never
// buffered whole: one chunk is resident at a time.
// ===========================================================================

const AUTHORIZE_URL = "https://www.dropbox.com/oauth2/authorize";
const TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
const CONTENT_URL = "https://content.dropboxapi.com/2/files";

export const SCOPES = "files.content.write";

/**
 * 8 MiB per API call. Dropbox's hard cap is 150 MB per call; 8 MiB is well under
 * it, keeps peak memory trivial on a 1 GB instance, and is the size Dropbox
 * itself recommends for upload sessions.
 */
export const CHUNK_BYTES = 8 * 1024 * 1024;
/** Dropbox refuses any single upload call larger than this. */
export const MAX_CALL_BYTES = 150 * 1024 * 1024;

const TOKEN_TIMEOUT_MS = 15_000;
// A chunk upload is bytes over the wire, not a lookup — generous, but bounded so
// a hung socket can't eat the cron's whole budget.
const UPLOAD_TIMEOUT_MS = 120_000;

export function dropboxConfigured(): boolean {
  return !!(process.env.DROPBOX_CLIENT_ID && process.env.DROPBOX_CLIENT_SECRET);
}

/** One call against Dropbox's content endpoints. Swapped for the E2E stub. */
export type ContentCall = (
  endpoint: string,
  arg: unknown,
  body: Buffer,
) => Promise<Record<string, unknown>>;

/**
 * The upload state machine: start (empty) → append_v2 per chunk → finish.
 *
 * Starting with an empty body costs one extra round trip and removes the
 * lookahead bookkeeping that would otherwise decide which chunk is "last" — the
 * offset arithmetic is then identical for every chunk, which is the part that
 * must not be clever.
 *
 * `mode: add` + `autorename` so we can never overwrite something the user
 * already has: we only ever add dated files, never delete or replace (§8).
 *
 * Transport is injected so the E2E stub exercises THIS code, not a parallel
 * copy of it — a stub that reimplements the client proves nothing about the
 * client.
 */
export async function uploadVia(
  call: ContentCall,
  path: string,
  body: ArchiveSource,
  chunkSize = CHUNK_BYTES,
): Promise<{ path: string; bytes: number }> {
  if (chunkSize < 1 || chunkSize > MAX_CALL_BYTES) {
    throw new Error(`chunk size must be 1..${MAX_CALL_BYTES} bytes (got ${chunkSize})`);
  }
  const started = await call("upload_session/start", { close: false }, Buffer.alloc(0));
  const sessionId = started.session_id;
  if (typeof sessionId !== "string") throw new Error("Dropbox upload_session/start returned no session_id");

  let offset = 0;
  for await (const chunk of chunkStream(body, chunkSize)) {
    if (chunk.length === 0) continue;
    await call("upload_session/append_v2", { cursor: { session_id: sessionId, offset }, close: false }, chunk);
    offset += chunk.length;
  }

  const finished = await call(
    "upload_session/finish",
    {
      cursor: { session_id: sessionId, offset },
      commit: { path, mode: "add", autorename: true, mute: true },
    },
    Buffer.alloc(0),
  );
  return { path: typeof finished.path_lower === "string" ? finished.path_lower : path, bytes: offset };
}

/** Header-safe JSON: the Dropbox-API-Arg header must be ASCII. */
function apiArg(value: unknown): string {
  let out = "";
  for (const ch of JSON.stringify(value)) {
    const c = ch.charCodeAt(0);
    out += c > 126 ? `\\u${c.toString(16).padStart(4, "0")}` : ch;
  }
  return out;
}

async function postForm(params: Record<string, string>): Promise<BackupTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...params,
      client_id: process.env.DROPBOX_CLIENT_ID ?? "",
      client_secret: process.env.DROPBOX_CLIENT_SECRET ?? "",
    }),
    signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Dropbox token request failed (${res.status}): ${text.slice(0, 300)}`);
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Dropbox token response was not JSON");
  }
  if (typeof json.access_token !== "string" || !json.access_token) {
    throw new Error("Dropbox token response had no access_token");
  }
  const accountId = typeof json.account_id === "string" ? json.account_id : null;
  return {
    accessToken: json.access_token,
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : null,
    expiresIn: typeof json.expires_in === "number" ? json.expires_in : null,
    // No account_info.read scope, so no email. The id tail is enough to tell two
    // accounts apart in the UI without asking for a scope we don't need.
    accountLabel: accountId ? `Dropbox …${accountId.slice(-4)}` : "Dropbox",
  };
}

function httpCall(accessToken: string): ContentCall {
  return async (endpoint, arg, body) => {
    if (body.length > MAX_CALL_BYTES) {
      throw new Error(
        `Dropbox ${endpoint}: ${body.length} bytes exceeds the ${MAX_CALL_BYTES}-byte call limit`,
      );
    }
    const res = await fetch(`${CONTENT_URL}/${endpoint}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "Dropbox-API-Arg": apiArg(arg),
        "content-type": "application/octet-stream",
      },
      body: new Uint8Array(body),
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
    const text = await res.text();
    if (!res.ok) {
      // The body carries the machine-readable reason (incorrect_offset, closed,
      // malformed_path). Callers store it only after redactSecrets().
      throw new Error(`Dropbox ${endpoint} failed (${res.status}): ${text.slice(0, 300)}`);
    }
    try {
      return text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  };
}

export const realDropboxProvider: BackupProvider = {
  id: "dropbox",

  authorizeUrl(state, redirectUri) {
    const q = new URLSearchParams({
      client_id: process.env.DROPBOX_CLIENT_ID ?? "",
      response_type: "code",
      redirect_uri: redirectUri,
      state,
      // Without this we get a 4-hour access token and no refresh token, and the
      // connection is dead long before the first monthly run.
      token_access_type: "offline",
      scope: SCOPES,
    });
    return `${AUTHORIZE_URL}?${q}`;
  },

  exchangeCode(code, redirectUri) {
    return postForm({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
  },

  refresh(refreshToken) {
    return postForm({ grant_type: "refresh_token", refresh_token: refreshToken });
  },

  upload(accessToken, path, body) {
    return uploadVia(httpCall(accessToken), path, body);
  },
};

/**
 * The provider to use, or null when Dropbox isn't configured — the sweep then
 * logs one line and skips, exactly as the ADS-B sweep does without OpenSky
 * credentials. DROPBOX_CLIENT_ID/SECRET are not provisioned yet.
 */
export function dropboxProvider(): BackupProvider | null {
  // E2E only, set in playwright.config.ts's webServer.env — NEVER in prod.
  if (process.env.E2E_STUB_DROPBOX) return stubDropboxProvider();
  return dropboxConfigured() ? realDropboxProvider : null;
}

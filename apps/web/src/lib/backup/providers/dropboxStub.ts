import { randomUUID } from "node:crypto";
import type { BackupProvider, BackupTokens } from "./index";
import { MAX_CALL_BYTES, uploadVia, type ContentCall } from "./dropbox";

// ===========================================================================
// In-process Dropbox double for E2E and unit tests. Enabled ONLY by
// E2E_STUB_DROPBOX, which is set in playwright.config.ts's webServer.env and
// never in prod/apphosting.yaml — CI must never touch a real Dropbox account.
//
// It is a fake SERVER, not a fake client: the production uploader (uploadVia)
// runs unchanged against it, only the transport is swapped. A stub that
// reimplements the client would prove nothing about the client.
//
// And it REFUSES WHAT PRODUCTION REFUSES. The ADS-B work is the cautionary
// tale: its first stub returned canned data for any window, so a window the
// live API rejected with a 400 on every single call sailed through CI. A stub
// more permissive than reality is a blindfold. Everything rejected below is a
// real documented Dropbox failure:
//
//   401 expired_access_token           — unknown or expired bearer token
//   400 too_large                      — any single call body over 150 MB
//   409 lookup_failed/incorrect_offset — append/finish at the wrong offset
//   409 lookup_failed/not_found        — unknown session id
//   409 lookup_failed/closed           — session already finished (or aged out)
//   400 path/malformed_path            — path not absolute, trailing slash,
//                                        empty segment, or an illegal character
// ===========================================================================

const TOKEN_PREFIX = "sl.u.e2e-";
const SESSION_TTL_MS = 60 * 60 * 1000;
// Dropbox rejects these outright in a path.
const ILLEGAL_PATH_CHARS = /[\\:?*<>"|]/;

type Session = { offset: number; startedAt: number; finished: boolean };

const sessions = new Map<string, Session>();
/** path → committed byte count. Exposed for assertions in tests. */
export const stubUploads = new Map<string, number>();

function mintToken(ttlSeconds: number): string {
  return `${TOKEN_PREFIX}${Date.now() + ttlSeconds * 1000}-${randomUUID()}`;
}

function fail(endpoint: string, status: number, summary: string): never {
  throw new Error(
    `Dropbox ${endpoint} failed (${status}): ${JSON.stringify({
      error_summary: summary,
      error: { ".tag": summary.split("/")[0] },
    })} [E2E_STUB_DROPBOX]`,
  );
}

function checkToken(endpoint: string, token: string): void {
  const expiry = Number(
    token.startsWith(TOKEN_PREFIX) ? token.slice(TOKEN_PREFIX.length).split("-")[0] : NaN,
  );
  if (!Number.isFinite(expiry)) fail(endpoint, 401, "invalid_access_token/");
  if (expiry <= Date.now()) fail(endpoint, 401, "expired_access_token/");
}

/** The same rules Dropbox applies to a commit path. */
function checkPath(endpoint: string, path: unknown): void {
  const p = typeof path === "string" ? path : "";
  const malformed =
    !p.startsWith("/") ||
    p.endsWith("/") ||
    p.includes("//") ||
    ILLEGAL_PATH_CHARS.test(p) ||
    [...p].some((c) => c.charCodeAt(0) < 32);
  if (malformed) fail(endpoint, 400, "path/malformed_path");
}

function sessionFor(endpoint: string, arg: unknown): Session {
  const cursor = (arg as { cursor?: { session_id?: unknown; offset?: unknown } }).cursor;
  const id = typeof cursor?.session_id === "string" ? cursor.session_id : "";
  const offset = typeof cursor?.offset === "number" ? cursor.offset : -1;
  const session = sessions.get(id);
  if (!session) fail(endpoint, 409, "lookup_failed/not_found");
  if (session.finished || Date.now() - session.startedAt > SESSION_TTL_MS) {
    fail(endpoint, 409, "lookup_failed/closed");
  }
  if (offset !== session.offset) {
    throw new Error(
      `Dropbox ${endpoint} failed (409): ${JSON.stringify({
        error_summary: "lookup_failed/incorrect_offset/",
        error: { ".tag": "lookup_failed", correct_offset: session.offset },
      })} [E2E_STUB_DROPBOX]`,
    );
  }
  return session;
}

/** The transport the stub provider hands to the real uploader. */
export function stubContentCall(accessToken: string): ContentCall {
  return async (endpoint, arg, body) => {
    checkToken(endpoint, accessToken);
    if (body.length > MAX_CALL_BYTES) fail(endpoint, 400, "too_large/");

    if (endpoint === "upload_session/start") {
      const id = randomUUID();
      sessions.set(id, { offset: body.length, startedAt: Date.now(), finished: false });
      return { session_id: id };
    }

    if (endpoint === "upload_session/append_v2") {
      sessionFor(endpoint, arg).offset += body.length;
      return {};
    }

    if (endpoint === "upload_session/finish") {
      const session = sessionFor(endpoint, arg);
      const commit = (arg as { commit?: { path?: unknown } }).commit;
      checkPath(endpoint, commit?.path);
      session.offset += body.length;
      session.finished = true;
      const path = String(commit?.path);
      stubUploads.set(path, session.offset);
      return { path_lower: path.toLowerCase(), size: session.offset };
    }

    fail(endpoint, 400, "unknown_endpoint/");
  };
}

function tokens(withRefresh: boolean): BackupTokens {
  return {
    accessToken: mintToken(4 * 60 * 60),
    refreshToken: withRefresh ? `${TOKEN_PREFIX}refresh` : null,
    expiresIn: 4 * 60 * 60,
    accountLabel: "Dropbox …e2e0",
  };
}

export function stubDropboxProvider(): BackupProvider {
  return {
    id: "dropbox",
    // Bounce straight back to our own callback so the E2E flow completes without
    // a real consent screen. The state is passed through untouched, so the
    // callback's CSRF check is exercised for real.
    authorizeUrl: (state, redirectUri) =>
      `${redirectUri}?code=e2e-stub-code&state=${encodeURIComponent(state)}`,
    exchangeCode: async (code) => {
      if (code !== "e2e-stub-code") throw new Error("Dropbox token request failed (400): invalid_grant");
      return tokens(true);
    },
    refresh: async (refreshToken) => {
      if (!refreshToken.startsWith(TOKEN_PREFIX)) {
        throw new Error("Dropbox token request failed (400): invalid_grant");
      }
      return tokens(false);
    },
    upload: (accessToken, path, body) => uploadVia(stubContentCall(accessToken), path, body),
  };
}

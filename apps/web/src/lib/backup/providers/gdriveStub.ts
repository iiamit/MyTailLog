import { randomUUID } from "node:crypto";
import type { BackupProvider, BackupTokens } from "./index";
// gdrive.ts imports this module for the E2E switch, so nothing here may touch a
// gdrive binding at module load — only inside function bodies (same rule
// dropboxStub follows).
import { CHUNK_MULTIPLE, uploadVia, type Fetcher } from "./gdrive";

// ===========================================================================
// In-process Google Drive double for E2E and unit tests. Enabled ONLY by
// E2E_STUB_GDRIVE, set in playwright.config.ts's webServer.env and never in
// prod/apphosting.yaml — CI must never touch a real Google account.
//
// It is a fake SERVER, not a fake client: it implements `Fetcher`, so the
// production uploader (gdrive.ts uploadVia → putChunk) runs against it
// unchanged. The offset arithmetic under test is the arithmetic that will talk
// to real Google.
//
// And it REFUSES WHAT GOOGLE REFUSES. The ADS-B episode is the cautionary tale:
// its first stub returned canned data for any window, so a request the live API
// rejected on every single call sailed through CI. A stub more permissive than
// production is a blindfold. Every rejection below is a real documented Drive
// failure:
//
//   401 authError            — unknown or expired bearer token
//   404 notFound             — unknown/expired upload session, or a dead parent
//   400 badRequest           — missing/malformed Content-Range, no uploadType,
//                              metadata without a name or parents
//   400 invalidChunkSize     — a NON-FINAL chunk that isn't a 256 KB multiple
//   400 invalidRange         — a final chunk whose declared total contradicts
//                              the bytes actually received
//   308 + Range              — a Content-Range that doesn't start at the
//                              session's offset. The header carries the TRUE
//                              offset; a client that trusts its own instead
//                              corrupts the file, so we always send it.
// ===========================================================================

// The stub mints tokens with Google's real prefix ON PURPOSE: a stub whose
// tokens don't look like the real thing wouldn't exercise redactSecrets()'s
// ya29.… pattern, which is the thing standing between a provider 401 body and
// the browser-readable backup_run.error. Not a credential — the literal string
// below is the whole value, and it is only ever reachable under E2E_STUB_GDRIVE.
// nosemgrep: generic.secrets.security.detected-google-oauth-access-token.detected-google-oauth-access-token
const TOKEN_PREFIX = "ya29.e2e-";
const SESSION_TTL_MS = 60 * 60 * 1000;
const SESSION_BASE = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=";

type Node = { id: string; name: string; parent: string | null; folder: boolean; bytes: number };
type Session = { id: string; name: string; parent: string; offset: number; startedAt: number; done: boolean };

const nodes = new Map<string, Node>();
const sessions = new Map<string, Session>();

/** Full path (`/MyTailLog/N1/2026-08-01-N1.zip`) → committed bytes. For assertions. */
export const stubDriveUploads = new Map<string, number>();

/**
 * Test-only knob, and a faithful one: Google answers 308 with the range it
 * actually holds when a chunk arrives only partly (a dropped connection
 * mid-body). Set this to N and the next PUT keeps only N bytes and reports the
 * truth, which is exactly the resume path putChunk has to honour.
 */
export const stubDriveControl = { truncateNextChunkTo: null as number | null };

export function resetStubDrive(): void {
  nodes.clear();
  sessions.clear();
  stubDriveUploads.clear();
  stubDriveControl.truncateNextChunkTo = null;
}

function mintToken(ttlSeconds: number): string {
  return `${TOKEN_PREFIX}${Date.now() + ttlSeconds * 1000}-${randomUUID()}`;
}

function pathOf(id: string | null): string {
  const parts: string[] = [];
  let cur = id;
  while (cur) {
    const n = nodes.get(cur);
    if (!n) break;
    parts.unshift(n.name);
    cur = n.parent;
  }
  return `/${parts.join("/")}`;
}

function err(status: number, reason: string, message: string, headers: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify({ error: { code: status, message: `${message} [E2E_STUB_GDRIVE]`, errors: [{ reason }] } }),
    { status, headers: { "content-type": "application/json", ...headers } },
  );
}

function ok(body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });
}

function tokenValid(init: RequestInit): boolean {
  const auth = new Headers(init.headers).get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token.startsWith(TOKEN_PREFIX)) return false;
  const expiry = Number(token.slice(TOKEN_PREFIX.length).split("-")[0]);
  return Number.isFinite(expiry) && expiry > Date.now();
}

/** `bytes 0-9/*`, `bytes 0-9/10`, `bytes * /10`. Null when it isn't one of those. */
function parseContentRange(value: string | null): { start: number; end: number | null; total: number | null } | null {
  if (!value) return null;
  const done = /^bytes \*\/(\d+)$/.exec(value);
  if (done) return { start: -1, end: null, total: Number(done[1]) };
  const m = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(value);
  if (!m) return null;
  return { start: Number(m[1]), end: Number(m[2]), total: m[3] === "*" ? null : Number(m[3]) };
}

/** Google omits Range entirely at offset 0; it is `bytes=0-<last>` after that. */
function rangeHeader(offset: number): Record<string, string> {
  return offset > 0 ? { range: `bytes=0-${offset - 1}` } : {};
}

// --- The metadata API ------------------------------------------------------

function listFiles(url: URL): Response {
  const query = url.searchParams.get("q") ?? "";
  const name = /name='((?:[^'\\]|\\.)*)'/.exec(query)?.[1]?.replace(/\\(.)/g, "$1");
  const parent = /'([^']+)' in parents/.exec(query)?.[1];
  const wantFolder = query.includes("application/vnd.google-apps.folder");
  const hit = [...nodes.values()].find(
    (n) => n.name === name && n.folder === wantFolder && (parent ? n.parent === parent : true),
  );
  return ok({ files: hit ? [{ id: hit.id }] : [] });
}

async function createFile(init: RequestInit): Promise<Response> {
  const meta = JSON.parse(String(init.body ?? "{}")) as { name?: string; parents?: string[]; mimeType?: string };
  if (!meta.name) return err(400, "badRequest", "a file needs a name");
  const parent = meta.parents?.[0] ?? null;
  if (parent && !nodes.has(parent)) return err(404, "notFound", `parent ${parent} does not exist`);
  const id = randomUUID();
  nodes.set(id, {
    id,
    name: meta.name,
    parent,
    folder: meta.mimeType === "application/vnd.google-apps.folder",
    bytes: 0,
  });
  return ok({ id });
}

// --- Resumable upload ------------------------------------------------------

async function startSession(url: URL, init: RequestInit): Promise<Response> {
  if (url.searchParams.get("uploadType") !== "resumable") {
    return err(400, "badRequest", "uploadType must be resumable for this endpoint");
  }
  const meta = JSON.parse(String(init.body ?? "{}")) as { name?: string; parents?: string[] };
  if (!meta.name) return err(400, "badRequest", "a resumable upload needs a name");
  const parent = meta.parents?.[0];
  // drive.file: we can only write into folders our app made. An unknown parent
  // is a 404, not a silent write into My Drive's root.
  if (!parent) return err(400, "badRequest", "a resumable upload needs a parent folder");
  if (!nodes.has(parent)) return err(404, "notFound", `parent ${parent} does not exist`);

  const id = randomUUID();
  sessions.set(id, { id, name: meta.name, parent, offset: 0, startedAt: Date.now(), done: false });
  return new Response(null, { status: 200, headers: { location: `${SESSION_BASE}${id}` } });
}

async function putBytes(url: URL, init: RequestInit): Promise<Response> {
  const session = sessions.get(url.searchParams.get("upload_id") ?? "");
  if (!session || session.done || Date.now() - session.startedAt > SESSION_TTL_MS) {
    // Google expires a resumable session and answers 404 — the client must
    // start a new one, never assume its offset still means anything.
    return err(404, "notFound", "upload session not found or expired");
  }

  const cr = parseContentRange(new Headers(init.headers).get("content-range"));
  if (!cr) return err(400, "badRequest", "malformed or missing Content-Range");

  const body = init.body instanceof Uint8Array ? init.body : new Uint8Array(0);
  const start = cr.start === -1 ? session.offset : cr.start;

  // The offset the client believes is not the offset we hold → 308 with the
  // truth. THIS is the response a client must honour rather than its own guess.
  if (start !== session.offset) {
    return err(308, "resumeIncomplete", `expected offset ${session.offset}`, rangeHeader(session.offset));
  }
  if (cr.end !== null && cr.end - cr.start + 1 !== body.length) {
    return err(400, "invalidRange", `Content-Range covers ${cr.end - cr.start + 1} bytes but ${body.length} arrived`);
  }

  const final = cr.total !== null;

  // The rule that makes Google different from every other provider here, stated
  // the way it actually behaves: the TOTAL uploaded must sit on a 256 KB
  // boundary after every non-final request. Checking each request's own length
  // instead would be wrong in exactly one place — resuming after a partial
  // write, where the tail that completes the boundary is not itself a multiple.
  if (!final && (session.offset + body.length) % CHUNK_MULTIPLE !== 0) {
    return err(
      400,
      "invalidChunkSize",
      `a non-final request must leave the total on a ${CHUNK_MULTIPLE}-byte boundary ` +
        `(would be ${session.offset + body.length})`,
    );
  }

  // A dropped connection mid-body: keep part of it and report what we hold.
  const truncate = stubDriveControl.truncateNextChunkTo;
  if (truncate !== null && truncate < body.length) {
    stubDriveControl.truncateNextChunkTo = null;
    session.offset += truncate;
    return err(308, "resumeIncomplete", `partial write`, rangeHeader(session.offset));
  }

  session.offset += body.length;

  if (!final) {
    return err(308, "resumeIncomplete", "continue", rangeHeader(session.offset));
  }
  if (cr.total !== session.offset) {
    return err(400, "invalidRange", `declared total ${cr.total} but ${session.offset} bytes were received`);
  }

  session.done = true;
  const id = randomUUID();
  nodes.set(id, { id, name: session.name, parent: session.parent, folder: false, bytes: session.offset });
  stubDriveUploads.set(pathOf(id), session.offset);
  return ok({ id, name: session.name, size: String(session.offset) });
}

// --- The Fetcher the stub provider hands to the real uploader ---------------

export const stubDriveFetch: Fetcher = async (rawUrl, init) => {
  if (!tokenValid(init)) return err(401, "authError", "Invalid Credentials");

  const url = new URL(rawUrl);
  const method = (init.method ?? "GET").toUpperCase();
  const path = url.pathname;

  if (path === "/upload/drive/v3/files") {
    if (method === "POST") return startSession(url, init);
    if (method === "PUT") return putBytes(url, init);
  }
  if (path === "/drive/v3/files") {
    if (method === "GET") return listFiles(url);
    if (method === "POST") return createFile(init);
  }
  if (path.startsWith("/drive/v3/files/")) {
    const node = nodes.get(decodeURIComponent(path.slice("/drive/v3/files/".length)));
    return node ? ok({ id: node.id, trashed: false }) : err(404, "notFound", "File not found");
  }
  if (path === "/drive/v3/about") return ok({ user: { emailAddress: "e2e@example.com" } });

  return err(404, "notFound", `no such endpoint: ${method} ${path}`);
};

function tokens(withRefresh: boolean): BackupTokens {
  return {
    accessToken: mintToken(3600),
    // Google issues a refresh token only on the first consent; a plain refresh
    // never reissues one. The stub is the same, so the "keep the stored one"
    // path is actually exercised.
    refreshToken: withRefresh ? `1//e2e-${randomUUID()}` : null,
    expiresIn: 3600,
    accountLabel: `Google Drive — e2e@example.com`,
  };
}

export function stubGdriveProvider(): BackupProvider {
  return {
    id: "gdrive",
    // Bounce straight back to our own callback so the E2E flow completes with no
    // real consent screen. The state is passed through untouched, so the
    // callback's CSRF check is exercised for real.
    authorizeUrl: (state, redirectUri) =>
      `${redirectUri}?code=e2e-stub-code&state=${encodeURIComponent(state)}`,
    exchangeCode: async (code) => {
      if (code !== "e2e-stub-code") throw new Error("Google token request failed (400): invalid_grant");
      return tokens(true);
    },
    refresh: async (refreshToken) => {
      if (!refreshToken.startsWith("1//")) throw new Error("Google token request failed (400): invalid_grant");
      return tokens(false);
    },
    upload: (accessToken, path, body, state) =>
      // The E2E archive is a few hundred KB, so the production 8 MiB chunk would
      // make every upload single-chunk and never exercise the loop. One 256 KB
      // multiple is the smallest size Google would accept, so it is the most
      // honest small size to test with.
      uploadVia(stubDriveFetch, accessToken, path, body, CHUNK_MULTIPLE, state),
  };
}

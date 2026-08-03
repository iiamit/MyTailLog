import type { BackupProvider, BackupTokens } from "./index";
import { chunkStream, withLast, type ArchiveSource } from "./chunk";
import { stubGdriveProvider } from "./gdriveStub";

// ===========================================================================
// Google Drive adapter — phase 2 (docs/plan-cloud-backups.md §3).
//
// Four things carry the design, and each of them is a way this quietly breaks:
//
// 1. SCOPE: drive.file AND NOTHING ELSE. It is a NON-SENSITIVE scope, so the
//    app needs no CASA security assessment — and it only grants access to files
//    OUR APP CREATED. We cannot read the user's existing Drive even if we
//    wanted to, which beats promising not to (§7). `drive`, `drive.readonly`
//    and friends are sensitive/restricted and would drag in an assessment;
//    do not add one.
//
// 2. access_type=offline AND prompt=consent. Google returns a refresh_token
//    only on the FIRST consent for a given user+client. Without prompt=consent
//    a reconnect silently yields none, and the next monthly run finds an
//    expired access token and no way to renew it. (upsert_backup_destination
//    coalesces to keep the stored one — that's the net, this is the fix.)
//
// 3. PUBLISHING STATUS. An app in "Testing" issues refresh tokens that EXPIRE
//    AFTER 7 DAYS. For a job that runs once a month that is not a degradation,
//    it is a guarantee of failure — and a silent one. Publishing the OAuth app
//    to Production is a functional prerequisite, not paperwork. See
//    apphosting.yaml next to GOOGLE_DRIVE_CLIENT_ID. Dropbox is NOT like this;
//    its development status is fine indefinitely.
//
// 4. CHUNK ALIGNMENT. A resumable upload must sit on a 256 KB boundary after
//    every request except the last — on the CUMULATIVE total, not on each
//    request's own length, which is what makes resuming after a partial write
//    legal at all. And a 308 carries a `Range` header with the server's REAL
//    offset: trusting our own instead is how a resumable upload corrupts a file.
// ===========================================================================

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_URL = "https://www.googleapis.com/drive/v3";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable";

/** Non-sensitive, per-file. See note 1 above before touching this. */
export const SCOPES = "https://www.googleapis.com/auth/drive.file";

/** Google's hard rule: every chunk but the last is a multiple of this. */
export const CHUNK_MULTIPLE = 256 * 1024;
/** 8 MiB = 32 × 256 KB. Small enough that peak memory stays trivial on a 1 GB instance. */
export const CHUNK_BYTES = 32 * CHUNK_MULTIPLE;

const FOLDER_MIME = "application/vnd.google-apps.folder";
/** Top-level folder we create in the user's Drive; everything nests under it. */
export const ROOT_FOLDER = "MyTailLog";

const TOKEN_TIMEOUT_MS = 15_000;
const API_TIMEOUT_MS = 15_000;
const UPLOAD_TIMEOUT_MS = 120_000;
/** A 308 can legitimately disagree with us once; a loop of them is a bug. */
const MAX_RANGE_RETRIES = 3;

export function gdriveConfigured(): boolean {
  return !!(process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET);
}

/**
 * The transport. Injected so the E2E stub swaps the SERVER, not the client —
 * everything below (offset arithmetic, alignment, 308 handling) is the code
 * that will talk to real Google.
 */
export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

function realFetch(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, init);
}

// --- Small helpers ---------------------------------------------------------

/** Drive query strings are single-quoted; escape what would break out of one. */
function q(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function driveJson(
  f: Fetcher,
  token: string,
  url: string,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  const res = await f(url, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) {
    // Carries the machine-readable reason (invalidChunkSize, notFound,
    // authError). Stored only after redactSecrets().
    throw new Error(`Google Drive ${url.split("?")[0]} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// --- Folders ---------------------------------------------------------------
//
// drive.file lets us create folders and see the ones we created — which is
// exactly enough, and no more. Nothing here can enumerate the user's Drive.

async function findFolder(
  f: Fetcher,
  token: string,
  name: string,
  parentId: string | null,
): Promise<string | null> {
  const clauses = [`name='${q(name)}'`, `mimeType='${FOLDER_MIME}'`, "trashed=false"];
  if (parentId) clauses.push(`'${q(parentId)}' in parents`);
  const url = `${API_URL}/files?q=${encodeURIComponent(clauses.join(" and "))}&fields=files(id)&pageSize=1`;
  const json = await driveJson(f, token, url);
  const files = Array.isArray(json.files) ? json.files : [];
  const id = (files[0] as { id?: unknown } | undefined)?.id;
  return typeof id === "string" ? id : null;
}

async function createFolder(
  f: Fetcher,
  token: string,
  name: string,
  parentId: string | null,
): Promise<string> {
  const json = await driveJson(f, token, `${API_URL}/files?fields=id`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME,
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  if (typeof json.id !== "string") throw new Error(`Google Drive returned no id creating folder ${name}`);
  return json.id;
}

async function folderExists(f: Fetcher, token: string, id: string): Promise<boolean> {
  try {
    const json = await driveJson(f, token, `${API_URL}/files/${encodeURIComponent(id)}?fields=id,trashed`);
    return json.trashed !== true;
  } catch {
    // 404 (deleted) or 403 (no longer ours) — either way, re-resolve.
    return false;
  }
}

/** Find or create `name` under `parentId`, reusing `cachedId` when it's still there. */
async function ensureFolder(
  f: Fetcher,
  token: string,
  name: string,
  parentId: string | null,
  cachedId?: string | null,
): Promise<string> {
  if (cachedId && (await folderExists(f, token, cachedId))) return cachedId;
  return (await findFolder(f, token, name, parentId)) ?? createFolder(f, token, name, parentId);
}

// --- Resumable upload ------------------------------------------------------

/** `Range: bytes=0-262143` ⇒ the server holds 262144 bytes. Absent ⇒ zero. */
export function nextOffsetFromRange(range: string | null): number {
  const m = /bytes=0-(\d+)/.exec(range ?? "");
  return m ? Number(m[1]) + 1 : 0;
}

// `bytes <start>-<end>/<total|*>`, or `bytes */<total>` to finalise with no bytes
// (a stream whose length turned out to be an exact multiple of the chunk size).
function contentRange(start: number, length: number, total: number | null): string {
  if (length === 0) return `bytes */${total ?? 0}`;
  return `bytes ${start}-${start + length - 1}/${total ?? "*"}`;
}

/**
 * PUT one chunk, honouring whatever offset the server reports.
 *
 * A 308 means "continue" and its `Range` header is the truth — our own idea of
 * the offset is a guess that a retried or partially-received request can
 * invalidate. We still hold the whole chunk in memory, so a server that landed
 * mid-chunk is resumable by re-sending the tail of it; a server that is behind
 * the start of what we hold is not (those bytes are gone from the stream), and
 * that is a hard failure rather than a silently truncated archive.
 */
async function putChunk(
  f: Fetcher,
  token: string,
  sessionUri: string,
  chunk: Buffer,
  chunkStart: number,
  total: number | null,
): Promise<{ done: boolean; offset: number; file: Record<string, unknown> | null }> {
  const end = chunkStart + chunk.length;
  let from = chunkStart;

  for (let attempt = 0; attempt < MAX_RANGE_RETRIES; attempt++) {
    if (from < chunkStart) {
      throw new Error(
        `Google Drive resume offset ${from} is behind the buffered chunk (${chunkStart}) — the archive stream cannot rewind`,
      );
    }
    if (from > end) {
      throw new Error(`Google Drive reports offset ${from}, past the ${end} bytes we have sent`);
    }

    const slice = chunk.subarray(from - chunkStart);
    const res = await f(sessionUri, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${token}`,
        "content-range": contentRange(from, slice.length, total),
      },
      body: new Uint8Array(slice),
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });

    if (res.status === 200 || res.status === 201) {
      const text = await res.text();
      let file: Record<string, unknown> = {};
      try {
        file = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        /* the bytes landed; a body we can't parse doesn't change that */
      }
      return { done: true, offset: end, file };
    }

    if (res.status === 308) {
      await res.text();
      const server = nextOffsetFromRange(res.headers.get("range"));
      if (server === end) return { done: false, offset: end, file: null };
      from = server; // the server's number wins — retry from there
      continue;
    }

    const text = await res.text();
    throw new Error(`Google Drive upload failed (${res.status}): ${text.slice(0, 300)}`);
  }

  throw new Error(`Google Drive kept reporting a different offset after ${MAX_RANGE_RETRIES} attempts`);
}

/**
 * Stream `body` to `<ROOT_FOLDER>/<...path>` and return the bytes written plus
 * the root folder id to cache (`state`, persisted in backup_destination.folder_path).
 *
 * The size is not known up front — we're streaming a ZIP that is still being
 * built — so `withLast` gives the one-chunk lookahead the protocol needs:
 * intermediate chunks declare `/*` and must be 256 KB multiples, and only the
 * final one declares the total.
 */
export async function uploadVia(
  f: Fetcher,
  token: string,
  path: string,
  body: ArchiveSource,
  chunkSize = CHUNK_BYTES,
  cachedRootId?: string | null,
): Promise<{ path: string; bytes: number; state: string }> {
  if (chunkSize < CHUNK_MULTIPLE || chunkSize % CHUNK_MULTIPLE !== 0) {
    throw new Error(`Google Drive chunk size must be a multiple of ${CHUNK_MULTIPLE} (got ${chunkSize})`);
  }

  const segments = path.split("/").filter(Boolean);
  const filename = segments.pop();
  if (!filename) throw new Error(`Google Drive upload needs a filename (got ${JSON.stringify(path)})`);

  const rootId = await ensureFolder(f, token, ROOT_FOLDER, null, cachedRootId);
  let parent = rootId;
  for (const segment of segments) parent = await ensureFolder(f, token, segment, parent);

  // Start the session: metadata now, bytes after. The session URI comes back in
  // the Location header, not the body.
  const init = await f(UPLOAD_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ name: filename, parents: [parent] }),
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  const initBody = await init.text();
  if (!init.ok) {
    throw new Error(`Google Drive resumable start failed (${init.status}): ${initBody.slice(0, 300)}`);
  }
  const sessionUri = init.headers.get("location");
  if (!sessionUri) throw new Error("Google Drive resumable start returned no Location header");

  let offset = 0;
  let file: Record<string, unknown> | null = null;
  for await (const { value: chunk, last } of withLast(chunkStream(body, chunkSize))) {
    // The alignment rule is on the CUMULATIVE total, not on this request's
    // length: a resumed tail after a partial write is not itself a 256 KB
    // multiple but still lands the total on the boundary. chunkStream already
    // guarantees this; the check is here because the failure it prevents is a
    // 400 at 3am, a third of the way through a 600 MB upload.
    if (!last && (offset + chunk.length) % CHUNK_MULTIPLE !== 0) {
      throw new Error(
        `Google Drive: a non-final chunk must leave the total on a ${CHUNK_MULTIPLE}-byte boundary (would be ${offset + chunk.length})`,
      );
    }
    if (last && offset + chunk.length === 0) throw new Error("Refusing to upload an empty archive");

    const res = await putChunk(f, token, sessionUri, chunk, offset, last ? offset + chunk.length : null);
    offset = res.offset;
    if (res.done) file = res.file;
  }

  if (!file) throw new Error("Google Drive never acknowledged the final chunk");
  const name = typeof file.name === "string" ? file.name : filename;
  return { path: `/${ROOT_FOLDER}/${[...segments, name].join("/")}`, bytes: offset, state: rootId };
}

// --- OAuth -----------------------------------------------------------------

async function postForm(params: Record<string, string>): Promise<BackupTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...params,
      client_id: process.env.GOOGLE_DRIVE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? "",
    }),
    signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Google token request failed (${res.status}): ${text.slice(0, 300)}`);
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Google token response was not JSON");
  }
  if (typeof json.access_token !== "string" || !json.access_token) {
    throw new Error("Google token response had no access_token");
  }
  return {
    accessToken: json.access_token,
    // A refresh only reissues the access token; a re-consent may or may not
    // reissue the refresh token. Null ⇒ keep the stored one (0049's coalesce).
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : null,
    expiresIn: typeof json.expires_in === "number" ? json.expires_in : null,
    accountLabel: null,
  };
}

/**
 * "Google Drive — you@example.com", or just "Google Drive".
 *
 * drive.file ALREADY authorises about.get — this asks for no additional scope
 * (see the scope note at the top; adding `userinfo.email` or `openid` would).
 * Best-effort by design: a label is not worth failing a connection over, and
 * knowing WHICH Google account is receiving a complete copy of your records is
 * worth one GET.
 */
async function accountLabel(f: Fetcher, token: string): Promise<string> {
  try {
    const json = await driveJson(f, token, `${API_URL}/about?fields=user(emailAddress)`);
    const email = (json.user as { emailAddress?: unknown } | undefined)?.emailAddress;
    return typeof email === "string" && email ? `Google Drive — ${email}` : "Google Drive";
  } catch {
    return "Google Drive";
  }
}

export const realGdriveProvider: BackupProvider = {
  id: "gdrive",

  authorizeUrl(state, redirectUri) {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_DRIVE_CLIENT_ID ?? "",
      response_type: "code",
      redirect_uri: redirectUri,
      state,
      scope: SCOPES,
      // Both are required, for different reasons — see notes 2 and 3 up top.
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "false",
    });
    return `${AUTHORIZE_URL}?${params}`;
  },

  async exchangeCode(code, redirectUri) {
    const tokens = await postForm({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
    if (!tokens.refreshToken) {
      // Almost certainly prompt=consent not reaching Google, or a stale grant.
      // Loud, because the connection would otherwise die at the first refresh.
      console.warn("[backup] Google returned no refresh_token — the connection will not survive an expiry");
    }
    return { ...tokens, accountLabel: await accountLabel(realFetch, tokens.accessToken) };
  },

  refresh(refreshToken) {
    return postForm({ grant_type: "refresh_token", refresh_token: refreshToken });
  },

  upload(accessToken, path, body, state) {
    return uploadVia(realFetch, accessToken, path, body, CHUNK_BYTES, state);
  },
};

/**
 * The adapter, or null when GOOGLE_DRIVE_CLIENT_ID/SECRET aren't provisioned —
 * the sweep then logs one line and skips this destination, and the Profile card
 * says it isn't configured instead of offering a button that can't work.
 */
export function gdriveProvider(): BackupProvider | null {
  // E2E only, set in playwright.config.ts's webServer.env — NEVER in prod.
  if (process.env.E2E_STUB_GDRIVE) return stubGdriveProvider();
  return gdriveConfigured() ? realGdriveProvider : null;
}

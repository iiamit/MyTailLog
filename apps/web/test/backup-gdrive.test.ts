import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { withLast } from "../src/lib/backup/providers/chunk";
import {
  CHUNK_BYTES,
  CHUNK_MULTIPLE,
  ROOT_FOLDER,
  SCOPES,
  nextOffsetFromRange,
  realGdriveProvider,
  uploadVia,
} from "../src/lib/backup/providers/gdrive";
import {
  resetStubDrive,
  stubDriveControl,
  stubDriveFetch,
  stubDriveUploads,
  stubGdriveProvider,
} from "../src/lib/backup/providers/gdriveStub";

// Everything below runs the PRODUCTION uploader (uploadVia → putChunk) against
// the stub SERVER. The offset arithmetic under test is the arithmetic that will
// talk to real Google.

beforeEach(() => resetStubDrive());

const token = async () => (await stubGdriveProvider().exchangeCode("e2e-stub-code", "/cb")).accessToken;
const K = CHUNK_MULTIPLE;

// --- Scope and consent, the two things that kill this silently --------------

test("we ask for drive.file and nothing else", () => {
  // Anything sensitive (drive, drive.readonly) drags in a CASA security
  // assessment; drive.file is non-sensitive AND cannot see files we didn't make.
  assert.equal(SCOPES, "https://www.googleapis.com/auth/drive.file");
});

test("the authorize URL forces offline access AND a fresh consent", () => {
  process.env.GOOGLE_DRIVE_CLIENT_ID = "test-client";
  const url = new URL(realGdriveProvider.authorizeUrl("st4te", "https://x.test/api/backup/gdrive/callback"));
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("scope"), SCOPES);
  // Without offline there is no refresh token at all; without prompt=consent a
  // RECONNECT silently returns none and the next monthly run has no way back in.
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("prompt"), "consent");
  assert.equal(url.searchParams.get("state"), "st4te");
  assert.equal(url.searchParams.get("redirect_uri"), "https://x.test/api/backup/gdrive/callback");
  delete process.env.GOOGLE_DRIVE_CLIENT_ID;
});

test("a refresh does not reissue a refresh token — the stored one must survive", async () => {
  const p = stubGdriveProvider();
  const first = await p.exchangeCode("e2e-stub-code", "/cb");
  assert.ok(first.refreshToken?.startsWith("1//"), "first consent must yield a refresh token");
  const again = await p.refresh(first.refreshToken!);
  assert.equal(again.refreshToken, null, "null ⇒ keep the stored one (0049's coalesce)");
  assert.ok(again.accessToken);
});

// --- Chunk alignment maths --------------------------------------------------

test("the production chunk size is a 256 KB multiple", () => {
  assert.equal(CHUNK_BYTES % CHUNK_MULTIPLE, 0);
  assert.ok(CHUNK_BYTES >= CHUNK_MULTIPLE);
});

test("a chunk size that isn't a 256 KB multiple is refused before a byte is sent", async () => {
  for (const bad of [1, 1000, K + 1, K * 1.5]) {
    await assert.rejects(
      async () => uploadVia(stubDriveFetch, await token(), "/N1/a.zip", Readable.from(["x"]), bad),
      /multiple of 262144/,
      `chunk size ${bad} should have been refused`,
    );
  }
});

test("withLast flags the final item and nothing else", async () => {
  const seen: [number, boolean][] = [];
  for await (const { value, last } of withLast(Readable.from([1, 2, 3]))) seen.push([value, last]);
  assert.deepEqual(seen, [
    [1, false],
    [2, false],
    [3, true],
  ]);
  // Empty in, empty out — no phantom "last".
  const none: unknown[] = [];
  for await (const x of withLast(Readable.from([]))) none.push(x);
  assert.equal(none.length, 0);
});

test("every chunk but the last is a 256 KB multiple, over every awkward size", async () => {
  const t = await token();
  // Exact multiple, one byte over, one byte under, smaller than a chunk.
  for (const size of [2 * K, 2 * K + 1, 2 * K - 1, 17]) {
    resetStubDrive();
    const ranges: string[] = [];
    const spy: typeof stubDriveFetch = (url, init) => {
      const cr = new Headers(init.headers).get("content-range");
      if (cr) ranges.push(cr);
      return stubDriveFetch(url, init);
    };
    const res = await uploadVia(spy, t, "/N1/a.zip", Readable.from([Buffer.alloc(size, 7)]), K);
    assert.equal(res.bytes, size, `wrote the wrong number of bytes for ${size}`);

    // Only the LAST Content-Range declares a total; every earlier one is a
    // 256 KB multiple ending in `/*`.
    const last = ranges.pop()!;
    assert.match(last, new RegExp(`/${size}$`), `final range must declare the total: ${last}`);
    for (const r of ranges) {
      const m = /^bytes (\d+)-(\d+)\/\*$/.exec(r);
      assert.ok(m, `non-final range must be open-ended: ${r}`);
      assert.equal((Number(m[2]) - Number(m[1]) + 1) % K, 0, `non-final chunk not a ${K} multiple: ${r}`);
    }
  }
});

// --- The 308 / Range resume path -------------------------------------------

test("nextOffsetFromRange reads the server's byte count, not ours", () => {
  assert.equal(nextOffsetFromRange("bytes=0-262143"), 262144);
  assert.equal(nextOffsetFromRange("bytes=0-0"), 1);
  // Google omits the header entirely when it holds nothing.
  assert.equal(nextOffsetFromRange(null), 0);
  assert.equal(nextOffsetFromRange("garbage"), 0);
});

test("a 308 that lands mid-chunk resumes from the server's Range, not our offset", async () => {
  const t = await token();
  // The server keeps only 1000 bytes of the first 256 KB chunk and says so.
  // Trusting our own offset here writes the same bytes twice and corrupts the
  // archive; honouring the Range re-sends exactly the tail that's missing.
  stubDriveControl.truncateNextChunkTo = 1000;
  const body = Buffer.alloc(3 * K + 55, 9);
  const res = await uploadVia(stubDriveFetch, t, "/N1/a.zip", Readable.from([body]), K);
  assert.equal(res.bytes, body.length);
  assert.equal(stubDriveUploads.get(`/${ROOT_FOLDER}/N1/a.zip`), body.length);
});

test("a server that has fallen behind the buffered chunk is a hard failure", async () => {
  const t = await token();
  // Two chunks in, the server claims it only has 10 bytes — those stream bytes
  // are long gone, so the only honest outcome is a failed run. Silently
  // continuing would upload a truncated .zip and report success.
  const body = Buffer.alloc(3 * K, 1);
  let seen = 0;
  const rewind: typeof stubDriveFetch = async (url, init) => {
    const res = await stubDriveFetch(url, init);
    if (res.status === 308 && ++seen === 2) {
      return new Response(null, { status: 308, headers: { range: "bytes=0-9" } });
    }
    return res;
  };
  await assert.rejects(
    () => uploadVia(rewind, t, "/N1/a.zip", Readable.from([body]), K),
    /cannot rewind/,
  );
});

// --- The stub refuses what Google refuses -----------------------------------

test("a real resumable session round-trips every byte into a nested folder", async () => {
  const t = await token();
  const res = await uploadVia(
    stubDriveFetch,
    t,
    "/N734DM/2026-08-01-N734DM.zip",
    Readable.from([Buffer.alloc(K, 1), Buffer.alloc(1234, 2)]),
    K,
  );
  assert.equal(res.bytes, K + 1234);
  assert.equal(res.path, `/${ROOT_FOLDER}/N734DM/2026-08-01-N734DM.zip`);
  assert.equal(stubDriveUploads.get(`/${ROOT_FOLDER}/N734DM/2026-08-01-N734DM.zip`), K + 1234);
  // The cached root folder id comes back for persisting into folder_path.
  assert.ok(res.state);
});

test("the cached folder id is reused, and re-resolved when the user deletes it", async () => {
  const t = await token();
  const first = await uploadVia(stubDriveFetch, t, "/N1/a.zip", Readable.from([Buffer.alloc(9)]), K);
  const second = await uploadVia(stubDriveFetch, t, "/N1/b.zip", Readable.from([Buffer.alloc(9)]), K, first.state);
  assert.equal(second.state, first.state, "a live folder id must be reused, not re-created");

  // The user deleted the MyTailLog folder: a stale id must not fail the run.
  resetStubDrive();
  const third = await uploadVia(stubDriveFetch, t, "/N1/c.zip", Readable.from([Buffer.alloc(9)]), K, first.state);
  assert.notEqual(third.state, first.state, "a dead folder id must be re-resolved");
  assert.equal(stubDriveUploads.get(`/${ROOT_FOLDER}/N1/c.zip`), 9);
});

test("the stub rejects an unknown or expired access token (401)", async () => {
  for (const bad of ["not-a-token", "ya29.e2e-1000-expired"]) {
    await assert.rejects(
      () => uploadVia(stubDriveFetch, bad, "/N1/a.zip", Readable.from(["x"]), K),
      /401/,
      `token ${bad} should have been refused`,
    );
  }
});

test("the stub rejects a non-final chunk that isn't a 256 KB multiple (400)", async () => {
  const t = await token();
  const { sessionUri } = await openSession(t);
  await assert.rejects(
    async () => {
      const res = await stubDriveFetch(sessionUri, {
        method: "PUT",
        headers: { authorization: `Bearer ${t}`, "content-range": "bytes 0-999/*" },
        body: new Uint8Array(1000),
      });
      if (res.status !== 200) throw new Error(`${res.status}: ${await res.text()}`);
    },
    /400.*invalidChunkSize/s,
  );
});

test("the stub answers a mismatched Content-Range with 308 + the true Range", async () => {
  const t = await token();
  const { sessionUri } = await openSession(t);
  const put = (range: string, len: number) =>
    stubDriveFetch(sessionUri, {
      method: "PUT",
      headers: { authorization: `Bearer ${t}`, "content-range": range },
      body: new Uint8Array(len),
    });

  assert.equal((await put(`bytes 0-${K - 1}/*`, K)).status, 308);
  // The client "forgot" to advance — the exact bug a permissive stub hides.
  const stale = await put(`bytes 0-${K - 1}/*`, K);
  assert.equal(stale.status, 308);
  assert.equal(stale.headers.get("range"), `bytes=0-${K - 1}`);
  assert.equal(nextOffsetFromRange(stale.headers.get("range")), K);
});

test("the stub rejects a missing Content-Range and a lying one (400)", async () => {
  const t = await token();
  const { sessionUri } = await openSession(t);
  const none = await stubDriveFetch(sessionUri, {
    method: "PUT",
    headers: { authorization: `Bearer ${t}` },
    body: new Uint8Array(K),
  });
  assert.equal(none.status, 400);

  // Declares 256 KB, sends 10 bytes.
  const lying = await stubDriveFetch(sessionUri, {
    method: "PUT",
    headers: { authorization: `Bearer ${t}`, "content-range": `bytes 0-${K - 1}/*` },
    body: new Uint8Array(10),
  });
  assert.equal(lying.status, 400);

  // Final chunk whose declared total contradicts what arrived.
  const wrongTotal = await stubDriveFetch(sessionUri, {
    method: "PUT",
    headers: { authorization: `Bearer ${t}`, "content-range": "bytes 0-9/999" },
    body: new Uint8Array(10),
  });
  assert.equal(wrongTotal.status, 400);
});

test("the stub rejects an unknown or already-finished session (404)", async () => {
  const t = await token();
  const unknown = await stubDriveFetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=nope",
    { method: "PUT", headers: { authorization: `Bearer ${t}`, "content-range": "bytes 0-0/1" }, body: new Uint8Array(1) },
  );
  assert.equal(unknown.status, 404);

  const { sessionUri } = await openSession(t);
  const done = await stubDriveFetch(sessionUri, {
    method: "PUT",
    headers: { authorization: `Bearer ${t}`, "content-range": "bytes 0-0/1" },
    body: new Uint8Array(1),
  });
  assert.equal(done.status, 200);
  const after = await stubDriveFetch(sessionUri, {
    method: "PUT",
    headers: { authorization: `Bearer ${t}`, "content-range": "bytes 1-1/2" },
    body: new Uint8Array(1),
  });
  assert.equal(after.status, 404, "a finished session must not accept more bytes");
});

test("the stub refuses to start a session with no name or an unknown parent", async () => {
  const t = await token();
  const start = (body: unknown) =>
    stubDriveFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
      method: "POST",
      headers: { authorization: `Bearer ${t}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  assert.equal((await start({ parents: ["x"] })).status, 400);
  // drive.file can only write into folders we made — an unknown parent is a 404,
  // not a quiet write into the root of the user's Drive.
  assert.equal((await start({ name: "a.zip", parents: ["nope"] })).status, 404);
});

test("an empty archive is refused rather than uploaded as a 0-byte file", async () => {
  await assert.rejects(
    async () => uploadVia(stubDriveFetch, await token(), "/N1/a.zip", Readable.from([]), K),
    /empty archive/,
  );
});

test("a path with no filename is refused", async () => {
  await assert.rejects(
    async () => uploadVia(stubDriveFetch, await token(), "/", Readable.from(["x"]), K),
    /needs a filename/,
  );
});

/** Open a resumable session against a real folder, the way uploadVia does. */
async function openSession(t: string): Promise<{ sessionUri: string }> {
  const folder = await stubDriveFetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { authorization: `Bearer ${t}`, "content-type": "application/json" },
    body: JSON.stringify({ name: ROOT_FOLDER, mimeType: "application/vnd.google-apps.folder" }),
  });
  const { id } = (await folder.json()) as { id: string };
  const res = await stubDriveFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
    method: "POST",
    headers: { authorization: `Bearer ${t}`, "content-type": "application/json" },
    body: JSON.stringify({ name: "a.zip", parents: [id] }),
  });
  return { sessionUri: res.headers.get("location")! };
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import {
  DEFAULT_MAX_ARCHIVE_BYTES,
  dayOfMonthFor,
  formatBytes,
  maxArchiveBytes,
  nextRunAt,
  redactSecrets,
  remotePath,
  tooLargeToArchive,
} from "../src/lib/backup/schedule";
import { CHUNK_BYTES, MAX_CALL_BYTES, chunkStream, uploadVia } from "../src/lib/backup/providers/dropbox";
import { stubContentCall, stubDropboxProvider, stubUploads } from "../src/lib/backup/providers/dropboxStub";

// --- The day-of-month spread ------------------------------------------------

test("day_of_month is 1..28 for every user, so February always has it", () => {
  const seen = new Set<number>();
  for (let i = 0; i < 2000; i++) {
    const d = dayOfMonthFor(`8f14e45f-ceea-467a-9d1e-${String(i).padStart(12, "0")}`);
    assert.ok(Number.isInteger(d), `${d} is not an integer`);
    assert.ok(d >= 1 && d <= 28, `${d} is outside 1..28`);
    seen.add(d);
  }
  // Every day gets used — the whole point is not landing on the 1st.
  assert.equal(seen.size, 28);
});

test("day_of_month is stable per user", () => {
  const id = "1c0ffee0-0000-4000-8000-000000000001";
  assert.equal(dayOfMonthFor(id), dayOfMonthFor(id));
});

// --- next_run_at ------------------------------------------------------------

test("monthly rolls to the next month once this month's day has passed", () => {
  // The 10th already gone in March → April 10th.
  const from = new Date("2026-03-15T12:00:00Z");
  assert.equal(nextRunAt("monthly", 10, from), "2026-04-10T03:00:00.000Z");
  // Still ahead in March → this month.
  assert.equal(nextRunAt("monthly", 20, from), "2026-03-20T03:00:00.000Z");
});

test("a day-28 schedule lands ON February 28th, not March", () => {
  const from = new Date("2026-01-29T00:00:00Z");
  assert.equal(nextRunAt("monthly", 28, from), "2026-02-28T03:00:00.000Z");
  // Leap year too.
  assert.equal(nextRunAt("monthly", 28, new Date("2028-01-29T00:00:00Z")), "2028-02-28T03:00:00.000Z");
});

test("quarterly steps three months at a time", () => {
  const from = new Date("2026-03-15T12:00:00Z");
  assert.equal(nextRunAt("quarterly", 10, from), "2026-06-10T03:00:00.000Z");
});

test("quarterly crossing a year boundary keeps the day", () => {
  assert.equal(nextRunAt("quarterly", 5, new Date("2026-11-06T00:00:00Z")), "2027-02-05T03:00:00.000Z");
});

test("a run exactly at next_run_at moves forward, never sticks", () => {
  const at = new Date("2026-04-10T03:00:00.000Z");
  assert.equal(nextRunAt("monthly", 10, at), "2026-05-10T03:00:00.000Z");
});

test("off has no next run", () => {
  assert.equal(nextRunAt("off", 10, new Date()), null);
});

// --- The size guard ---------------------------------------------------------

test("the size ceiling defaults to 400 MB and is env-tunable", () => {
  assert.equal(maxArchiveBytes({}), DEFAULT_MAX_ARCHIVE_BYTES);
  assert.equal(maxArchiveBytes({ BACKUP_MAX_BYTES: "1048576" }), 1048576);
  // Garbage / zero / negative must not disable the guard.
  for (const v of ["", "nonsense", "0", "-5"]) {
    assert.equal(
      maxArchiveBytes({ BACKUP_MAX_BYTES: v }),
      DEFAULT_MAX_ARCHIVE_BYTES,
      `BACKUP_MAX_BYTES=${v} must fall back to the default`,
    );
  }
});

test("the size guard refuses only what is over the ceiling", () => {
  const limit = 400 * 1024 * 1024;
  assert.equal(tooLargeToArchive(limit - 1, limit), false);
  assert.equal(tooLargeToArchive(limit, limit), false); // exactly at the limit is allowed
  assert.equal(tooLargeToArchive(limit + 1, limit), true);
  assert.equal(tooLargeToArchive(0, limit), false); // an empty aircraft is not "too large"
});

test("formatBytes is readable at every scale", () => {
  assert.equal(formatBytes(null), "—");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(400 * 1024 * 1024), "400 MB");
});

// --- Redaction --------------------------------------------------------------

test("a Dropbox 401 body cannot carry a token into backup_run.error", () => {
  const token = "sl.u.AFmnop0123456789abcdefghijklmnopqrstuvwxyzABCDEF-_1234567890";
  const raw =
    `Dropbox upload_session/append_v2 failed (401): {"error_summary":"expired_access_token/",` +
    `"access_token":"${token}"} (sent Authorization: Bearer ${token})`;
  const out = redactSecrets(raw);
  assert.ok(!out.includes(token), `token leaked: ${out}`);
  assert.ok(!out.includes("sl.u."), `token prefix leaked: ${out}`);
  assert.ok(out.includes("expired_access_token"), "the diagnostic reason must survive");
});

test("refresh tokens, client secrets and our own ciphertext are redacted", () => {
  const out = redactSecrets(
    'refresh_token=abc123SECRETrefreshvalue&client_secret: "hunter2hunter2hunter2" ' +
      "v1:QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=",
  );
  assert.ok(!out.includes("abc123SECRETrefreshvalue"));
  assert.ok(!out.includes("hunter2hunter2hunter2"));
  assert.ok(!out.includes("QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo"));
});

test("redaction leaves an ordinary message alone and bounds the length", () => {
  const msg = "Aircraft not found.";
  assert.equal(redactSecrets(msg), msg);
  assert.ok(redactSecrets("x".repeat(5000)).length <= 501);
});

// --- Remote path ------------------------------------------------------------

test("remote paths are absolute, dated, and per-tail", () => {
  assert.equal(remotePath(null, "N734DM", "2026-08-01-N734DM.zip"), "/N734DM/2026-08-01-N734DM.zip");
  assert.equal(
    remotePath("/MyTailLog/", "N734DM", "2026-08-01-N734DM.zip"),
    "/MyTailLog/N734DM/2026-08-01-N734DM.zip",
  );
  // A tail with slashes or spaces must not invent path segments.
  assert.equal(remotePath(null, "N7/34 DM", "a.zip"), "/N734DM/a.zip");
});

// --- Chunking maths ---------------------------------------------------------

const chunksOf = async (pieces: (Buffer | string)[], size: number) => {
  const out: Buffer[] = [];
  for await (const c of chunkStream(Readable.from(pieces), size)) out.push(c);
  return out;
};

test("chunkStream cuts at exactly the chunk size regardless of input shape", async () => {
  // 10 pieces of 3 bytes = 30 bytes, chunked at 4 → 7 full + a 2-byte remainder.
  const chunks = await chunksOf(Array.from({ length: 10 }, () => "abc"), 4);
  assert.deepEqual(chunks.map((c) => c.length), [4, 4, 4, 4, 4, 4, 4, 2]);
  assert.equal(Buffer.concat(chunks).toString(), "abc".repeat(10));
});

test("chunkStream splits a piece far larger than the chunk size", async () => {
  const chunks = await chunksOf([Buffer.alloc(25, 7)], 10);
  assert.deepEqual(chunks.map((c) => c.length), [10, 10, 5]);
});

test("an exact multiple ends with an empty final chunk (finish carries no bytes)", async () => {
  const chunks = await chunksOf([Buffer.alloc(20)], 10);
  assert.deepEqual(chunks.map((c) => c.length), [10, 10, 0]);
});

test("an empty archive yields exactly one empty chunk", async () => {
  const chunks = await chunksOf([], 10);
  assert.deepEqual(chunks.map((c) => c.length), [0]);
});

test("the chunk size stays under Dropbox's 150 MB per-call cap", async () => {
  assert.ok(CHUNK_BYTES < MAX_CALL_BYTES);
  await assert.rejects(() => chunksOf([Buffer.alloc(1)], MAX_CALL_BYTES + 1), /chunk size must be/);
});

// --- The stub refuses what production refuses -------------------------------
//
// These run the PRODUCTION uploader (uploadVia) against the stub server, so the
// offset arithmetic under test is the one that will talk to real Dropbox.

const goodToken = async () => (await stubDropboxProvider().exchangeCode("e2e-stub-code", "/cb")).accessToken;

test("a real upload session round-trips every byte", async () => {
  const token = await goodToken();
  const body = Readable.from([Buffer.alloc(1000, 1), Buffer.alloc(1500, 2)]);
  const res = await uploadVia(stubContentCall(token), "/N1/2026-08-01-N1.zip", body, 512);
  assert.equal(res.bytes, 2500);
  assert.equal(stubUploads.get("/N1/2026-08-01-N1.zip"), 2500);
});

test("the stub rejects an expired or unknown access token (401)", async () => {
  await assert.rejects(
    () => uploadVia(stubContentCall("not-a-token"), "/N1/a.zip", Readable.from(["x"])),
    /401.*invalid_access_token/s,
  );
  await assert.rejects(
    () => uploadVia(stubContentCall("sl.u.e2e-1000-old"), "/N1/a.zip", Readable.from(["x"])),
    /401.*expired_access_token/s,
  );
});

test("the stub rejects a wrong offset the way Dropbox does (409 incorrect_offset)", async () => {
  const call = stubContentCall(await goodToken());
  const { session_id } = await call("upload_session/start", { close: false }, Buffer.alloc(0));
  await call("upload_session/append_v2", { cursor: { session_id, offset: 0 }, close: false }, Buffer.alloc(10));
  // The client "forgot" to advance its offset — the exact bug a permissive stub hides.
  await assert.rejects(
    () => call("upload_session/append_v2", { cursor: { session_id, offset: 0 }, close: false }, Buffer.alloc(10)),
    /409.*incorrect_offset/s,
  );
});

test("the stub rejects a finished session and an unknown session (409)", async () => {
  const call = stubContentCall(await goodToken());
  const { session_id } = await call("upload_session/start", { close: false }, Buffer.alloc(0));
  await call(
    "upload_session/finish",
    { cursor: { session_id, offset: 0 }, commit: { path: "/N1/a.zip" } },
    Buffer.alloc(0),
  );
  await assert.rejects(
    () => call("upload_session/append_v2", { cursor: { session_id, offset: 0 }, close: false }, Buffer.alloc(1)),
    /409.*closed/s,
  );
  await assert.rejects(
    () => call("upload_session/append_v2", { cursor: { session_id: "nope", offset: 0 }, close: false }, Buffer.alloc(1)),
    /409.*not_found/s,
  );
});

test("the stub rejects a malformed path (400 path/malformed_path)", async () => {
  const token = await goodToken();
  for (const bad of ["N1/a.zip", "/N1/a.zip/", "/N1//a.zip", "/N1/a?.zip", ""]) {
    await assert.rejects(
      () => uploadVia(stubContentCall(token), bad, Readable.from(["x"])),
      /400.*malformed_path/s,
      `path ${JSON.stringify(bad)} should have been refused`,
    );
  }
});

test("the stub rejects a single call over Dropbox's 150 MB cap", async () => {
  const call = stubContentCall(await goodToken());
  await assert.rejects(
    () => call("upload_session/start", { close: false }, Buffer.alloc(MAX_CALL_BYTES + 1)),
    /400.*too_large/s,
  );
});

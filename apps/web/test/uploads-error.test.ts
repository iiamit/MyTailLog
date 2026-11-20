import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { UPLOAD_PREPARE_FAILED, uploadPrepareFailed } from "../src/lib/capture/uploadError";

// POST /api/aircraft/{id}/uploads when storage can't sign: the phone gets house copy, the log gets the detail.
const RAW = "Permission 'iam.serviceAccounts.signBlob' denied on resource. See https://cloud.google.com/iam/docs/troubleshooting";

test("an unsigned upload answers in plain words and a stable code, never the backend's error", () => {
  const log = mock.method(console, "error", () => {});
  const body = uploadPrepareFailed("a/b/c.jpg", RAW);
  assert.deepEqual(body, { error: "Couldn't prepare the upload. It will try again.", code: "upload_unavailable" });
  assert.ok(!JSON.stringify(body).includes("signBlob") && !JSON.stringify(body).includes("http"));
  assert.ok(String(log.mock.calls[0].arguments[0]).includes(RAW), "the detail is logged");
  log.mock.restore();
});

test("the uploads route sends the plain answer, not the signer's message", () => {
  const src = readFileSync(new URL("../src/app/api/aircraft/[id]/uploads/route.ts", import.meta.url), "utf8");
  assert.match(src, /NextResponse\.json\(uploadPrepareFailed\(path, signed\.error\)/);
  assert.doesNotMatch(src, /error:\s*signed\.error/);
  assert.equal(UPLOAD_PREPARE_FAILED.code, "upload_unavailable");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACCEPTED_MIME,
  MAX_DOCUMENT_BYTES,
  fileSizeLabel,
  mimeFor,
  validateDocument,
} from "../../mobile/src/document-validate";

// What the phone accepts into the document upload queue. Tested here because
// apps/mobile has no runner. These limits MIRROR the documents route — if that
// route changes, this test is where the drift shows up.

test("the accepted set and the size cap match the server route", () => {
  assert.deepEqual([...ACCEPTED_MIME], ["application/pdf", "image/jpeg", "image/png", "image/webp"]);
  assert.equal(MAX_DOCUMENT_BYTES, 25 * 1024 * 1024);
});

test("a file with no usable type is identified by its extension", () => {
  // iPadOS drops and some cloud providers hand over octet-stream or nothing at
  // all; refusing a good PDF for having no label on it is the bug this prevents.
  assert.equal(mimeFor("registration.pdf", ""), "application/pdf");
  assert.equal(mimeFor("W&B.PDF", "application/octet-stream"), "application/pdf");
  assert.equal(mimeFor("airworthiness.JPEG", null), "image/jpeg");
  assert.equal(mimeFor("scan.jpg", undefined), "image/jpeg");
});

test("a type that IS given and is acceptable wins over the extension", () => {
  assert.equal(mimeFor("weird.name", "image/png"), "image/png");
});

test("accepts what the vault takes", () => {
  const ok = validateDocument({ name: "registration.pdf", type: "application/pdf", size: 400_000 });
  assert.deepEqual(ok, { ok: true, mime: "application/pdf" });
  assert.equal(validateDocument({ name: "cert.png", type: "", size: 10 }).ok, true);
});

test("refuses the wrong kind of file, in words an owner can act on", () => {
  const r = validateDocument({ name: "logbook.docx", type: "", size: 1000 });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.message, /logbook\.docx/, "name the file that was refused");
  assert.match(r.message, /PDF/);
  assert.doesNotMatch(r.message, /mime|MIME/, "no implementation words");
});

test("refuses a file over the cap BEFORE it is held on the device", () => {
  const r = validateDocument({ name: "poh.pdf", type: "application/pdf", size: 40 * 1024 * 1024 });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.message, /40\.0 MB/);
  assert.match(r.message, /25 MB/);
  // Exactly at the cap is fine — the route's check is `>`.
  assert.equal(validateDocument({ name: "poh.pdf", type: "application/pdf", size: MAX_DOCUMENT_BYTES }).ok, true);
});

test("an empty file is refused rather than queued forever", () => {
  const r = validateDocument({ name: "empty.pdf", type: "application/pdf", size: 0 });
  assert.equal(r.ok, false);
});

test("file sizes read the way a person says them", () => {
  assert.equal(fileSizeLabel(512), "512 bytes");
  assert.equal(fileSizeLabel(2048), "2 KB");
  assert.equal(fileSizeLabel(1024 * 1024 * 3.25), "3.3 MB");
});

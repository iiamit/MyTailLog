import { test } from "node:test";
import assert from "node:assert/strict";
import { encryptSecret, decryptSecret } from "../src/lib/crypto";

// crypto.key() reads ENCRYPTION_KEY lazily (only inside encrypt/decrypt), so
// setting it here — after the hoisted import but before any test runs — is fine.
process.env.ENCRYPTION_KEY = "unit-test-encryption-key-at-least-32-chars-long";

test("crypto: round-trips a secret", () => {
  const secret = "sk-ant-abc123-SENSITIVE";
  const enc = encryptSecret(secret);
  assert.ok(enc.startsWith("v1:"), "has version prefix");
  assert.ok(!enc.includes(secret), "plaintext not present in ciphertext");
  assert.equal(decryptSecret(enc), secret);
});

test("crypto: a fresh random IV makes repeat encryptions differ", () => {
  const a = encryptSecret("same-plaintext");
  const b = encryptSecret("same-plaintext");
  assert.notEqual(a, b);
  assert.equal(decryptSecret(a), "same-plaintext");
  assert.equal(decryptSecret(b), "same-plaintext");
});

test("crypto: legacy un-prefixed plaintext passes through unchanged", () => {
  assert.equal(decryptSecret("legacy-plaintext"), "legacy-plaintext");
});

test("crypto: null in, null out", () => {
  assert.equal(decryptSecret(null), null);
});

test("crypto: a tampered ciphertext is rejected (GCM auth)", () => {
  const enc = encryptSecret("tamper-me");
  // Zero out bytes in the ciphertext region (past iv[12]+tag[16]=28).
  const bad = "v1:" + Buffer.from(enc.slice(3), "base64").fill(0, 28).toString("base64");
  assert.throws(() => decryptSecret(bad));
});

test("crypto: a ciphertext too short to hold iv+tag is rejected", () => {
  const tooShort = "v1:" + Buffer.alloc(10).toString("base64");
  assert.throws(() => decryptSecret(tooShort), /too short/);
});

test("crypto: a short key still works (L1 warns, does not throw)", () => {
  const prev = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = "short"; // < 32 chars
  try {
    const enc = encryptSecret("still-works");
    assert.equal(decryptSecret(enc), "still-works");
  } finally {
    process.env.ENCRYPTION_KEY = prev;
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { publicOrigin } from "../src/lib/publicOrigin";

const req = (headers: Record<string, string>) =>
  new Request("http://0.0.0.0:8080/whatever", { headers });

test("publicOrigin: pins to NEXT_PUBLIC_SITE_URL and strips trailing slashes", () => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://mytaillog.com/";
  assert.equal(publicOrigin(req({ host: "evil.example" })), "https://mytaillog.com");
});

test("publicOrigin: a client Host header cannot override the pinned origin", () => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://mytaillog.com";
  assert.equal(
    publicOrigin(req({ "x-forwarded-host": "attacker.test", "x-forwarded-proto": "https" })),
    "https://mytaillog.com",
  );
});

test("publicOrigin: non-production falls back to the request headers", () => {
  delete process.env.NEXT_PUBLIC_SITE_URL; // NODE_ENV is 'test' here → fallback allowed
  assert.equal(
    publicOrigin(req({ host: "localhost:3000", "x-forwarded-proto": "http" })),
    "http://localhost:3000",
  );
});

test("publicOrigin: production REFUSES the Host-header fallback (poisoning guard)", () => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
  const prev = process.env.NODE_ENV;
  // NODE_ENV is read-only in @types/node; assign through a cast for the test.
  (process.env as Record<string, string>).NODE_ENV = "production";
  try {
    assert.throws(() => publicOrigin(req({ host: "attacker.test" })), /NEXT_PUBLIC_SITE_URL must be set/);
  } finally {
    (process.env as Record<string, string>).NODE_ENV = prev ?? "test";
  }
});

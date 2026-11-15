import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeSource, encodeSource, isFreshAccount, isHeardAbout, sourceFromLanding } from "../src/lib/signupSource";

const now = new Date("2026-11-15T12:00:00Z");

test("tagged landing records allowlisted params only", () => {
  const s = sourceFromLanding(new URL("https://mytaillog.com/demo?ref=reddit-flying&utm_medium=post&evil=1"), null, "mytaillog.com", now);
  assert.deepEqual(s, { landing: "/demo", at: now.toISOString(), ref: "reddit-flying", utm_medium: "post" });
});

test("untagged landing from our own site records nothing", () => {
  assert.equal(sourceFromLanding(new URL("https://mytaillog.com/"), "https://www.mytaillog.com/faq", "mytaillog.com", now), null);
  assert.equal(sourceFromLanding(new URL("https://mytaillog.com/"), null, "mytaillog.com", now), null);
});

test("external referrer host is recorded without path", () => {
  const s = sourceFromLanding(new URL("https://mytaillog.com/"), "https://www.pilotsofamerica.com/community/threads/x", "mytaillog.com", now);
  assert.equal(s?.referrer_host, "pilotsofamerica.com");
});

test("junk values are dropped and long ones trimmed", () => {
  const s = sourceFromLanding(new URL(`https://mytaillog.com/?ref=<script>&utm_source=${"a".repeat(200)}`), null, "mytaillog.com", now);
  assert.equal(s?.ref, undefined);
  assert.equal(s?.utm_source?.length, 64);
});

test("cookie round-trips and rejects tampering", () => {
  const s = sourceFromLanding(new URL("https://mytaillog.com/?ref=mfb"), null, "mytaillog.com", now)!;
  assert.deepEqual(decodeSource(encodeSource(s)), s);
  assert.equal(decodeSource("not-base64-json"), null);
  const forged = Buffer.from(JSON.stringify({ ref: "<img>", landing: "/" })).toString("base64url");
  assert.equal(decodeSource(forged)?.ref, undefined);
});

test("only accounts under an hour old are attributed", () => {
  const t = now.getTime();
  assert.equal(isFreshAccount("2026-11-15T11:30:00Z", t), true);
  assert.equal(isFreshAccount("2026-11-15T10:59:00Z", t), false);
  assert.equal(isFreshAccount(undefined, t), false);
});

test("heard-about answers match the 0066 check list", () => {
  assert.equal(isHeardAbout("type_club"), true);
  assert.equal(isHeardAbout("dismissed"), true);
  assert.equal(isHeardAbout("tiktok"), false);
});

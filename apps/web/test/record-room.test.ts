import { test } from "node:test";
import assert from "node:assert/strict";
import {
  documentAllowed, extendedExpiry, hashRoomToken, ipHashOf, isRoomToken, newRoomToken, openRoom, pageAllowed, pickRoomInput,
  roomActive, roomExpiry, roomJson, roomOpens, roomSections, sessionKeyOf, type Room,
} from "../src/lib/recordRoom";

const room: Room = {
  id: "r1",
  aircraft_id: "ac1",
  label: "Buyer",
  include_summary: true,
  logbook_ids: ["lb-engine"],
  include_scans: true,
  document_ids: ["doc-337"],
  expires_at: "2026-12-15T00:00:00Z",
  revoked_at: null,
  audience: "buyer",
  cover: "map",
  map_window: "whole_life",
  include_dossier: true,
  include_squawks: false,
  include_reporters: false,
  include_gaps_note: true,
  created_at: "2026-11-15T00:00:00Z",
};
const now = new Date("2026-11-15T00:00:00Z");
const DAY = 86_400_000;

test("v2 input: presets fill the map window, reporters need squawks, bad values are refused", () => {
  const ok = pickRoomInput({ label: " J. Okafor ", audience: "insurer", logbookIds: ["a", "a"], includeReporters: true });
  assert.ok(!("error" in ok));
  if ("error" in ok) return;
  assert.equal(ok.label, "J. Okafor");
  assert.equal(ok.mapWindow, "last_5_years");
  assert.deepEqual(ok.logbookIds, ["a"]);
  assert.equal(ok.includeReporters, false);
  assert.equal(ok.includeGapsNote, true);
  assert.equal(pickRoomInput({ label: "IA", audience: "ia" }).hasOwnProperty("error"), false);
  for (const bad of [null, [], { label: "" }, { label: "x".repeat(81) }, { label: "x", audience: "mechanic" },
    { label: "x", expiresInDays: 365 }, { label: "x", expiresAt: "soon" }, { label: "x", logbookIds: "lb" }, { label: "x", cover: "dossier" }]) {
    assert.ok("error" in pickRoomInput(bad), JSON.stringify(bad));
  }
});

test("v2 expiry: chosen days, a date within 180 days, the IA preset ends 14 days after the annual", () => {
  const iso = (ms: number) => new Date(ms).toISOString();
  assert.equal(roomExpiry({ audience: "other", days: 7, expiresAt: null }, now, null), iso(now.getTime() + 7 * DAY));
  assert.equal(roomExpiry({ audience: "insurer", days: null, expiresAt: null }, now, null), iso(now.getTime() + 14 * DAY));
  assert.equal(roomExpiry({ audience: "ia", days: null, expiresAt: null }, now, "2027-01-31"), "2027-02-14T23:59:59.000Z");
  // The annual far away: capped at 180 days. Annual lapsed or unknown: 30 days.
  assert.equal(roomExpiry({ audience: "ia", days: null, expiresAt: null }, now, "2027-12-31"), iso(now.getTime() + 180 * DAY));
  assert.equal(roomExpiry({ audience: "ia", days: null, expiresAt: null }, now, "2026-10-31"), iso(now.getTime() + 30 * DAY));
  assert.equal(roomExpiry({ audience: "ia", days: null, expiresAt: null }, now, null), iso(now.getTime() + 30 * DAY));
  assert.equal(roomExpiry({ audience: "other", days: null, expiresAt: "2026-12-01" }, now, null), "2026-12-01T23:59:59.000Z");
  assert.ok(typeof roomExpiry({ audience: "other", days: null, expiresAt: "2026-11-01" }, now, null) !== "string");
  assert.ok(typeof roomExpiry({ audience: "other", days: null, expiresAt: "2027-06-01" }, now, null) !== "string");
});

test("v2 extend: 30 days from the later of now and the current end, never past 180 days from creation", () => {
  assert.equal(extendedExpiry(room, now), "2027-01-14T00:00:00.000Z");
  // Already ended: counts from now.
  assert.equal(extendedExpiry({ ...room, expires_at: "2026-11-01T00:00:00Z" }, now), new Date(now.getTime() + 30 * DAY).toISOString());
  const capMs = Date.parse(room.created_at) + 180 * DAY;
  assert.equal(extendedExpiry({ ...room, expires_at: new Date(capMs - 10 * DAY).toISOString() }, now), new Date(capMs).toISOString());
  assert.equal(extendedExpiry({ ...room, expires_at: new Date(capMs).toISOString() }, now), null);
});

test("v2 opens: one per browser session, legacy rows one each, newest first, sections in viewing order", () => {
  const opens = roomOpens([
    { session_key: null, section: null, created_at: "2026-11-01T10:00:00Z" },
    { session_key: null, section: null, created_at: "2026-11-01T10:01:00Z" },
    { session_key: "s1", section: "map", created_at: "2026-11-17T19:42:00Z" },
    { session_key: "s1", section: "dossier", created_at: "2026-11-17T19:44:00Z" },
    { session_key: "s1", section: "map", created_at: "2026-11-17T19:45:00Z" },
    { session_key: "s2", section: "logbook:lb-engine", created_at: "2026-11-18T08:00:00Z" },
  ]);
  assert.equal(opens.length, 4);
  assert.deepEqual(opens[0], { openedAt: "2026-11-18T08:00:00Z", lastAt: "2026-11-18T08:00:00Z", sections: ["logbook:lb-engine"] });
  assert.deepEqual(opens[1], { openedAt: "2026-11-17T19:42:00Z", lastAt: "2026-11-17T19:45:00Z", sections: ["map", "dossier"] });
  const json = roomJson(room, "https://x/r/t", opens);
  assert.equal(json.opens, 4);
  assert.equal(json.lastOpenedAt, "2026-11-18T08:00:00Z");
});

test("v2 sessions: same browser within 30 minutes shares a key; the IP is never stored raw", () => {
  const a = sessionKeyOf(ipHashOf("203.0.113.9", now), "Safari", new Date("2026-11-15T10:00:10Z"));
  const b = sessionKeyOf(ipHashOf("203.0.113.9", now), "Safari", new Date("2026-11-15T10:29:00Z"));
  const c = sessionKeyOf(ipHashOf("203.0.113.9", now), "Safari", new Date("2026-11-15T10:31:00Z"));
  const d = sessionKeyOf(ipHashOf("203.0.113.10", now), "Safari", new Date("2026-11-15T10:00:10Z"));
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
  assert.ok(!ipHashOf("203.0.113.9", now)!.includes("203"));
});

test("v2 sections: map first, then the owner's choices", () => {
  assert.deepEqual(roomSections(room), ["map", "summary", "dossier", "logbook:lb-engine", "documents"]);
  assert.deepEqual(roomSections({ ...room, logbook_ids: [], document_ids: [], include_dossier: false }), ["summary"]);
});

test("tokens are 43-char base64url and hash deterministically", () => {
  const t = newRoomToken();
  assert.ok(isRoomToken(t));
  assert.equal(hashRoomToken(t), hashRoomToken(t));
  assert.notEqual(hashRoomToken(t), hashRoomToken(newRoomToken()));
  for (const bad of ["", "short", `${t}x`, `${t.slice(0, 42)}/`, "../../etc/passwd"]) assert.equal(isRoomToken(bad), false, bad);
});

test("malformed tokens are rejected before any database call", async () => {
  assert.equal(await openRoom("not-a-token"), null);
});

test("a room is active only until it expires or is revoked", () => {
  assert.equal(roomActive(room, now), true);
  assert.equal(roomActive({ ...room, expires_at: "2026-11-14T23:59:59Z" }, now), false);
  assert.equal(roomActive({ ...room, revoked_at: "2026-11-14T00:00:00Z" }, now), false);
});

test("scans: only selected logbooks on this aircraft, and only when scans are included", () => {
  assert.equal(pageAllowed(room, { aircraft_id: "ac1", logbook_id: "lb-engine" }), true);
  assert.equal(pageAllowed(room, { aircraft_id: "ac1", logbook_id: "lb-airframe" }), false);
  assert.equal(pageAllowed(room, { aircraft_id: "ac2", logbook_id: "lb-engine" }), false);
  assert.equal(pageAllowed({ ...room, include_scans: false }, { aircraft_id: "ac1", logbook_id: "lb-engine" }), false);
});

test("documents: only ones the owner picked, never another aircraft's", () => {
  assert.equal(documentAllowed(room, { id: "doc-337", aircraft_id: "ac1" }), true);
  assert.equal(documentAllowed(room, { id: "doc-reg", aircraft_id: "ac1" }), false);
  assert.equal(documentAllowed(room, { id: "doc-337", aircraft_id: "ac2" }), false);
});

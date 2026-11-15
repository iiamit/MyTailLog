import { test } from "node:test";
import assert from "node:assert/strict";
import { documentAllowed, hashRoomToken, isRoomToken, newRoomToken, openRoom, pageAllowed, roomActive, type Room } from "../src/lib/recordRoom";

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
};
const now = new Date("2026-11-15T00:00:00Z");

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

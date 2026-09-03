import { test } from "node:test";
import assert from "node:assert/strict";
import { pushAlert } from "../src/app/api/push/apns";

// The lock-screen wording for the daily reminder. Worth covering because it is
// the only copy in the app nobody can proof-read in place: it is composed on a
// server at 6am and read once, on a locked phone.

test("one aircraft names what is actually due", () => {
  const m = pushAlert([{ tail: "N4321J", labels: ["Annual inspection"] }]);
  assert.equal(m?.title, "N4321J — 1 item coming due");
  assert.equal(m?.body, "Annual inspection");
});

test("a long list is trimmed rather than truncated mid-word", () => {
  const m = pushAlert([{ tail: "N4321J", labels: ["Annual", "Oil change", "ELT battery", "Transponder", "Pitot-static"] }]);
  assert.equal(m?.title, "N4321J — 5 items coming due");
  assert.equal(m?.body, "Annual, Oil change, ELT battery and 2 more");
});

test("several aircraft count up and list the tails", () => {
  const m = pushAlert([
    { tail: "N4321J", labels: ["Annual", "Oil change"] },
    { tail: "N778SP", labels: ["ELT battery"] },
  ]);
  assert.equal(m?.title, "3 items coming due");
  assert.equal(m?.body, "N4321J: 2 · N778SP: 1");
});

test("nothing due sends nothing at all", () => {
  assert.equal(pushAlert([]), null);
  assert.equal(pushAlert([{ tail: "N4321J", labels: [] }]), null);
});

test("the copy never leaks a date, a queue or an FAR number", () => {
  const m = pushAlert([{ tail: "N4321J", labels: ["Annual inspection"] }]);
  const all = `${m?.title} ${m?.body}`;
  assert.doesNotMatch(all, /\d{4}-\d{2}-\d{2}/);
  assert.doesNotMatch(all.toLowerCase(), /queue|confidence|91\.\d/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { runReviewWrite, resumableWrite } from "../../mobile/src/review-write";

test("a rejected queue write leaves the displayed records untouched and offers recovery", async () => {
  const entry = { confirmed: false };
  const result = await runReviewWrite(
    async () => { throw new Error("disk full"); },
    async () => { entry.confirmed = true; },
  );
  assert.equal(entry.confirmed, false);
  assert.equal(result.queued, false);
  assert.match(result.error!, /storage/);
});

test("failure after queueing preserves the queued action instead of resubmitting it", async () => {
  for (const stage of ["mirror", "reload", "sync"]) {
    let writes = 0;
    const result = await runReviewWrite(
      async () => { writes++; },
      async () => { throw new Error(stage); },
    );
    assert.equal(writes, 1);
    assert.equal(result.queued, true);
    assert.match(result.error!, /queued.*Reload/);
  }
});

test("successful review writes queue before updating the view", async () => {
  const calls: string[] = [];
  const result = await runReviewWrite(async () => { calls.push("queue"); }, async () => { calls.push("refresh"); });
  assert.deepEqual(calls, ["queue", "refresh"]);
  assert.deepEqual(result, { queued: true, error: null });
});


test("flight save retries unfinished oil and refresh without duplicating a reading", async () => {
  const calls: string[] = [];
  let failOil = true, failRefresh = true;
  const save = resumableWrite([
    async () => { calls.push("reading"); },
    async () => { if (failOil) throw new Error("disk full"); calls.push("oil"); },
    async () => { if (failRefresh) throw new Error("offline"); calls.push("refresh"); },
  ]);
  await assert.rejects(save(), /disk full/);
  assert.deepEqual(calls, ["reading"]);
  failOil = false;
  await assert.rejects(save(), /offline/);
  assert.deepEqual(calls, ["reading", "oil"]);
  failRefresh = false;
  await save();
  await save();
  assert.deepEqual(calls, ["reading", "oil", "refresh"]);
});

test("a rejected first save retries the original captured input", async () => {
  let fail = true;
  const saved: number[] = [];
  const value = 123.4;
  const save = resumableWrite([async () => {
    if (fail) throw new Error("storage unavailable");
    saved.push(value);
  }]);
  await assert.rejects(save());
  assert.deepEqual(saved, []);
  fail = false;
  await save();
  assert.deepEqual(saved, [123.4]);
});


test("review recovery retries a failed mirror before refreshing without queuing twice", async () => {
  const calls: string[] = [];
  let failMirror = true;
  let pending: (() => Promise<void>) | null = null;
  const queue = async () => {
    if (pending) return;
    calls.push("queue");
    pending = resumableWrite([
      async () => { if (failMirror) throw new Error("disk full"); calls.push("mirror"); },
      async () => { calls.push("refresh"); },
    ]);
  };
  const first = await runReviewWrite(queue, async () => { await pending!(); });
  assert.equal(first.queued, true);
  assert.ok(first.error);
  assert.deepEqual(calls, ["queue"]);
  failMirror = false;
  assert.deepEqual(await runReviewWrite(queue, async () => { await pending!(); }), { queued: true, error: null });
  assert.deepEqual(calls, ["queue", "mirror", "refresh"]);
});

import { test, expect } from "./fixtures";
import { request as playwrightRequest } from "@playwright/test";
import { randomUUID } from "node:crypto";

// POST /api/sync/push — the write half of the self-hosted sync engine
// (CONTRACT §2). What the offline client depends on, independent of which
// domain write functions have been lifted yet:
//   1. Bearer/cookie auth is required (a WKWebView has no cookies)
//   2. one result per mutation, in the same order, keyed by the mutation id
//   3. the base rule: an update without `base` is refused per mutation
//   4. one bad mutation never discards the rest of the batch
//
// Pure API-level: no `page`, so the fixture's CSP guard is never instantiated.

type PushResult = { id: string; status: "ok" | "conflict" | "error"; row?: unknown; error?: string };

const ANONYMOUS = { cookies: [], origins: [] };

test("sync/push: an unauthenticated device is rejected", async ({ baseURL }) => {
  const anon = await playwrightRequest.newContext({ baseURL, storageState: ANONYMOUS });
  const res = await anon.post("/api/sync/push", { data: { mutations: [] } });
  expect(res.status()).toBe(401);
  await anon.dispose();
});

test("sync/push: a malformed envelope is a 400, an oversized one too", async ({ request }) => {
  expect((await request.post("/api/sync/push", { data: { actions: [] } })).status()).toBe(400);
  const big = Array.from({ length: 101 }, () => ({ id: randomUUID(), type: "entries.confirmClean", aircraftId: "x", payload: {} }));
  expect((await request.post("/api/sync/push", { data: { mutations: big } })).status()).toBe(400);
});

test("sync/push: results come back one per mutation, in order, and a bad one doesn't sink the batch", async ({
  request,
  scratch,
}) => {
  const noBase = randomUUID();
  const unknown = randomUUID();
  const clean = randomUUID();
  const res = await request.post("/api/sync/push", {
    data: {
      mutations: [
        // 3. an update type without base → error, nothing written
        { id: noBase, type: "entry.update", aircraftId: scratch.id, payload: { entryId: randomUUID(), fields: {} } },
        // an unknown type → error
        { id: unknown, type: "entry.frobnicate", aircraftId: scratch.id, payload: {} },
        // a valid insert-free mutation: reaches dispatch (ok once lifted, a
        // "not lifted yet" error before — either way it is answered, not dropped)
        { id: clean, type: "entries.confirmClean", aircraftId: scratch.id, payload: {} },
      ],
    },
  });
  expect(res.status(), await res.text()).toBe(200);
  const { results } = (await res.json()) as { results: PushResult[] };
  expect(results.map((r) => r.id)).toEqual([noBase, unknown, clean]);
  expect(results[0].status).toBe("error");
  expect(results[0].error).toMatch(/based on/);
  expect(results[1].status).toBe("error");
  expect(results[1].error).toMatch(/Unknown change type/);
  expect(["ok", "error"]).toContain(results[2].status);
  if (results[2].status === "error") expect(results[2].error).toMatch(/not lifted yet/);
});

test("sync/push: a viewer's write is refused explicitly, never silently", async ({ request, scratch }) => {
  // The route checks can_edit_aircraft for the aircraft named in the mutation.
  // A made-up aircraft id is the simplest "not yours": RLS would match zero rows
  // and say nothing — the route must say no.
  const id = randomUUID();
  const res = await request.post("/api/sync/push", {
    data: { mutations: [{ id, type: "entries.confirmClean", aircraftId: randomUUID(), payload: {} }] },
  });
  expect(res.status()).toBe(200);
  const { results } = (await res.json()) as { results: PushResult[] };
  expect(results).toEqual([{ id, status: "error", error: expect.stringMatching(/permission/) }]);
  void scratch;
});

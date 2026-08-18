import { test, expect } from "./fixtures";
import { request as playwrightRequest, type APIRequestContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

// The self-hosted sync engine (`change_log` + /api/sync/pull) — the native iOS
// app's entire backbone, and previously untested end to end. What matters here
// isn't that a query runs, it's the four contract properties the offline client
// depends on:
//   1. a cursor that advances and CONVERGES (else the app loops forever)
//   2. deletes propagate as explicit `delete` ops (the app is hard-delete-only,
//      so timestamp diffing could never carry them — this is why change_log exists)
//   3. the feed is RLS-scoped (a device must never pull another tenant's rows)
//   4. Bearer auth works (a WKWebView has no cookies)
//
// Pure API-level: no `page`, so the fixture's CSP guard is never instantiated.
const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`missing ${k}`);
  return v;
};

type Change =
  | { table: string; op: "upsert"; id: string; seq: number; row: Record<string, unknown> }
  | { table: string; op: "delete"; id: string; seq: number };

type Pull = { changes: Change[]; nextCursor: number; hasMore: boolean };

/**
 * Drain the feed to its tip and return the final cursor. The harness account
 * accumulates change_log rows across runs, so every assertion below is made on
 * a WINDOW that starts at the tip — deterministic regardless of history size.
 */
async function drainToTip(api: APIRequestContext, from = 0): Promise<number> {
  let cursor = from;
  for (let i = 0; i < 100; i++) {
    const res = await api.get(`/api/sync/pull?cursor=${cursor}&limit=1000`);
    expect(res.status(), "drain should stay authorized").toBe(200);
    const body = (await res.json()) as Pull;
    cursor = body.nextCursor;
    if (!body.hasMore) return cursor;
  }
  throw new Error("feed never reached its tip in 100 pages");
}

// An API context inherits the project's signed-in `storageState`, so anonymity
// has to be stated explicitly — otherwise these requests silently carry the
// harness session and assert nothing.
const ANONYMOUS = { cookies: [], origins: [] };

test("sync/pull: an unauthenticated device is rejected", async ({ baseURL }) => {
  const anon = await playwrightRequest.newContext({ baseURL, storageState: ANONYMOUS });
  const res = await anon.get("/api/sync/pull?cursor=0");
  expect(res.status()).toBe(401);
  expect((await res.json()).error).toMatch(/not signed in/i);
  await anon.dispose();
});

test("sync/pull: an insert arrives as an upsert with its row, a delete as an explicit delete", async ({
  request,
  scratch,
}) => {
  const admin = createClient(env("TEST_SUPABASE_URL"), env("TEST_SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false },
  });

  // Start from the tip so the window holds only what this test does.
  const tip = await drainToTip(request);

  const { data: logbooks } = await admin.from("logbook").select("id").eq("aircraft_id", scratch.id).limit(1);
  const pageId = randomUUID();
  const { error } = await admin.from("page").insert({
    id: pageId,
    aircraft_id: scratch.id,
    logbook_id: logbooks![0].id,
    storage_path: `${scratch.id}/sync-e2e.jpg`,
    page_sequence: 7,
    review_status: "unreviewed",
    extraction_status: "pending",
  });
  expect(error, `seed page: ${error?.message}`).toBeFalsy();

  // --- 1. the insert shows up as an upsert carrying the live row ------------
  const afterInsert = (await (await request.get(`/api/sync/pull?cursor=${tip}`)).json()) as Pull;
  const upsert = afterInsert.changes.find((c) => c.table === "page" && c.id === pageId);
  expect(upsert, "the new page must appear in the feed").toBeTruthy();
  expect(upsert!.op).toBe("upsert");
  expect((upsert as Extract<Change, { op: "upsert" }>).row.page_sequence).toBe(7);
  expect(afterInsert.nextCursor, "cursor advances past the tip").toBeGreaterThan(tip);

  // --- 2. the cursor CONVERGES: re-pulling from the tip yields nothing ------
  const drained = await drainToTip(request, afterInsert.nextCursor);
  const idle = (await (await request.get(`/api/sync/pull?cursor=${drained}`)).json()) as Pull;
  expect(idle.changes, "a caught-up device pulls an empty window").toEqual([]);
  expect(idle.hasMore).toBe(false);
  expect(idle.nextCursor, "an empty window echoes the cursor").toBe(drained);

  // --- 3. a hard delete propagates as an explicit delete op ----------------
  await admin.from("page").delete().eq("id", pageId);
  const afterDelete = (await (await request.get(`/api/sync/pull?cursor=${drained}`)).json()) as Pull;
  const del = afterDelete.changes.find((c) => c.table === "page" && c.id === pageId);
  expect(del, "the deleted page must still be announced").toBeTruthy();
  expect(del!.op, "hard deletes must arrive as `delete`, not vanish").toBe("delete");
  expect(del).not.toHaveProperty("row");
});

test("sync/pull: deleting the AIRCRAFT itself propagates, not just its children", async ({
  request,
}) => {
  // Deleting a child row is already covered above, and it works — the aircraft
  // still exists, so change_log's `has_aircraft_access(aircraft_id)` still says
  // yes. Deleting the AIRCRAFT is the case that breaks: the read policy derives
  // access from a row that the delete just removed, so the tombstone announcing
  // the deletion is hidden from the only device that needs it. The plane then
  // lives forever on the phone, which is exactly what was reported from the
  // field after a full sync.
  const admin = createClient(env("TEST_SUPABASE_URL"), env("TEST_SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false },
  });

  const { data: profile } = await admin
    .from("profile")
    .select("id")
    .eq("email", env("TEST_USER_EMAIL"))
    .single();

  // Our own throwaway aircraft — the `scratch` fixture's is torn down for us and
  // we need to control exactly when the delete lands relative to the cursor.
  const id = randomUUID();
  const { error: ae } = await admin.from("aircraft").insert({
    id,
    owner_id: profile!.id,
    tail_number: `NDEL${id.slice(0, 4).toUpperCase()}`,
    make: "Cessna",
    model: "172",
    engine_serials: [],
    prop_serials: [],
  });
  expect(ae, `seed aircraft: ${ae?.message}`).toBeFalsy();

  try {
    // It must be in the feed while it exists — otherwise the delete assertion
    // below could pass for the wrong reason (nothing was ever visible).
    const beforeTip = await drainToTip(request);
    expect(beforeTip, "the insert must have advanced the feed").toBeGreaterThan(0);

    await admin.from("aircraft").delete().eq("id", id);

    const after = (await (await request.get(`/api/sync/pull?cursor=${beforeTip}&limit=1000`)).json()) as Pull;
    const del = after.changes.find((c) => c.table === "aircraft" && c.id === id);
    expect(del, "a deleted aircraft must still be announced to devices that had it").toBeTruthy();
    expect(del!.op, "it must arrive as `delete` so the client drops it locally").toBe("delete");
  } finally {
    await admin.from("aircraft").delete().eq("id", id);
  }
});

test("sync/pull: the feed is RLS-scoped — another tenant's device pulls nothing of ours", async ({
  request,
  scratch,
  baseURL,
}) => {
  const admin = createClient(env("TEST_SUPABASE_URL"), env("TEST_SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false },
  });

  // Our own device can see the scratch aircraft somewhere in its feed.
  await drainToTip(request);

  // A brand-new user with no aircraft and no shares.
  const email = `sync-victim-${randomUUID().slice(0, 8)}@e2e.invalid`;
  const password = randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const outsiderId = created.data.user!.id;

  try {
    const db = createClient(env("TEST_SUPABASE_URL"), env("TEST_SUPABASE_ANON_KEY"), {
      auth: { persistSession: false },
    });
    const { data: session, error } = await db.auth.signInWithPassword({ email, password });
    expect(error, `outsider sign-in: ${error?.message}`).toBeFalsy();

    // Their device pulls from the very beginning with a Bearer token — which is
    // also the mobile auth path (a WKWebView carries no cookies).
    const outsider = await playwrightRequest.newContext({
      baseURL,
      // Empty jar is essential: with the harness cookies present, a broken
      // Bearer path would fall back to OUR session and the test would pass
      // while proving nothing.
      storageState: ANONYMOUS,
      extraHTTPHeaders: { Authorization: `Bearer ${session.session!.access_token}` },
    });
    const res = await outsider.get("/api/sync/pull?cursor=0&limit=1000");
    expect(res.status(), "Bearer auth must be accepted (the mobile path)").toBe(200);

    const body = (await res.json()) as Pull;
    const ours = body.changes.filter(
      (c) => c.id === scratch.id || (c.op === "upsert" && c.row.aircraft_id === scratch.id),
    );
    expect(ours, "an outsider's feed must not contain our aircraft or its rows").toEqual([]);
    await outsider.dispose();
  } finally {
    // The auto-created demo aircraft cascades with the user.
    await admin.auth.admin.deleteUser(outsiderId);
  }
});

import { test, expect } from "./fixtures";
import { createClient } from "@supabase/supabase-js";

// The native app's offline write queue drains into POST /api/aircraft/[id]/actions.
// Everything the phone records — a tach reading typed at the airplane, a VOR
// check, oil added, a squawk — arrives here, usually retried over a flaky cell
// connection. So the two things that must hold are: it writes what was recorded,
// and a REPLAY writes nothing the second time.
//
// The route accepts a Supabase Bearer token (the app) or the normal cookie
// session (this test) — see lib/supabase/sync.ts.

const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`missing ${k}`);
  return v;
};

test("actions: offline queue drains, is idempotent, and completes a VOR check", async ({
  request,
  playwright,
  scratch,
}) => {
  test.setTimeout(120_000);

  const admin = createClient(env("TEST_SUPABASE_URL"), env("TEST_SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false },
  });

  // --- Unauthenticated callers get nothing ---------------------------------
  const anon = await playwright.request.newContext({
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    storageState: { cookies: [], origins: [] },
  });
  try {
    const denied = await anon.post(`/api/aircraft/${scratch.id}/actions`, {
      data: { actions: [{ id: "x", type: "reading", tach: 1 }] },
    });
    expect(denied.status(), "an anonymous caller must not be able to write").toBe(401);
  } finally {
    await anon.dispose();
  }

  // --- A meter reading recorded at the aircraft ----------------------------
  const readingId = crypto.randomUUID();
  const post = (actions: unknown[]) =>
    request.post(`/api/aircraft/${scratch.id}/actions`, { data: { actions }, timeout: 60_000 });

  const res = await post([{ id: readingId, type: "reading", date: "2026-08-12", tach: 1500.4, hobbs: 900.2 }]);
  expect(res.ok(), `actions failed: ${res.status()}`).toBeTruthy();
  expect((await res.json()).results).toEqual([{ id: readingId, ok: true }]);

  const readings = async () => {
    const { data } = await admin
      .from("hours_reading")
      .select("tach, hobbs, source, external_ref")
      .eq("aircraft_id", scratch.id);
    return data ?? [];
  };
  await expect.poll(readings, { timeout: 15_000 }).toHaveLength(1);
  expect((await readings())[0]).toMatchObject({
    tach: 1500.4,
    hobbs: 900.2,
    source: "manual",
    external_ref: readingId,
  });

  // --- Replay writes nothing -----------------------------------------------
  // The phone re-sends when a response is lost, which on a cell connection at an
  // airport is routine. A second row here would corrupt the hours history.
  const replay = await post([{ id: readingId, type: "reading", date: "2026-08-12", tach: 1500.4, hobbs: 900.2 }]);
  expect(replay.ok()).toBeTruthy();
  expect(await readings(), "a replayed action must not write a second row").toHaveLength(1);

  // --- One bad action must not discard the rest of the batch ---------------
  const oilId = crypto.randomUUID();
  const mixed = await post([
    { id: "bad-1", type: "nonsense" },
    { id: oilId, type: "oil", date: "2026-08-12", quarts: 1.5, tach: 1500.4 },
  ]);
  expect(mixed.ok()).toBeTruthy();
  const results = (await mixed.json()).results as { id: string; ok: boolean; error?: string }[];
  expect(results.find((r) => r.id === "bad-1")?.ok).toBe(false);
  expect(results.find((r) => r.id === oilId)?.ok, "a good action alongside a bad one must still apply").toBe(true);

  const { data: oil } = await admin.from("oil_addition").select("quarts").eq("aircraft_id", scratch.id);
  expect(oil).toHaveLength(1);
  expect(Number(oil?.[0].quarts)).toBe(1.5);

  // --- The VOR check: counter reset AND the 91.171(d) record ---------------
  const { data: item, error: itemError } = await admin
    .from("maintenance_item")
    .insert({
      aircraft_id: scratch.id,
      kind: "vor",
      label: "VOR check (91.171) — IFR",
      regulatory: true,
      interval_months: 1,
      interval_hours: null,
    })
    .select("id")
    .single();
  if (itemError) throw new Error(`seeding the VOR item failed: ${itemError.message}`);

  const { data: logbook } = await admin
    .from("logbook")
    .select("id")
    .eq("aircraft_id", scratch.id)
    .eq("type", "airframe")
    .single();

  const vorId = crypto.randomUUID();
  const vor = await post([
    {
      id: vorId,
      type: "mx_complete",
      item_id: item.id,
      date: "2026-08-12",
      hours: 1500.4,
      tach: 1500.4,
      logbook_id: logbook?.id,
      description: "VOR accuracy check — KCDW VOT, bearing error +2°",
      work_performed:
        "VOR receiver accuracy check performed per 14 CFR 91.171. Place: KCDW VOT. Bearing error: +2°.",
      signature_name: "E2E Pilot",
    },
  ]);
  expect(vor.ok()).toBeTruthy();
  expect((await vor.json()).results).toEqual([{ id: vorId, ok: true }]);

  // The counter reset, with next-due from the shared maintenanceNextDue().
  const { data: after } = await admin
    .from("maintenance_item")
    .select("last_done_date, last_done_hours, next_due_date")
    .eq("id", item.id)
    .single();
  expect(after).toMatchObject({
    last_done_date: "2026-08-12",
    last_done_hours: 1500.4,
    next_due_date: "2026-09-12", // exact months: 91.171 is "preceding 30 days", not calendar months
  });

  // …and the legal record, which is the half a checkbox would have missed.
  const { data: entries } = await admin
    .from("log_entry")
    .select("id, entry_date, description, work_performed, signature_name")
    .eq("aircraft_id", scratch.id);
  expect(entries).toHaveLength(1);
  expect(entries?.[0]).toMatchObject({
    id: vorId,
    entry_date: "2026-08-12",
    signature_name: "E2E Pilot",
  });
  expect(entries?.[0].work_performed).toContain("91.171");
  expect(entries?.[0].work_performed).toContain("+2°");

  // Replaying the VOR check must not write a second log entry either.
  await post([
    {
      id: vorId,
      type: "mx_complete",
      item_id: item.id,
      date: "2026-08-12",
      hours: 1500.4,
      logbook_id: logbook?.id,
      description: "VOR accuracy check — KCDW VOT, bearing error +2°",
      signature_name: "E2E Pilot",
    },
  ]);
  const { data: entriesAgain } = await admin.from("log_entry").select("id").eq("aircraft_id", scratch.id);
  expect(entriesAgain, "a replayed VOR check must not duplicate the log entry").toHaveLength(1);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { loadFleetStatus } from "../src/lib/due/fleet";
import { DUE_TABLE_COLUMNS } from "../src/lib/due/columns";
import { computeStatus } from "../src/lib/due/engine";
import { todayIn, type MapInput } from "../src/lib/mapModel";

type Row = Record<string, unknown>;
function fixture(tables: Record<string, Row[]>, rogue = false) {
  const calls: { table: string; ids?: unknown[]; range?: [number, number] }[] = [];
  const client = {
    from(table: string) {
      let key = "", values: unknown[] = [], bounds: [number, number] | undefined;
      const execute = () => {
        calls.push({ table, ids: values, range: bounds });
        let rows = table === "profile" ? [{ time_zone: "UTC" }] : (tables[table] ?? [])
          .filter((row) => values.includes(row[key]));
        if (bounds) rows = rows.slice(bounds[0], bounds[1] + 1);
        if (rogue && table === "maintenance_item" && bounds?.[0] === 0)
          rows = [...rows, { id: "foreign-item", aircraft_id: "foreign", kind: "annual" }];
        return { data: rows, error: null };
      };
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => { key = column; values = [value]; return builder; },
        in: (column: string, ids: unknown[]) => { key = column; values = ids; return builder; },
        order: () => builder,
        range: (start: number, end: number) => { bounds = [start, end]; return builder; },
        maybeSingle: async () => { const result = execute(); return { ...result, data: result.data[0] ?? null }; },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(execute()).then(resolve),
      };
      return builder;
    },
  } as unknown as SupabaseClient<Database>;
  return { client, calls };
}
const annual = (id: string, date: string) => ({
  id: `annual-${id}`, aircraft_id: id, kind: "annual", label: "Annual", regulatory: true,
  interval_months: 12, interval_hours: null, last_done_date: date, last_done_hours: null,
});

test("fleet status preserves canonical verdicts, scopes every aircraft and paginates review counts", async () => {
  const today = todayIn("UTC");
  const aircraft = [{ id: "a", tail_number: "NA" }, { id: "b", tail_number: "NB" }];
  const items = [annual("a", "2000-01-01"), annual("b", today)];
  const entries = Array.from({ length: 1001 }, (_, i) => ({
    id: `entry-${String(i).padStart(4, "0")}`, aircraft_id: "a", logbook_id: "book-a",
    page_id: `page-${Math.floor(i / 2)}`, owner_confirmed: i < 600, trust: "ai_read", entry_date: today,
  }));
  const { client, calls } = fixture({ aircraft, maintenance_item: items, log_entry: entries }, true);
  const result = await loadFleetStatus(client, ["a", "b", "foreign", "a"], "user");
  assert.deepEqual([...result.keys()], ["a", "b"]);
  for (const a of aircraft) {
    const input = { aircraft: a, maintenance_item: items.filter((r) => r.aircraft_id === a.id),
      log_entry: entries.filter((r) => r.aircraft_id === a.id) } as unknown as MapInput;
    assert.deepEqual(result.get(a.id)?.snap, computeStatus(input, today));
  }
  assert.equal(result.get("a")?.confirmed, 600);
  assert.equal(result.get("a")?.waiting, 201);
  assert.equal(result.get("b")?.confirmed, 0);
  assert.equal(calls.filter((c) => c.table === "log_entry").length, 3);
  assert.ok(calls.filter((c) => c.table !== "profile" && c.table !== "aircraft")
    .every((c) => !c.ids?.includes("foreign")));
  assert.ok(!calls.some((c) => c.table === "change_log"));
});

test("fleet query count scales by chunks rather than per-aircraft snapshots", async () => {
  const aircraft = Array.from({ length: 76 }, (_, i) => ({ id: `aircraft-${i}`, tail_number: `NT${i}` }));
  const { client, calls } = fixture({ aircraft });
  const result = await loadFleetStatus(client, aircraft.map((a) => a.id), "user");
  assert.equal(result.size, 76);
  assert.equal(calls.length, 1 + 2 * (1 + Object.keys(DUE_TABLE_COLUMNS).length));
  assert.ok(calls.every((c) => (c.ids?.length ?? 0) <= 75));
});

test("an empty fleet does not query the database", async () => {
  const { client, calls } = fixture({});
  assert.equal((await loadFleetStatus(client, [], "user")).size, 0);
  assert.equal(calls.length, 0);
});

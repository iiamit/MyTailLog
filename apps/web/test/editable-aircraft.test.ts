import { test } from "node:test";
import assert from "node:assert/strict";
import { editableAircraft } from "../src/lib/editableAircraft";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
test("scheduled meter sync and reminders both exclude viewer-only shares", async () => {
  const records = {
    aircraft: [{ id: "own", owner_id: "me", is_demo: false }, { id: "editor", owner_id: "else", is_demo: false }, { id: "viewer", owner_id: "else", is_demo: false }, { id: "demo", owner_id: "me", is_demo: true }],
    aircraft_share: [{ aircraft_id: "editor", invited_email: "me@example.org", role: "editor" }, { aircraft_id: "viewer", invited_email: "me@example.org", role: "viewer" }],
  };
  const client = { from(table: keyof typeof records) {
    let rows: Record<string, unknown>[] = records[table];
    const q = {
      select: () => q,
      eq: (key: string, value: unknown) => (rows = rows.filter((r) => r[key] === value), q),
      ilike: (key: string, value: string) => (rows = rows.filter((r) => String(r[key]).toLowerCase() === value.toLowerCase()), q),
      in: (key: string, values: unknown[]) => (rows = rows.filter((r) => values.includes(r[key])), q),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
    };
    return q;
  } } as unknown as SupabaseClient<Database>;
  assert.deepEqual((await editableAircraft(client, "me", "me@example.org")).map((r) => r.id), ["own", "demo", "editor"]);
  assert.deepEqual((await editableAircraft(client, "me", "me@example.org", true)).map((r) => r.id), ["own", "editor"]);
});

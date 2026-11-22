import { test } from "node:test";
import assert from "node:assert/strict";
import { withJobLease } from "../src/lib/jobLease";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

test("overlapping runs cannot deliver under the same active lease; failures release for retry", async () => {
  const held = new Map<string, string>();
  const svc = { async rpc(name: string, args: { p_key: string; p_token?: string }) {
    if (name === "claim_background_job") {
      if (held.has(args.p_key)) return { data: null, error: null };
      const token = crypto.randomUUID(); held.set(args.p_key, token); return { data: token, error: null };
    }
    if (held.get(args.p_key) === args.p_token) held.delete(args.p_key);
    return { data: null, error: null };
  } } as unknown as SupabaseClient<Database>;
  let done!: () => void;
  let entered!: () => void;
  const active = new Promise<void>((resolve) => entered = resolve);
  const gate = new Promise<void>((resolve) => done = resolve);
  const first = withJobLease(svc, "reminders:u", async () => { entered(); await gate; return "sent"; });
  await active;
  assert.equal(await withJobLease(svc, "reminders:u", async () => assert.fail("duplicate delivery")), null);
  done(); assert.equal(await first, "sent");
  await assert.rejects(withJobLease(svc, "reminders:u", async () => { throw new Error("network"); }), /network/);
  assert.equal(await withJobLease(svc, "reminders:u", async () => "retry"), "retry");
});

test("missing migration fails closed instead of sending without deduplication", async () => {
  const svc = { rpc: async () => ({ data: null, error: { message: "function missing" } }) } as unknown as SupabaseClient<Database>;
  await assert.rejects(withJobLease(svc, "reminders:u", async () => assert.fail("unprotected send")), /function missing/);
});

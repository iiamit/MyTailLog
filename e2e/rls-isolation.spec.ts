import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

// Multi-tenant isolation as EXECUTABLE regression guards. RLS is the app's
// primary isolation boundary; the security audit verified these by reading —
// this proves them against the live TEST schema and catches a policy regression
// (a dropped WITH CHECK, a re-granted column) that unit tests can't see.
//
// Pure DB test: no browser/page. The "attacker" is the harness user acting as
// themselves (anon key + real session → RLS applies); the "victim" is a
// throwaway user whose data the attacker must never reach.
const env = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`missing ${k}`);
  return v;
};

test.describe.configure({ mode: "serial" });

test.describe("RLS multi-tenant isolation", () => {
  let admin: SupabaseClient;
  let attackerDb: SupabaseClient;
  let attackerId: string;
  let attackerEmail: string;
  let victimId: string;
  let victimAc: string;

  test.beforeAll(async () => {
    admin = createClient(env("TEST_SUPABASE_URL"), env("TEST_SUPABASE_SECRET_KEY"), {
      auth: { persistSession: false },
    });
    attackerEmail = env("TEST_USER_EMAIL");
    const { data: prof, error: pe } = await admin
      .from("profile")
      .select("id")
      .eq("email", attackerEmail)
      .single();
    if (pe || !prof) throw new Error(`harness profile not found: ${pe?.message}`);
    attackerId = prof.id;

    // Victim user (profile auto-created by the handle_new_user trigger) + an
    // owned aircraft + a child row.
    const vu = await admin.auth.admin.createUser({
      email: `victim-${randomUUID().slice(0, 8)}@e2e.invalid`,
      password: randomUUID(),
      email_confirm: true,
    });
    victimId = vu.data.user!.id;
    victimAc = randomUUID();
    await admin.from("aircraft").insert({
      id: victimAc,
      owner_id: victimId,
      tail_number: "NV" + victimAc.slice(0, 4).toUpperCase(),
      engine_serials: [],
      prop_serials: [],
    });
    await admin
      .from("maintenance_item")
      .insert({ aircraft_id: victimAc, kind: "annual", label: "Annual Inspection" });

    // Attacker acting as themselves — anon key + real session, so RLS applies.
    attackerDb = createClient(env("TEST_SUPABASE_URL"), env("TEST_SUPABASE_ANON_KEY"), {
      auth: { persistSession: false },
    });
    const { error } = await attackerDb.auth.signInWithPassword({
      email: attackerEmail,
      password: env("TEST_USER_PASSWORD"),
    });
    if (error) throw new Error(`attacker sign-in failed: ${error.message}`);
  });

  test.afterAll(async () => {
    if (admin && victimAc) await admin.from("aircraft").delete().eq("id", victimAc); // cascades children
    if (admin && victimId) await admin.auth.admin.deleteUser(victimId);
    if (admin && attackerId) await admin.rpc("delete_ai_key", { p_user_id: attackerId });
  });

  test("cannot read another user's aircraft", async () => {
    const { data } = await attackerDb.from("aircraft").select("id").eq("id", victimAc);
    expect(data).toEqual([]);
  });

  test("cannot read another user's child rows (maintenance_item)", async () => {
    const { data } = await attackerDb.from("maintenance_item").select("id").eq("aircraft_id", victimAc);
    expect(data).toEqual([]);
  });

  test("cannot update another user's aircraft (RLS hides the row)", async () => {
    const { data, error } = await attackerDb
      .from("aircraft")
      .update({ make: "HACKED" })
      .eq("id", victimAc)
      .select("id");
    expect(error).toBeFalsy();
    expect(data).toEqual([]); // 0 rows matched the USING policy
    const { data: check } = await admin.from("aircraft").select("make").eq("id", victimAc).single();
    expect(check!.make).not.toBe("HACKED");
  });

  test("cannot insert a child row onto another user's aircraft (WITH CHECK)", async () => {
    const { error } = await attackerDb
      .from("maintenance_item")
      .insert({ aircraft_id: victimAc, kind: "annual", label: "injected" });
    expect(error, "WITH CHECK must reject a write onto a non-owned aircraft").toBeTruthy();
  });

  test("cannot share another user's aircraft to themselves (share self-escalation)", async () => {
    const { error } = await attackerDb.from("aircraft_share").insert({
      aircraft_id: victimAc,
      invited_email: attackerEmail,
      role: "editor",
      invited_by: attackerId,
    });
    expect(error, "share WITH CHECK must require ownership of the aircraft").toBeTruthy();
  });

  test("cannot forge an ai_usage ledger row (insert revoked)", async () => {
    const { error } = await attackerDb
      .from("ai_usage")
      .insert({ user_id: attackerId, route: "forge", model: "x", cost_usd: -1000 });
    expect(error, "ai_usage insert is revoked from the client").toBeTruthy();
  });

  test("BYOK ciphertext is unreachable by the browser role; only key_last4 is exposed (0039)", async () => {
    // Seed via the service-role RPC (the table is in a private schema now).
    await admin.rpc("upsert_ai_key", {
      p_user_id: attackerId,
      p_cipher: "v1:not-a-real-secret",
      p_last4: "1234",
    });

    // The base table is not exposed to PostgREST at all → a direct read fails.
    const direct = await attackerDb.from("user_ai_key").select("key_cipher").eq("user_id", attackerId);
    expect(
      direct.error || (direct.data?.[0] as { key_cipher?: string } | undefined)?.key_cipher == null,
      "the private user_ai_key table must not be REST-readable",
    ).toBeTruthy();

    // The service-only cipher accessor is not granted to the browser role.
    const viaRpc = await attackerDb.rpc("ai_key_cipher", { p_user_id: attackerId });
    expect(viaRpc.data ?? null, "ai_key_cipher must not return the ciphertext to the browser").toBeNull();

    // But the browser CAN read its own key_last4 via the definer function.
    const last4 = await attackerDb.rpc("my_ai_key_last4");
    expect(last4.error).toBeFalsy();
    expect(last4.data).toBe("1234");
  });

  test("cannot self-promote to admin (profile column lockdown 0028)", async () => {
    const { error } = await attackerDb.from("profile").update({ is_admin: true }).eq("id", attackerId);
    expect(error, "is_admin UPDATE must be denied at the column level").toBeTruthy();
    const { data } = await admin.from("profile").select("is_admin").eq("id", attackerId).single();
    expect(data!.is_admin).not.toBe(true);
  });
});

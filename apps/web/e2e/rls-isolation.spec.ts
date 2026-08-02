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
    // Fully reset the seeded MFB connection — the harness account is reused
    // across runs, so a leftover fake connection would skew later tests. Three
    // calls because upsert deliberately KEEPS the secret when passed null.
    if (admin && attackerId) {
      await admin.rpc("disconnect_mfb", { p_user_id: attackerId });
      await admin.rpc("set_mfb_client_secret", { p_user_id: attackerId, p_cipher: null });
      await admin.rpc("upsert_mfb_credentials", {
        p_user_id: attackerId,
        p_client_id: null,
        p_mfb_username: null,
        p_client_secret_cipher: null,
      });
    }
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

  test("a read-only viewer can read but cannot write documents (0041 write policy)", async () => {
    // Grant the harness user viewer access to the victim's aircraft.
    await admin.from("aircraft_share").insert({
      aircraft_id: victimAc,
      invited_email: attackerEmail,
      role: "viewer",
      invited_by: victimId,
    });
    try {
      // The share now grants READ access to the victim aircraft…
      const read = await attackerDb.from("aircraft").select("id").eq("id", victimAc);
      expect(read.data?.length, "viewer share should grant read access").toBe(1);
      // …but the document write policy is can_edit_aircraft, so a viewer can't write
      // (0041 split it from the old `for all` policy that let any viewer write).
      const write = await attackerDb
        .from("document")
        .insert({ aircraft_id: victimAc, type: "other", title: "injected" });
      expect(write.error, "a read-only viewer must not be able to write documents").toBeTruthy();
    } finally {
      await admin
        .from("aircraft_share")
        .delete()
        .eq("aircraft_id", victimAc)
        .eq("invited_email", attackerEmail);
    }
  });

  // WP3: the entry↔document attachment is a plain column on `document`
  // (0041 `log_entry_id`), and RLS scopes ROWS, not COLUMNS — so the only thing
  // standing between a read-only viewer and re-linking someone else's records is
  // the document_write policy. Prove attach AND detach are both refused.
  test("a viewer cannot attach or detach a document to a log entry (0041 log_entry_id)", async () => {
    await admin.from("aircraft_share").insert({
      aircraft_id: victimAc,
      invited_email: attackerEmail,
      role: "viewer",
      invited_by: victimId,
    });
    let docId: string | undefined;
    let entryId: string | undefined;
    try {
      const { data: lb } = await admin
        .from("logbook")
        .insert({ aircraft_id: victimAc, type: "airframe" })
        .select("id")
        .single();
      const { data: entry } = await admin
        .from("log_entry")
        .insert({ aircraft_id: victimAc, logbook_id: lb!.id, description: "victim entry" })
        .select("id")
        .single();
      entryId = entry!.id;
      const { data: doc } = await admin
        .from("document")
        .insert({ aircraft_id: victimAc, type: "other", title: "victim doc", log_entry_id: entryId })
        .select("id")
        .single();
      docId = doc!.id;

      // The viewer can READ both (has_aircraft_access)…
      const read = await attackerDb.from("document").select("id, log_entry_id").eq("id", docId);
      expect(read.data?.length, "a viewer should be able to read documents").toBe(1);
      expect(read.data![0].log_entry_id).toBe(entryId);

      // …but cannot DETACH (update → 0 rows, no error: RLS filters the row out).
      const detach = await attackerDb
        .from("document")
        .update({ log_entry_id: null })
        .eq("id", docId)
        .select("id");
      expect(detach.error).toBeFalsy();
      expect(detach.data, "a viewer must not be able to detach a document").toEqual([]);

      // …nor ATTACH it somewhere else.
      const attach = await attackerDb
        .from("document")
        .update({ log_entry_id: entryId })
        .eq("id", docId)
        .select("id");
      expect(attach.error).toBeFalsy();
      expect(attach.data, "a viewer must not be able to attach a document").toEqual([]);

      // The link is untouched.
      const { data: after } = await admin
        .from("document")
        .select("log_entry_id")
        .eq("id", docId)
        .single();
      expect(after!.log_entry_id).toBe(entryId);
    } finally {
      if (docId) await admin.from("document").delete().eq("id", docId);
      if (entryId) await admin.from("log_entry").delete().eq("id", entryId);
      await admin.from("aircraft_share").delete().eq("aircraft_id", victimAc).eq("invited_email", attackerEmail);
    }
  });

  test("a viewer can REPORT a squawk but cannot RESOLVE it (0043 policy)", async () => {
    await admin.from("aircraft_share").insert({
      aircraft_id: victimAc,
      invited_email: attackerEmail,
      role: "viewer",
      invited_by: victimId,
    });
    let squawkId: string | undefined;
    try {
      // A viewer (pilot) may report — as themselves.
      const report = await attackerDb
        .from("squawk")
        .insert({ aircraft_id: victimAc, description: "viewer report", severity: "low", reported_by: attackerId })
        .select("id")
        .single();
      expect(report.error, "a viewer should be able to report a squawk").toBeFalsy();
      squawkId = report.data!.id;

      // …but cannot resolve it (update requires can_edit) — 0 rows, stays open.
      const resolve = await attackerDb
        .from("squawk")
        .update({ status: "resolved" })
        .eq("id", squawkId)
        .select("id");
      expect(resolve.error).toBeFalsy();
      expect(resolve.data, "a viewer must not be able to resolve a squawk").toEqual([]);
      const { data: after } = await admin.from("squawk").select("status").eq("id", squawkId).single();
      expect(after!.status).toBe("open");
    } finally {
      if (squawkId) await admin.from("squawk").delete().eq("id", squawkId);
      await admin.from("aircraft_share").delete().eq("aircraft_id", victimAc).eq("invited_email", attackerEmail);
    }
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

  test("MFB credentials are unreachable by the browser role; only non-secret state is exposed (0047)", async () => {
    // Seed a connection via the service-role RPC (the table is private now).
    await admin.rpc("upsert_mfb_credentials", {
      p_user_id: attackerId,
      p_client_id: "e2e-client-id",
      p_mfb_username: "e2e-pilot",
      p_client_secret_cipher: "v1:not-a-real-mfb-secret",
    });
    await admin.rpc("set_mfb_tokens", {
      p_user_id: attackerId,
      p_access: "v1:not-a-real-access-token",
      p_refresh: "v1:not-a-real-refresh-token",
      p_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      p_mark_connected: true,
    });

    // RLS scopes rows, not columns — this is the leak 0047 closed. The base
    // table must not be reachable through PostgREST at all.
    const direct = await attackerDb
      .from("mfb_connection")
      .select("client_secret, access_token, refresh_token")
      .eq("user_id", attackerId);
    const leaked = direct.data?.[0] as
      | { client_secret?: string; access_token?: string; refresh_token?: string }
      | undefined;
    expect(
      direct.error || (leaked?.client_secret == null && leaked?.access_token == null),
      "the private mfb_connection table must not be REST-readable",
    ).toBeTruthy();

    // The service-only secret accessor is not granted to the browser role.
    const viaRpc = await attackerDb.rpc("mfb_conn_secrets", { p_user_id: attackerId });
    const rows = (viaRpc.data ?? []) as { client_secret?: string }[];
    expect(
      viaRpc.error || rows.length === 0,
      "mfb_conn_secrets must not return credentials to the browser",
    ).toBeTruthy();

    // But the browser CAN read its own non-secret connection state.
    const status = await attackerDb.rpc("my_mfb_status");
    expect(status.error).toBeFalsy();
    const s = (status.data as { client_id: string; mfb_username: string; connected: boolean; has_secret: boolean }[])[0];
    expect(s.client_id).toBe("e2e-client-id");
    expect(s.mfb_username).toBe("e2e-pilot");
    expect(s.connected, "holds a token → connected").toBe(true);
    expect(s.has_secret, "a client secret is configured").toBe(true);
    // …and that payload carries no ciphertext of any kind.
    expect(JSON.stringify(s)).not.toContain("v1:");
  });

  test("cannot self-promote to admin (profile column lockdown 0028)", async () => {
    const { error } = await attackerDb.from("profile").update({ is_admin: true }).eq("id", attackerId);
    expect(error, "is_admin UPDATE must be denied at the column level").toBeTruthy();
    const { data } = await admin.from("profile").select("is_admin").eq("id", attackerId).single();
    expect(data!.is_admin).not.toBe(true);
  });
});

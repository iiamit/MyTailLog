import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveAlerts } from "@/lib/reminders";
import { BACKUP_PROVIDERS, getProvider } from "@/lib/backup/providers";
import { formatBytes } from "@/lib/backup/schedule";
import { AccountShell } from "@/components/shell/AccountShell";
import { ProfileClient } from "./ProfileClient";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/profile");

  const { data: profile } = await supabase
    .from("profile")
    .select("full_name, cert_number, preferences, is_admin")
    .eq("id", user.id)
    .single();

  // MyFlightBook: the credentials live in a private schema (0047); this RPC
  // returns only non-sensitive state — never the client secret or tokens.
  const { data: mfbRows } = await supabase.rpc("my_mfb_status");
  const mfb = mfbRows?.[0];

  // Cloud backups (0049/0050): same rule — the destination's OAuth tokens live
  // in the private schema and this RPC returns state only, never ciphertext.
  // One row per CONNECTED destination, so the full provider list is merged in
  // here: a provider the user hasn't connected still needs a card.
  const { data: backupRows } = await supabase.rpc("my_backup_destinations");
  const backups = BACKUP_PROVIDERS.map(({ id, name }) => {
    const row = backupRows?.find((r) => r.provider === id);
    return {
      id,
      name,
      // Null when this provider's CLIENT_ID/SECRET aren't provisioned — the card
      // then says so instead of offering a button that can't work.
      configured: getProvider(id) != null,
      connected: Boolean(row?.connected),
      accountLabel: row?.account_label ?? "",
      frequency: row?.frequency ?? "off",
      nextRunAt: row?.next_run_at ?? null,
      lastRunAt: row?.last_run_at ?? null,
      lastStatus: row?.last_status ?? null,
      // Formatted here: lib/backup/schedule pulls node:crypto, which has no
      // business in the client bundle.
      lastSize: row?.last_bytes != null ? formatBytes(row.last_bytes) : "",
      lastError: row?.last_error ?? null,
    };
  });

  // BYOK: whether the user has their own Anthropic key, and their usage/cost
  // ledger. Rows are summed here (a personal account's volume is small); move
  // to a SUM RPC only if the ledger ever grows large.
  const [{ data: keyLast4 }, { data: usage }] = await Promise.all([
    // key_last4 only — the ciphertext lives in a private schema (0039).
    supabase.rpc("my_ai_key_last4"),
    supabase.from("ai_usage").select("input_tokens, output_tokens, cost_usd, used_own_key"),
  ]);
  const own = (usage ?? []).filter((r) => r.used_own_key);
  const sum = (rows: typeof own, k: "input_tokens" | "output_tokens" | "cost_usd") =>
    rows.reduce((t, r) => t + (Number(r[k]) || 0), 0);
  const ai = {
    keyLast4: keyLast4 ?? null,
    calls: own.length,
    inputTokens: sum(own, "input_tokens"),
    outputTokens: sum(own, "output_tokens"),
    costUsd: sum(own, "cost_usd"),
    totalCalls: (usage ?? []).length,
  };

  // Connected apps (OAuth): the user's active per-aircraft grants, grouped by
  // app. Client display names come from the service client — RLS on oauth_client
  // is owner-scoped (the developer), so a grantee can't read it directly.
  const [{ data: grants }, { data: acctGrants }] = await Promise.all([
    supabase
      .from("oauth_aircraft_grant")
      .select("client_id, aircraft_id, scopes, created_at")
      .is("revoked_at", null),
    supabase.from("oauth_account_grant").select("client_id, scopes, created_at").is("revoked_at", null),
  ]);
  const grantRows = grants ?? [];
  const acctRows = acctGrants ?? [];
  const clientIds = [
    ...new Set([...grantRows.map((g) => g.client_id), ...acctRows.map((g) => g.client_id)]),
  ];
  const aircraftIds = [...new Set(grantRows.map((g) => g.aircraft_id))];
  const [names, tails] = await Promise.all([
    clientIds.length
      ? createServiceClient()
          .from("oauth_client")
          .select("client_id, name")
          .in("client_id", clientIds)
          .then(({ data }) => new Map((data ?? []).map((c) => [c.client_id, c.name])))
      : Promise.resolve(new Map<string, string>()),
    aircraftIds.length
      ? supabase
          .from("aircraft")
          .select("id, tail_number")
          .in("id", aircraftIds)
          .then(({ data }) => new Map((data ?? []).map((a) => [a.id, a.tail_number])))
      : Promise.resolve(new Map<string, string>()),
  ]);
  const appsByClient = new Map<
    string,
    { clientId: string; name: string; allAircraft: boolean; aircraft: Set<string>; scopes: Set<string>; since: string }
  >();
  const entryFor = (clientId: string, since: string) =>
    appsByClient.get(clientId) ??
    { clientId, name: names.get(clientId) ?? "An app", allAircraft: false, aircraft: new Set<string>(), scopes: new Set<string>(), since };
  for (const g of grantRows) {
    const e = entryFor(g.client_id, g.created_at);
    const tail = tails.get(g.aircraft_id);
    if (tail) e.aircraft.add(tail);
    for (const s of g.scopes ?? []) e.scopes.add(s);
    if (g.created_at < e.since) e.since = g.created_at;
    appsByClient.set(g.client_id, e);
  }
  for (const g of acctRows) {
    const e = entryFor(g.client_id, g.created_at);
    e.allAircraft = true; // account-wide grant covers every owned aircraft (incl. future)
    for (const s of g.scopes ?? []) e.scopes.add(s);
    if (g.created_at < e.since) e.since = g.created_at;
    appsByClient.set(g.client_id, e);
  }
  const connectedApps = [...appsByClient.values()].map((e) => ({
    clientId: e.clientId,
    name: e.name,
    allAircraft: e.allAircraft,
    aircraft: [...e.aircraft],
    scopes: [...e.scopes],
    since: e.since,
  }));

  return (
    <AccountShell>
      <main className="mx-auto max-w-2xl px-6 py-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow mb-2">Account</div>
            <h1 className="font-display text-[27px] font-semibold leading-none">Your profile</h1>
            <p className="mt-2 text-[13.5px] text-dim">{user.email}</p>
          </div>
          {profile?.is_admin && (
            <Link
              href="/admin"
              className="shrink-0 rounded-md border border-line px-3 py-1.5 text-sm text-dim hover:border-line2 hover:text-ink"
            >
              Admin dashboard →
            </Link>
          )}
        </header>

        <ProfileClient
          email={user.email ?? ""}
          fullName={profile?.full_name ?? ""}
          certNumber={profile?.cert_number ?? ""}
          notifyDue={Boolean(profile?.preferences?.notify_due)}
          alerts={resolveAlerts(profile?.preferences)}
          mfb={{
            clientId: mfb?.client_id ?? "",
            hasSecret: Boolean(mfb?.has_secret),
            connected: Boolean(mfb?.connected),
            username: mfb?.mfb_username ?? "",
          }}
          ai={ai}
          backups={backups}
          connectedApps={connectedApps}
        />
      </main>
    </AccountShell>
  );
}

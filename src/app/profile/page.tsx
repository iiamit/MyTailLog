import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveAlerts } from "@/lib/reminders";
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

  // MyFlightBook: only non-sensitive state reaches the browser — never the
  // client secret or tokens. `connected` = we hold a live access token.
  const { data: mfb } = await supabase
    .from("mfb_connection")
    .select("client_id, client_secret, access_token, mfb_username")
    .eq("user_id", user.id)
    .maybeSingle();

  // BYOK: whether the user has their own Anthropic key, and their usage/cost
  // ledger. Rows are summed here (a personal account's volume is small); move
  // to a SUM RPC only if the ledger ever grows large.
  const [{ data: aiKey }, { data: usage }] = await Promise.all([
    supabase.from("user_ai_key").select("key_last4").eq("user_id", user.id).maybeSingle(),
    supabase.from("ai_usage").select("input_tokens, output_tokens, cost_usd, used_own_key"),
  ]);
  const own = (usage ?? []).filter((r) => r.used_own_key);
  const sum = (rows: typeof own, k: "input_tokens" | "output_tokens" | "cost_usd") =>
    rows.reduce((t, r) => t + (Number(r[k]) || 0), 0);
  const ai = {
    keyLast4: aiKey?.key_last4 ?? null,
    calls: own.length,
    inputTokens: sum(own, "input_tokens"),
    outputTokens: sum(own, "output_tokens"),
    costUsd: sum(own, "cost_usd"),
    totalCalls: (usage ?? []).length,
  };

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
            hasSecret: Boolean(mfb?.client_secret),
            connected: Boolean(mfb?.access_token),
            username: mfb?.mfb_username ?? "",
          }}
          ai={ai}
        />
      </main>
    </AccountShell>
  );
}

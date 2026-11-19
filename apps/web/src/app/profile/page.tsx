import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveAlerts } from "@/lib/reminders";
import { AccountShell } from "@/components/shell/AccountShell";
import { ProfileClient } from "./ProfileClient";
import { loadSettings } from "./loadSettings";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/profile");

  const { profile, mfb, backups, ai, connectedApps } = await loadSettings(supabase, user.id);

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
          identities={(user.identities ?? []).map((identity) => identity.provider)}
          fullName={profile?.full_name ?? ""}
          notifyDue={Boolean(profile?.preferences?.notify_due)}
          onboardingEmailOn={!profile?.onboarding_opt_out}
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

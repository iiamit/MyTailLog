import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AccountShell } from "@/components/shell/AccountShell";
import { DATA_SCOPES } from "@/lib/oauth/scopes";
import { DevelopersClient } from "./DevelopersClient";

export const dynamic = "force-dynamic";

export default async function DevelopersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/developers");

  // RLS scopes this to the caller's own apps (owner_id = auth.uid()).
  const { data: apps } = await supabase
    .from("oauth_client")
    .select("client_id, name, redirect_uris, scopes, is_confidential, created_at")
    .order("created_at", { ascending: false });

  return (
    <AccountShell>
      <main className="mx-auto max-w-2xl px-6 py-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow mb-2">Account</div>
            <h1 className="font-display text-[27px] font-semibold leading-none">Developer API</h1>
            <p className="mt-2 text-[13.5px] text-dim">
              Register an app to read aircraft data (with each owner&apos;s consent) over OAuth 2.1.
            </p>
          </div>
          <Link
            href="/developers/docs"
            className="shrink-0 rounded-md border border-line px-3 py-1.5 text-sm text-dim hover:border-line2 hover:text-ink"
          >
            API docs →
          </Link>
        </header>

        <DevelopersClient apps={apps ?? []} dataScopes={[...DATA_SCOPES]} />
      </main>
    </AccountShell>
  );
}

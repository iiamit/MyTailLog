import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { InformationShell } from "@/components/InformationShell";
import { DATA_SCOPES } from "@/lib/oauth/scopes";
import { DevelopersClient } from "./DevelopersClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "API keys" };

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
    <InformationShell
      group="share"
      path="/developers"
      title="API keys"
      lede={<p>Register an app to read aircraft data, with each owner&apos;s consent, over OAuth 2.1. How it works is in the <Link href="/developers/docs">API docs</Link>.</p>}
    >
      <DevelopersClient apps={apps ?? []} dataScopes={[...DATA_SCOPES]} />
    </InformationShell>
  );
}

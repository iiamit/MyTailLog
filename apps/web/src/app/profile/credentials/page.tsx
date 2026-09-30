import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CredentialManager } from "./CredentialManager";

export default async function CredentialsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <main className="mx-auto max-w-2xl p-8">Sign in to manage signing credentials.</main>;
  const { data } = await supabase.from("signing_credential").select("id, kind, certificate_number, rating, user_id, created_at").eq("user_id", user.id);
  return <main className="mx-auto max-w-2xl px-6 py-8">
    <Link href="/profile" className="text-sm text-accent">← Profile</Link>
    <h1 className="mt-5 font-display text-2xl font-semibold">Signing credentials</h1>
    <p className="mt-2 text-sm text-dim">Enter the certificate you will use when signing maintenance entries. These details are self-declared; MyTailLog does not verify FAA privileges.</p>
    <CredentialManager initial={data ?? []} userId={user.id} />
  </main>;
}

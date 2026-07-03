import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileClient } from "./ProfileClient";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/profile");

  const { data: profile } = await supabase
    .from("profile")
    .select("full_name, cert_number, preferences")
    .eq("id", user.id)
    .single();

  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <Link
        href="/dashboard"
        className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        ← Your aircraft
      </Link>
      <header className="mb-6 mt-2">
        <h1 className="text-2xl font-bold">Your profile</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">{user.email}</p>
      </header>

      <ProfileClient
        email={user.email ?? ""}
        fullName={profile?.full_name ?? ""}
        certNumber={profile?.cert_number ?? ""}
        notifyDue={Boolean(profile?.preferences?.notify_due)}
      />
    </main>
  );
}

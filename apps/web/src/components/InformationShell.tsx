import { createClient } from "@/lib/supabase/server";
import { HangarShell } from "@/ui/HangarShell";
import { PublicTheme } from "@/components/PublicTheme";

/** Help and API docs remain public; signed-in readers keep the new Hangar rail. */
export async function InformationShell({ children }: { children: React.ReactNode }) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return <PublicTheme><div id="main-content" className="mx-auto my-7 max-w-4xl rounded-leaf bg-leaf text-ink shadow-leaf sm:my-10">{children}</div></PublicTheme>;
  const [{ data: profile }, { data: fleet }] = await Promise.all([
    db.from("profile").select("full_name, is_admin").eq("id", user.id).maybeSingle(),
    db.from("aircraft").select("id, tail_number, make, model").order("tail_number"),
  ]);
  return <PublicTheme header={false}>
    <HangarShell user={user} profile={profile} fleet={fleet ?? []}>
      <div data-section="setup" className="h-dvh overflow-y-auto bg-board p-3 sm:p-6">
        <div id="main-content" className="mx-auto max-w-4xl rounded-leaf bg-leaf text-ink shadow-leaf">{children}</div>
      </div>
    </HangarShell>
  </PublicTheme>;
}

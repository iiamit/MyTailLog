import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { HangarPhoneBar, HangarRail } from "@/ui/HangarRail";
import type { RailAircraft } from "@/ui/Rail";

/** "Dana Morgan" → "Dana M."; falls back to the email's local part. */
export function shortName(full: string | null | undefined, email: string | undefined) {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0]} ${parts[parts.length - 1][0]}.`;
  return parts[0] ?? email?.split("@")[0] ?? "Account";
}

/** The signed-in user, their profile and every aircraft they can open, for the hangar-level screens. */
export async function loadHangarUser(next: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  const [{ data: profile }, { data: fleet }] = await Promise.all([
    supabase.from("profile").select("full_name, is_admin").eq("id", user.id).maybeSingle(),
    supabase.from("aircraft").select("id, tail_number, make, model, year, owner_id, is_demo").order("tail_number"),
  ]);
  return { supabase, user: user as User, profile, fleet: fleet ?? [] };
}

/** Hangar rail on the left, the board on the right (03 §3.5). Account screens always use the hangar rail here. */
export function HangarShell({
  user,
  profile,
  fleet,
  children,
}: {
  user: User;
  profile: { full_name: string | null; is_admin: boolean | null } | null;
  fleet: { id: string; tail_number: string; make: string | null; model: string | null }[];
  children: React.ReactNode;
}) {
  const aircraft: RailAircraft[] = fleet.map((a) => ({ id: a.id, tail: a.tail_number, model: [a.make, a.model].filter(Boolean).join(" ") }));
  return (
    <div className="flex h-dvh max-md:flex-col">
      <HangarRail userName={shortName(profile?.full_name, user.email)} aircraft={aircraft} isAdmin={Boolean(profile?.is_admin)} />
      <HangarPhoneBar />
      <div className="min-h-0 min-w-0 flex-1">{children}</div>
    </div>
  );
}

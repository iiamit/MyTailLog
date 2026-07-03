import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ShareClient, type ShareRow } from "./ShareClient";

export default async function SharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/aircraft/${id}/share`);

  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("id, tail_number, owner_id")
    .eq("id", id)
    .single();
  if (!aircraft) notFound();

  // Sharing is owner-only; a shared user who navigates here goes back.
  if (aircraft.owner_id !== user.id) redirect(`/aircraft/${id}`);

  const { data: shares } = await supabase
    .from("aircraft_share")
    .select("id, invited_email, role, created_at")
    .eq("aircraft_id", id)
    .order("created_at", { ascending: true });

  const rows: ShareRow[] = (shares ?? []).map((s) => ({
    id: s.id,
    email: s.invited_email,
    role: s.role,
  }));

  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <Link
        href={`/aircraft/${id}`}
        className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        ← {aircraft.tail_number}
      </Link>
      <header className="mb-6 mt-2">
        <h1 className="text-2xl font-bold">Sharing &amp; transfer</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Invite people to view or contribute to {aircraft.tail_number}, or hand the aircraft to a
          new owner.
        </p>
      </header>

      <ShareClient aircraftId={id} tail={aircraft.tail_number} shares={rows} />
    </main>
  );
}

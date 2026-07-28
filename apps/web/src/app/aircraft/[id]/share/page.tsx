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

  const ownerEmail = user.email ?? "";

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">Manage</div>
          <h1 className="font-display text-[27px] font-semibold leading-none">
            Sharing, transfer &amp; delete
          </h1>
          <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-dim">
            Invite people to view or contribute to {aircraft.tail_number}, hand the aircraft to a new
            owner, or delete it.
          </p>
        </div>
      </header>

      <ShareClient aircraftId={id} tail={aircraft.tail_number} shares={rows} ownerEmail={ownerEmail} />
    </main>
  );
}

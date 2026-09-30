import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DetailsForm } from "./DetailsForm";

export default async function AircraftDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/aircraft/${id}/details`);
  const { data: aircraft } = await supabase.from("aircraft")
    .select("id, owner_id, tail_number, make, model, year, serial_number, engine_serials, prop_serials, home_base")
    .eq("id", id).maybeSingle();
  if (!aircraft) notFound();
  if (aircraft.owner_id !== user.id) redirect(`/aircraft/${id}`);

  return <main className="mx-auto max-w-2xl px-6 py-8">
    <Link href={`/aircraft/${id}`} className="text-sm text-accent">← Aircraft overview</Link>
    <h1 className="mt-5 font-display text-2xl font-semibold">Edit {aircraft.tail_number} details</h1>
    <p className="mt-2 text-sm text-dim">Add or correct the details you skipped during enrollment. Check serial numbers against the aircraft and component records.</p>
    <DetailsForm aircraft={aircraft} />
  </main>;
}

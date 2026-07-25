import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAircraftShellContext } from "@/lib/aircraftContext";
import { SquawksClient } from "./SquawksClient";

export default async function SquawksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const ctx = await getAircraftShellContext(supabase, id);
  if (!ctx) notFound();

  const { data: squawks } = await supabase
    .from("squawk")
    .select("id, description, severity, status, reporter_name, reported_at, resolved_at, resolution_notes")
    .eq("aircraft_id", id)
    .order("reported_at", { ascending: false });

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6">
        <div className="eyebrow mb-2">Records</div>
        <h1 className="font-display text-[27px] font-semibold leading-none">Squawks</h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-dim">
          Track discrepancies noticed in flight — a rough mag, a sticky switch, a small leak.
          Anyone with access can report one; it stays open until a mechanic clears it.
        </p>
      </header>

      <SquawksClient aircraftId={id} canEdit={ctx.canEdit} squawks={squawks ?? []} />
    </main>
  );
}

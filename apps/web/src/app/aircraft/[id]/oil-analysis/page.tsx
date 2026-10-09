import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAircraftShellContext } from "@/lib/aircraftContext";
import { OilAnalysisClient } from "./OilAnalysisClient";
import { OilConsumptionClient } from "./OilConsumptionClient";
import { EngineTrends } from "./EngineTrends";
import { loadLogEntries } from "@/lib/loadLogEntries";

export default async function OilAnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const ctx = await getAircraftShellContext(supabase, id);
  if (!ctx) notFound();

  // Oldest → newest so trend charts read left-to-right; the client shows the
  // latest first in the table.
  const [{ data: samples }, { data: additions }, entries, { data: resets }] = await Promise.all([
    supabase.from("oil_analysis_sample").select("*").eq("aircraft_id", id).order("sample_date", { ascending: true }),
    supabase.from("oil_addition").select("*").eq("aircraft_id", id).order("added_date", { ascending: true }),
    loadLogEntries(supabase, id),
    supabase.from("meter_reset").select("meter, reset_date").eq("aircraft_id", id),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <div className="eyebrow mb-2">Aircraft</div>
        <h1 className="font-display text-[27px] font-semibold leading-none">Oil &amp; engine trends</h1>
        <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-dim">
          Import your lab reports (Blackstone, AVLab, …) to track wear-metal trends over
          time. Values are read from the report by AI — confirm anything important against the
          original, and treat the lab&apos;s own written assessment as authoritative.
        </p>
      </header>

      <OilAnalysisClient
        aircraftId={id}
        canEdit={ctx.canEdit}
        samples={samples ?? []}
      />

      <OilConsumptionClient
        aircraftId={id}
        canEdit={ctx.canEdit}
        additions={additions ?? []}
        bridge={ctx.bridge}
        currentTach={ctx.tach}
        currentHobbs={ctx.hobbs}
      />
      <EngineTrends aircraftId={id} entries={entries} resets={resets ?? []} />
    </main>
  );
}

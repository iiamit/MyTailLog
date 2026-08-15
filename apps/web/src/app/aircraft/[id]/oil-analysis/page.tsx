import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAircraftShellContext } from "@/lib/aircraftContext";
import { toReadings } from "@/lib/aircraftHours";
import { tachBridge } from "@/lib/hobbsTach";
import { OilAnalysisClient } from "./OilAnalysisClient";
import { OilConsumptionClient } from "./OilConsumptionClient";

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
  const [{ data: samples }, { data: additions }, { data: entries }, { data: readings }] =
    await Promise.all([
      supabase.from("oil_analysis_sample").select("*").eq("aircraft_id", id).order("sample_date", { ascending: true }),
      supabase.from("oil_addition").select("*").eq("aircraft_id", id).order("added_date", { ascending: true }),
      supabase.from("log_entry").select("id, entry_date, hobbs, tach, airframe, hours_reviewed_at").eq("aircraft_id", id),
      supabase
        .from("hours_reading")
        .select("id, reading_date, hobbs, tach, airframe, hours_reviewed_at, source")
        .eq("aircraft_id", id),
    ]);

  // Lets a hobbs-only top-off still be measured in TACH — the meter oil burn
  // actually follows — instead of being dropped or dragging the series onto
  // hobbs. Derived on read, never stored: the moment a real tach is logged it
  // replaces the estimate on its own.
  const bridge = tachBridge(toReadings(entries ?? [], readings ?? []));

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <div className="eyebrow mb-2">Aircraft</div>
        <h1 className="font-display text-[27px] font-semibold leading-none">Oil analysis</h1>
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
        bridge={bridge}
        currentTach={ctx.tach}
        currentHobbs={ctx.hobbs}
      />
    </main>
  );
}

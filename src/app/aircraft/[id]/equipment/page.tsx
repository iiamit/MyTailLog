import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EquipmentClient } from "./EquipmentClient";

export default async function EquipmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("id, tail_number")
    .eq("id", id)
    .single();
  if (!aircraft) notFound();

  const { data: components } = await supabase
    .from("component")
    .select("*")
    .eq("aircraft_id", id)
    .order("is_installed", { ascending: false })
    .order("category", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  // AD counts linked to each component, so the UI can warn what removal affects.
  const { data: linkedAds } = await supabase
    .from("ad_compliance")
    .select("component_id")
    .eq("aircraft_id", id)
    .not("component_id", "is", null);
  const adCountByComponent: Record<string, number> = {};
  for (const a of linkedAds ?? []) {
    if (a.component_id)
      adCountByComponent[a.component_id] = (adCountByComponent[a.component_id] ?? 0) + 1;
  }

  // Pending, log-derived proposals awaiting the owner's confirmation.
  const { data: proposals } = await supabase
    .from("equipment_proposal")
    .select("*")
    .eq("aircraft_id", id)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">Records</div>
          <h1 className="font-display text-[27px] font-semibold leading-none">
            Installed equipment
          </h1>
          <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-dim">
            Track what&apos;s currently installed and what&apos;s been removed. This
            drives AD applicability — removing a component marks its Airworthiness
            Directives no longer applicable (with the removal date), and installed
            equipment surfaces the ADs that apply to it.
          </p>
        </div>
      </header>

      <EquipmentClient
        aircraftId={id}
        components={components ?? []}
        adCountByComponent={adCountByComponent}
        proposals={proposals ?? []}
        extractionConfigured={Boolean(process.env.ANTHROPIC_API_KEY)}
      />
    </main>
  );
}

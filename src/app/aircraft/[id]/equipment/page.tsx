import Link from "next/link";
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
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href={`/aircraft/${id}`}
        className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        ← {aircraft.tail_number}
      </Link>

      <header className="mt-2 mb-6">
        <h1 className="text-2xl font-bold">Installed equipment</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Track what&apos;s currently installed and what&apos;s been removed. This
          drives AD applicability — removing a component marks its Airworthiness
          Directives no longer applicable (with the removal date), and installed
          equipment surfaces the ADs that apply to it.
        </p>
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

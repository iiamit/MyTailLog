import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ExploreClient } from "./ExploreClient";

export default async function ExplorePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("id, tail_number, make")
    .eq("id", id)
    .single();
  if (!aircraft) notFound();

  const { data: components } = await supabase
    .from("component")
    .select("make")
    .eq("aircraft_id", id)
    .eq("is_installed", true);
  const makes = [
    ...new Set(
      [aircraft.make, ...(components ?? []).map((c) => c.make)]
        .map((m) => m?.trim())
        .filter((m): m is string => !!m),
    ),
  ];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href={`/aircraft/${id}/compliance`}
        className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        ← AD / SB compliance
      </Link>

      <header className="mt-2 mb-6">
        <h1 className="text-2xl font-bold">Explore applicable ADs</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Search the Federal Register for Airworthiness Directives by
          manufacturer — the airframe make and your installed equipment&apos;s
          makes. This is a starting point, not a determination: confirm which
          actually apply to your serial numbers, then track them.
        </p>
      </header>

      <ExploreClient aircraftId={id} suggestedMakes={makes} />
    </main>
  );
}

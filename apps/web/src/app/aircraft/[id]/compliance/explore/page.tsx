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
    .select("id, tail_number, make, model")
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
      <header className="mt-2 mb-6">
        <h1 className="text-2xl font-bold">Explore applicable ADs</h1>
        <p className="text-sm text-dim">
          Search for Airworthiness Directives by <strong>manufacturer</strong> —
          the airframe make and your installed equipment&apos;s makes — and by{" "}
          <strong>model</strong> or a keyword. The manufacturer search is the
          broad net; the model search is the sharp one, and each result lists the
          models the AD actually names. This is a starting point, not a
          determination: applicability is your and your A&amp;P&apos;s call —
          confirm against the AD itself (serial numbers, installed equipment),
          then track what applies.
        </p>
      </header>

      <ExploreClient
        aircraftId={id}
        suggestedMakes={makes}
        aircraftModel={aircraft.model ?? ""}
      />
    </main>
  );
}

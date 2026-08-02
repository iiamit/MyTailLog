import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMeters, getLatestMfbReading } from "@/lib/aircraftHours";
import { buildStatusItems, sortStatusItems } from "@/lib/status";
import { MaintenanceClient } from "./MaintenanceClient";

export default async function MaintenancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: aircraft } = await supabase
    .from("aircraft")
    .select("id, tail_number, enrollment_hobbs, enrollment_tach, enrollment_airframe, enrollment_date")
    .eq("id", id)
    .single();
  if (!aircraft) notFound();

  const { data: items } = await supabase
    .from("maintenance_item")
    .select("*")
    .eq("aircraft_id", id);

  // Recurring ADs that have a next-due join the same forecast list.
  const { data: ads } = await supabase
    .from("ad_compliance")
    .select("id, reference, kind, next_due_date, next_due_hours, status, verified_report_page_id, verified_at")
    .eq("aircraft_id", id)
    .eq("recurring", true)
    .not("status", "in", "(not_applicable,superseded)");

  // Both meters, reconciled from hobbs/tach readings. Regulatory items count
  // down on tach; usage items (oil) on hobbs.
  const { tach: ct, hobbs: ch, airframe: ca, baselineFor, toTotalHours, utilization } = await getCurrentMeters(supabase, id, {
    hobbs: aircraft.enrollment_hobbs,
    tach: aircraft.enrollment_tach,
    airframe: aircraft.enrollment_airframe,
    date: aircraft.enrollment_date,
  });

  // Latest reading synced from MyFlightBook, for an honest "as of <date>" note.
  const mfbReading = await getLatestMfbReading(supabase, id);

  // Unified due list (maintenance items + recurring ADs), sorted by urgency.
  const dueItems = sortStatusItems(
    buildStatusItems(items ?? [], ads ?? [], {
      tach: ct.tach,
      hobbs: ch.hobbs,
      airframe: ca.airframe,
      tachEstimated: ct.estimated,
      hobbsEstimated: ch.estimated,
      baselineFor,
      toTotalHours,
    }),
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">Airworthiness</div>
          <h1 className="font-display text-[27px] font-semibold leading-none">
            Maintenance forecast
          </h1>
          <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-dim">
            Standard Part 91 recurring items and recurring ADs, sorted by urgency.
            Advisory items (TBO, overhaul) are informational, not regulatory. Due
            dates are only as accurate as the last-done data you enter — verify
            against the physical logbooks.
          </p>
          {utilization.confidence !== "none" && (
            <p className="mt-2 max-w-xl text-[12.5px] leading-relaxed text-faint">
              Hours-based items also show <strong>≈ a calendar date</strong>, projected from
              how much this aircraft has actually flown over the past year. It is a{" "}
              <strong>planning estimate, not a determination</strong> — the hours figure is
              what comes due. Hover a projection to see the readings it came from.
            </p>
          )}
        </div>
      </header>

      <MaintenanceClient
        aircraftId={id}
        items={items ?? []}
        dueItems={dueItems}
        currentTach={ct.tach}
        currentHobbs={ch.hobbs}
        currentAirframe={ca.airframe}
        currentTachEstimated={ct.estimated}
        currentTachRough={ct.rough}
        currentHobbsEstimated={ch.estimated}
        utilization={utilization}
        mfbReading={mfbReading}
        extractionConfigured={Boolean(process.env.ANTHROPIC_API_KEY)}
      />
    </main>
  );
}

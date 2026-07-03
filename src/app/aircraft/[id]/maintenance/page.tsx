import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentHours } from "@/lib/aircraftHours";
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
    .select("id, tail_number, enrollment_hobbs, enrollment_tach")
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
    .select("id, reference, kind, next_due_date, next_due_hours, status")
    .eq("aircraft_id", id)
    .eq("recurring", true)
    .not("status", "in", "(not_applicable,superseded)");

  // Current hours = highest reading across hobbs AND tach (total time is often
  // recorded in tach), else the enrollment readings.
  const currentHours = await getCurrentHours(supabase, id, {
    hobbs: aircraft.enrollment_hobbs,
    tach: aircraft.enrollment_tach,
  });

  // Unified due list (maintenance items + recurring ADs), sorted by urgency.
  const dueItems = sortStatusItems(
    buildStatusItems(items ?? [], ads ?? [], currentHours),
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href={`/aircraft/${id}`}
        className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        ← {aircraft.tail_number}
      </Link>

      <header className="mt-2 mb-6">
        <h1 className="text-2xl font-bold">Maintenance forecast</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Standard Part 91 recurring items and recurring ADs, sorted by urgency.
          Advisory items (TBO, overhaul) are informational, not regulatory. Due
          dates are only as accurate as the last-done data you enter — verify
          against the physical logbooks.
        </p>
      </header>

      <MaintenanceClient
        aircraftId={id}
        items={items ?? []}
        dueItems={dueItems}
        currentHours={currentHours}
        extractionConfigured={Boolean(process.env.ANTHROPIC_API_KEY)}
      />
    </main>
  );
}

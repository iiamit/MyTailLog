import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { urgencyOf, type Urgency } from "@/lib/compliance";
import { effectiveNextDue } from "@/lib/maintenance";
import { getCurrentHours } from "@/lib/aircraftHours";
import { MaintenanceClient, type DueItem } from "./MaintenanceClient";

const URGENCY_RANK: Record<Urgency, number> = {
  overdue: 0,
  due_soon: 1,
  upcoming: 2,
  none: 3,
};

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

  // Build the unified due list. The 100-hour resets off the last annual too, so
  // its effective next-due considers the annual's last-done hours.
  const allItems = items ?? [];
  const dueItems: DueItem[] = [];
  for (const m of allItems) {
    const due = effectiveNextDue(m, allItems);
    dueItems.push({
      id: m.id,
      source: "maintenance",
      label: m.label,
      kind: m.kind,
      regulatory: m.regulatory,
      intervalMonths: m.interval_months,
      intervalHours: m.interval_hours,
      lastDoneDate: m.last_done_date,
      lastDoneHours: m.last_done_hours,
      nextDueDate: due.next_due_date,
      nextDueHours: due.next_due_hours,
      notes: m.notes,
      urgency: urgencyOf(due, currentHours),
    });
  }
  for (const a of ads ?? []) {
    dueItems.push({
      id: a.id,
      source: "ad",
      label: `${a.kind.toUpperCase()} ${a.reference}`,
      kind: "ad",
      regulatory: true,
      intervalMonths: null,
      intervalHours: null,
      lastDoneDate: null,
      lastDoneHours: null,
      nextDueDate: a.next_due_date,
      nextDueHours: a.next_due_hours,
      notes: null,
      urgency: urgencyOf(
        { next_due_date: a.next_due_date, next_due_hours: a.next_due_hours },
        currentHours,
      ),
    });
  }

  // Sort by urgency, then soonest next-due date.
  dueItems.sort(
    (a, b) =>
      URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] ||
      (a.nextDueDate ?? "9999").localeCompare(b.nextDueDate ?? "9999"),
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

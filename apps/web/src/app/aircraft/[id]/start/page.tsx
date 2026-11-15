import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMeters } from "@/lib/aircraftHours";
import { getAircraftRole, canEditRole } from "@/lib/access";
import { buildStatusItems, sortStatusItems } from "@/lib/status";
import { dueText } from "@/lib/compliance";
import { DEFAULT_SEED_KINDS, STANDARD_ITEMS } from "@/lib/maintenance";
import { startProgress } from "@/lib/startProgress";
import { StartClient, type StatusRow } from "./StartClient";

export const metadata = { title: "Get started — MyTailLog" };

// Guided first session: current hours → last annual → status. Each step's
// state is derived from the aircraft's data, so the page can be left and
// resumed, and it's skippable (the overview shows a "Finish setup" chip).
export default async function StartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: aircraft } = await supabase.from("aircraft").select("*").eq("id", id).single();
  if (!aircraft) notFound();
  const role = await getAircraftRole(supabase, id, aircraft.owner_id);
  if (!canEditRole(role)) redirect(`/aircraft/${id}`);

  const [{ data: logbooks }, { data: items }, { count: readings }] = await Promise.all([
    supabase.from("logbook").select("id, type").eq("aircraft_id", id),
    supabase.from("maintenance_item").select("*").eq("aircraft_id", id),
    supabase.from("hours_reading").select("id", { count: "exact", head: true }).eq("aircraft_id", id),
  ]);

  const progress = startProgress(aircraft, readings ?? 0, items ?? []);
  const step = !progress.hours ? 1 : !progress.annual ? 2 : 3;

  const { tach, hobbs, airframe, baselineFor, toTotalHours } = await getCurrentMeters(supabase, id, {
    hobbs: aircraft.enrollment_hobbs,
    tach: aircraft.enrollment_tach,
    airframe: aircraft.enrollment_airframe,
    date: aircraft.enrollment_date,
  });

  const status = sortStatusItems(
    buildStatusItems(items ?? [], [], {
      tach: tach.tach,
      hobbs: hobbs.hobbs,
      airframe: airframe.airframe,
      tachEstimated: tach.estimated,
      hobbsEstimated: hobbs.estimated,
      airframeEstimated: airframe.estimated,
      baselineFor,
      toTotalHours,
    }),
  );
  const rows: StatusRow[] = DEFAULT_SEED_KINDS.map((kind) => {
    const s = status.find((x) => x.kind === kind && x.lastDoneDate);
    const label = STANDARD_ITEMS.find((x) => x.kind === kind)?.label ?? kind;
    return s
      ? { kind, label: s.label, urgency: s.urgency, due: dueText(s.nextDueDate, s.nextDueForItem, s.currentForItem) ?? "not scheduled", known: true }
      : { kind, label, urgency: "none", due: "", known: false };
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6">
        <div className="eyebrow mb-2">Get started · {aircraft.tail_number}</div>
        <h1 className="font-display text-[27px] font-semibold leading-tight">Set up status in three steps</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-dim">
          Your current hours and the date of your last annual are enough to start counting down
          what&apos;s due. You can scan the rest of your logbooks afterwards.{" "}
          <Link href={`/aircraft/${id}`} className="text-accent hover:opacity-80">Skip for now</Link>
        </p>
      </header>
      <StartClient
        aircraftId={id}
        tail={aircraft.tail_number}
        step={step}
        airframeLogbookId={logbooks?.find((l) => l.type === "airframe")?.id ?? null}
        tach={tach.tach}
        hobbs={hobbs.hobbs}
        rows={rows}
      />
    </main>
  );
}
